// Online 1 gegen 1 (18.11.): zwei Spieler auf zwei Geräten, verbunden über die Live-Verbindung des Claude-Artefakts
// (room-Capability, net.js). Rein: kein DOM, kein Netz. Hier stehen Codes, Runden, Armee-Pakete und der Ablauf als
// Zustandsmaschine; ui/online.js verbindet sie mit Raum und Oberfläche.
//
// Gesprochen wird nur über presence (jeder Spieler veröffentlicht ein Objekt, der andere liest es). Das dürfen alle, die
// das Artefakt sehen, auch reine Betrachter; Ereignis-Themen bräuchten Mitwirkenden-Rechte.
//   Host (erstellt den Raum) = Blau links, Gast = Rot rechts.
//   Runde: Der Host lost { r, seed, budget, opts } aus: drei Regeln und drei Karten (rules.js). Beide stimmen ab (vote),
//   gleiche Stimme gewinnt, sonst das Los; der Host trägt das Ergebnis als cat (Regel-id) und map ein. Beide malen verdeckt (die Welt des einen enthält nur die eigene
//   Armee), „Fertig“ = ready. Sind beide fertig, tauschen sie ihre Armee in Stücken (arm/got) und starten denselben Kampf
//   (gleiche Aufstellung in gleicher Reihenfolge, gleiche Saat; die Simulation ist deterministisch).
//   Ergebnis: jeder meldet res; der Host zählt und veröffentlicht score. Nächste Runde, wenn beide want = r + 1 melden.
import { UNITS } from './data.js';
import { SHAPES, SHAPE_MIN_UNITS } from './shapes.js';
import { UNIT_CAP } from './paint.js';
import { RULES, RULE_IDS, MAP_IDS, ruleDef, ruleAllows, ruleBudget, draw, resolveVote, rulePool, RULE_GROUP_IDS } from './rules.js';

export const PROTO = 3;   // 2: Abstimmung über Regel und Karte; 3: Einstellungen der Partie (set) und Regeländerung im Spiel
export const ROOM_PREFIX = 'ks1v1-';
// cfg.cat ist die id einer Regel (rules.js); die vier Kategorien sind Regeln mit derselben id
export const ONLINE_CATS = RULE_IDS;
export const CAT_NAME = Object.fromEntries(RULES.map(r => [r.id, r.n]));
export const VOTE_N = 3;   // Auswahl je Runde: so viele Regeln und Karten
export const ONLINE_BUDGETS = [100, 150, 250, 400];
export const ONLINE_DEFAULT = 150;
export const CHUNK = 2800;                 // Zeichen je Armee-Stück (presence hat 4 KiB je Spieler)
export const SIDE = { host: 'blau', guest: 'rot' };
// Emotes (25.11.): kleine Reaktionen, die beim Gegner übers Feld fliegen. presence emo = { n: Zähler, k: Index }
export const EMOTES = ['😂', '🔥', '😱', '👏', '🙈', '😎'];
export const EMOTE_GAP = 600;   // ms zwischen zwei eigenen Emotes
const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // ohne I, L, O, 0, 1
const EPS = 1e-6;

/* ---------- Raumcodes ---------- */
export function makeCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_ABC[Math.floor(rand() * CODE_ABC.length) % CODE_ABC.length];
  return s;
}
// Eingabe → Code (4 Zeichen) oder null
export function normCode(text) {
  const s = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === 4 && [...s].every(c => CODE_ABC.includes(c)) ? s : null;
}
export const roomName = code => ROOM_PREFIX + code.toLowerCase();

/* ---------- Einstellungen der Partie (Lobby, 25.11.) ---------- */
// set: { budget, pick, rules, maps, time, goal }. Der Host legt sie beim Erstellen fest; im Spiel kann jeder eine Änderung
// vorschlagen (proposeSet), der andere nimmt an oder lehnt ab (answerProp). Neue Einstellungen gelten ab der nächsten
// Auslosung; läuft gerade eine Abstimmung, wird sie mit den neuen Einstellungen neu ausgelost.
//   pick: 'vote' (beide stimmen ab) | 'random' (Regel und Karte ausgelost) | 'loser' (wer die letzte Runde verlor, wählt allein)
//   rules: Regel-Gruppen (rules.js RULE_GROUPS), maps: 'alle' | 'feld' (nur offenes Feld)
//   time: Sekunden zum Malen (0: ohne Limit), goal: Siege für den Matchgewinn (0: endlos)
export const PICKS = ['vote', 'random', 'loser'];
export const MAP_MODES = ['alle', 'feld'];
export const TIMES = [0, 60, 90, 120];
export const GOALS = [0, 2, 3];
export const DEFAULT_SET = Object.freeze({ budget: ONLINE_DEFAULT, pick: 'vote', rules: [...RULE_GROUP_IDS], maps: 'alle', time: 0, goal: 0 });
// Beliebige Eingabe → gültige Einstellungen (Unbekanntes fällt auf den Standard zurück)
export function cleanSet(s) {
  const o = s && typeof s === 'object' && !Array.isArray(s) ? s : {};
  const rules = Array.isArray(o.rules) ? RULE_GROUP_IDS.filter(g => o.rules.includes(g)) : [];
  return {
    budget: ONLINE_BUDGETS.includes(o.budget) ? o.budget : ONLINE_DEFAULT,
    pick: PICKS.includes(o.pick) ? o.pick : 'vote',
    rules: rules.length ? rules : [...RULE_GROUP_IDS],
    maps: MAP_MODES.includes(o.maps) ? o.maps : 'alle',
    time: TIMES.includes(o.time) ? o.time : 0,
    goal: GOALS.includes(o.goal) ? o.goal : 0,
  };
}
export const sameSet = (a, b) => JSON.stringify(cleanSet(a)) === JSON.stringify(cleanSet(b));
// Was sich ändert: [{ k, a, b }] (k: budget | pick | rules | maps | time | goal)
export function setDiff(a, b) {
  const x = cleanSet(a), y = cleanSet(b), out = [];
  for (const k of Object.keys(x)) if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) out.push({ k, a: x[k], b: y[k] });
  return out;
}
// Einstellungen aus Zahl (altes Budget) oder Objekt
const asSet = v => cleanSet(typeof v === 'number' ? { budget: v } : v);

/* ---------- Runden ---------- */
// Nächste Runde zur Abstimmung: drei Regeln (nie die der letzten Runde) und drei Karten; neue Saat für den Kampf.
// set darf auch nur ein Budget sein. chooser: Seite, die allein wählt (Einstellung „Verlierer wählt“).
export function nextRound(prev, set, rand = Math.random, chooser = null) {
  const st = asSet(set);
  const seed = (rand() * 2 ** 31) | 0, rules = draw(rulePool(st.rules), VOTE_N, rand, prev && prev.cat);
  const maps = st.maps === 'feld' ? ['feld'] : draw(MAP_IDS, VOTE_N, rand);
  const c = { r: prev ? prev.r + 1 : 1, seed, budget: st.budget, opts: { rules, maps }, cat: null, map: null, agreed: null };
  if (st.time) c.time = st.time;
  if (st.pick === 'random') { c.cat = c.opts.rules[0]; c.map = c.opts.maps[0]; c.drawn = true; }
  else if (st.pick === 'loser' && (chooser === 'blau' || chooser === 'rot')) c.chooser = chooser;
  return c;
}
// Revanche: dieselbe Regel, Karte und dasselbe Budget, neue Saat; beide malen neu
export function rematchRound(prev, rand = Math.random) {
  const { chooser, drawn, rev, ...rest } = prev;
  return { ...rest, r: prev.r + 1, seed: (rand() * 2 ** 31) | 0, agreed: { rule: true, map: true }, rematch: true };
}
// Runde mit Regel und Karte gleich ausgelost (ohne Abstimmung, für Tests und Zufall)
export function randomRound(prev, budget, rand = Math.random) {
  const { drawn, ...c } = nextRound(prev, budget, rand);
  return { ...c, cat: c.opts.rules[0], map: c.opts.maps[0] };
}
// Level-artiges Objekt für die Malleiste und paint.js (campaign/index.js unitAllowed, catAllowed): die Regel der Runde
// Budget, mit dem in der Runde gemalt wird (Grundbudget × Faktor der Regel)
export const budgetOf = cfg => ruleBudget(cfg.cat, cfg.budget);
export const roundDef = cfg => ({ ...ruleDef(cfg.cat), budget: budgetOf(cfg) });

/* ---------- Armee-Pakete ---------- */
// Jede Einheit in 5 Bytes: Typ (6 Bit) + Form (2 Bit), x und y als 16 Bit in Anteilen der Welt. Base64url.
// Die Reihenfolge ist Teil des Codes: einmal vergebene Indizes bleiben fest (PAINT_FIXED), neue Einheiten kommen hinten dran,
// egal wo sie in data.js stehen. Neue Einheiten bei Gelegenheit hier ans Ende von PAINT_FIXED anhängen.
const PAINT_FIXED = ('krieger schuetze ritter grenadier reiter roemer sani wolf baer biene magier geist drache vampir soldat mg sniper '
  + 'panzerfaust moerser panzer heli troll zyklop hexe phoenix einhorn elefant krokodil gorilla adler bueffel minibot laserbot drohne '
  + 'kuppel spinne schweisser magnet tesla mega hoehle speer schamane raptor ptera anky trike rex koenig jet kampfdrohne bomber lama flamme pikenier trommler stinktier').split(' ');
const paintable = t => UNITS[t] && UNITS[t].paint !== false;
export const PAINT_TYPES = [...PAINT_FIXED, ...Object.keys(UNITS).filter(t => paintable(t) && !PAINT_FIXED.includes(t))];
const SHAPE_KEYS = [null, ...Object.keys(SHAPES)];
const Q = 65535;
const qz = (v, M) => Math.round(Math.max(0, Math.min(1, v / M)) * Q);
const dq = (v, M) => v / Q * M;

function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64(str) {
  const t = str.replace(/-/g, '+').replace(/_/g, '/');
  const s = typeof atob === 'function' ? atob(t + '==='.slice((t.length + 3) % 4)) : Buffer.from(t, 'base64').toString('binary');
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// Eigene Armee (lebende, malbare Einheiten der Seite) → Text
export function packArmy(world, side) {
  return packUnits(world.units.filter(u => u.alive && u.team === side && UNITS[u.type].paint !== false), world.W, world.H);
}
// Einheitenliste [{ type, x, y, shape }] → Text (auch für die KI, bot.js)
export function packUnits(us, W, H) {
  us = us.filter(u => PAINT_TYPES.includes(u.type));
  const bytes = new Uint8Array(us.length * 5);
  us.forEach((u, k) => {
    const ti = PAINT_TYPES.indexOf(u.type), si = Math.max(0, SHAPE_KEYS.indexOf(u.shape || null));
    const x = qz(u.x, W), y = qz(u.y, H), o = k * 5;
    bytes[o] = (ti & 63) | (si << 6);
    bytes[o + 1] = x >> 8; bytes[o + 2] = x & 255; bytes[o + 3] = y >> 8; bytes[o + 4] = y & 255;
  });
  return b64(bytes);
}

// Text → [{ type, team, x, y, shape }]. Wirft bei kaputten Daten. Prüft die Seite (eigene Hälfte), Obergrenze,
// Budget und Mindestzahl je Formationsbonus, damit ein veränderter Client nicht schummelt.
export function unpackArmy(text, side, W, H, cfg) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('Armee unlesbar');
  if (text.length > Math.ceil(UNIT_CAP * 5 * 4 / 3) + 4) throw new Error('Zu viele Einheiten');
  const bytes = unb64(text);
  if (bytes.length > UNIT_CAP * 5) throw new Error('Zu viele Einheiten');
  if (bytes.length % 5) throw new Error('Armee unvollständig');
  const out = [], sc = new Map();
  const maxCost = cfg ? budgetOf(cfg) + EPS : Infinity;
  let cost = 0;
  for (let o = 0; o < bytes.length; o += 5) {
    const type = PAINT_TYPES[bytes[o] & 63], shape = SHAPE_KEYS[bytes[o] >> 6] || null;
    if (!type) throw new Error('Unbekannte Einheit');
    if (cfg && !ruleAllows(cfg.cat, type)) throw new Error('Einheit nicht in der Kategorie');
    const x = dq((bytes[o + 1] << 8) | bytes[o + 2], W), y = dq((bytes[o + 3] << 8) | bytes[o + 4], H);
    if (side === 'blau' ? x > W / 2 + 1 : x < W / 2 - 1) throw new Error('Einheit auf der falschen Seite');
    cost += UNITS[type].cost;
    if (cost > maxCost) throw new Error('Budget überschritten');
    if (shape) { const k = type + '|' + shape; sc.set(k, (sc.get(k) || 0) + 1); }
    out.push({ type, team: side, x, y, shape });
  }
  for (const u of out) if (u.shape && (sc.get(u.type + '|' + u.shape) || 0) < SHAPE_MIN_UNITS) u.shape = null;
  return out;
}
export const splitChunks = (s, n = CHUNK) => { const out = []; for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n)); return out.length ? out : ['']; };

// Beide Armeen in fester Reihenfolge (Blau, dann Rot): so stellen beide Geräte dieselbe Welt auf
export function battleList(blau, rot) { return [...blau, ...rot]; }

/* ---------- Ablauf ---------- */
// phase: 'wait' (Host wartet auf Gegner / Gast auf die erste Runde) → 'vote' (Regel und Karte wählen) → 'paint' → 'ready' (fertig, Gegner malt noch) →
// 'xfer' (Armeen werden getauscht) → 'fight' → 'result'. 'left': der Gegner ist weg.
// set: Einstellungen (oder nur ein Budget); der Gast übernimmt sie vom Host
export function createMatch(role, set = ONLINE_DEFAULT, rand = Math.random) {
  const st = asSet(set);
  return {
    role, side: SIDE[role], set: st, budget: st.budget, rand, prop: null, propN: 0, peerProp: null, peerPropN: 0, ans: null, match: 1,
    phase: 'wait', cfg: null, score: { blau: 0, rot: 0 }, mine: null, chunks: null, recv: [], theirs: null,
    res: null, peerRes: null, want: 0, same: false, counted: 0, error: null, vote: null, peerVote: null, gave: 0, peerGave: false,
    emo: null, emoAt: -Infinity, peerEmoN: 0, peerEmo: null,
  };
}
const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

// Was ich veröffentliche (presence-Objekt)
export function view(m) {
  const r = m.cfg ? m.cfg.r : 0, o = { ks: PROTO, role: m.role, ready: 0, arm: null, got: null, res: null, want: m.want, same: m.same };
  if (m.role === 'host') { o.cfg = m.cfg; o.score = m.score; o.set = m.set; o.match = m.match; }
  if (m.prop) o.prop = m.prop;
  if (m.ans) o.ans = m.ans;
  if (m.mine !== null && (m.phase === 'ready' || m.phase === 'xfer' || m.phase === 'fight' || m.phase === 'result')) o.ready = r;
  if (m.phase === 'xfer' || m.phase === 'fight' || m.phase === 'result') {
    o.got = { r, n: m.recv.length };
    if (m.chunks) { const i = Math.min(m.sendI || 0, m.chunks.length - 1); o.arm = { r, n: m.chunks.length, i, d: m.chunks[i] }; }
  }
  if (m.res) o.res = m.res;
  if (m.gave) o.gave = m.gave;
  o.vote = m.vote && m.cfg ? { r, rule: m.vote.rule, map: m.vote.map } : null;
  if (m.emo) o.emo = m.emo;
  return o;
}

function newRound(m, cfg) {
  m.cfg = cfg; m.phase = cfg.cat ? 'paint' : 'vote'; m.vote = null; m.peerVote = null; m.same = false; m.peerWant = null; m.mine = null; m.chunks = null; m.sendI = 0; m.recv = []; m.theirs = null;
  m.res = null; m.peerRes = null; m.error = null; m.peerReady = false; m.peerVoted = false; m.gave = 0; m.peerGave = false;
}

// Gegner ist da (Host): erste Runde würfeln. Liefert Ereignisse.
export function hostStart(m) {
  if (m.role !== 'host' || m.cfg) return [];
  newRound(m, nextRound(null, m.set, m.rand));
  return [m.cfg.cat ? 'round' : 'vote'];
}

// Eigene Stimme: eine der angebotenen Regeln und Karten
export const myPick = m => !!m && !!m.cfg && (!m.cfg.chooser || m.cfg.chooser === m.side);
export function castVote(m, rule, map) {
  if (m.phase !== 'vote' || !myPick(m) || !m.cfg.opts.rules.includes(rule) || !m.cfg.opts.maps.includes(map)) return [];
  m.vote = { rule, map };
  return ['voted', ...hostResolve(m)];
}
// Host: beide haben abgestimmt → Regel und Karte festlegen, malen
function hostResolve(m) {
  if (m.role !== 'host' || m.phase !== 'vote') return [];
  // „Verlierer wählt“: nur die Stimme des Wählenden zählt
  const ch = m.cfg.chooser, only = ch ? (ch === m.side ? m.vote : m.peerVote) : null;
  if (ch ? !only : !m.vote || !m.peerVote) return [];
  const a = ch ? { pick: only.rule, agreed: null } : resolveVote(m.vote.rule, m.peerVote.rule, m.rand);
  const b = ch ? { pick: only.map, agreed: null } : resolveVote(m.vote.map, m.peerVote.map, m.rand);
  m.cfg = { ...m.cfg, cat: a.pick, map: b.pick, agreed: { rule: a.agreed, map: b.agreed } };
  m.phase = 'paint';
  return ['round'];
}
const validOpts = o => isObj(o) && Array.isArray(o.rules) && Array.isArray(o.maps) && o.rules.length && o.maps.length
  && o.rules.every(x => RULE_IDS.includes(x)) && o.maps.every(x => MAP_IDS.includes(x));

// „Fertig“: eigene Armee eingepackt
export function markReady(m, packed) {
  if (m.phase !== 'paint') return [];
  m.mine = packed; m.chunks = splitChunks(packed); m.sendI = 0; m.phase = 'ready';
  return ['ready'];
}
// Kampf vorbei (lokales Ergebnis): 'blau' | 'rot' | 'draw'
export function finishFight(m, winner) {
  if (m.phase !== 'fight') return [];
  endRound(m, winner);
  return ['result'];
}
// Eigenes Emote (k = Index in EMOTES). false: ungültig, noch kein Gegner oder zu schnell hintereinander
export function sendEmote(m, k, now = Date.now()) {
  if (!m.cfg || !Number.isInteger(k) || k < 0 || k >= EMOTES.length || now - m.emoAt < EMOTE_GAP) return false;
  m.emo = { n: (m.emo ? m.emo.n : 0) + 1, k }; m.emoAt = now;
  return true;
}
// Aufgeben (beim Malen, Warten oder im Kampf): die Runde geht an den Gegner
const GIVE_PHASES = ['paint', 'ready', 'xfer', 'fight'];
export const canGiveUp = m => !!m && !!m.cfg && GIVE_PHASES.includes(m.phase);
function endRound(m, winner) {
  m.res = { r: m.cfg.r, w: winner }; m.phase = 'result';
  if (m.role === 'host' && m.counted < m.cfg.r) { m.counted = m.cfg.r; if (winner !== 'draw') m.score[winner]++; }
}
export function giveUp(m) {
  if (!canGiveUp(m)) return [];
  m.gave = m.cfg.r;
  endRound(m, m.side === 'blau' ? 'rot' : 'blau');
  return ['gave', 'result'];
}
// same: Revanche (gleiche Regel und Karte) statt neuer Abstimmung; die gibt es nur, wenn beide Revanche wollen
export function wantNext(m, same = false) {
  if (m.phase !== 'result') return [];
  m.want = m.cfg.r + 1; m.same = !!same;
  return ['want'];
}

// Match (Einstellung goal): Seite, die genug Siege hat, sonst null
export function matchWinner(m) {
  const g = m && m.set ? m.set.goal : 0;
  if (!g) return null;
  return m.score.blau >= g ? 'blau' : m.score.rot >= g ? 'rot' : null;
}

/* ---------- Regeln im Spiel ändern ---------- */
// Vorschlag (jederzeit, solange ein Gegner da ist). Ein neuer Vorschlag ersetzt den alten; null zieht ihn zurück.
export function proposeSet(m, s) {
  if (!m || !m.cfg) return [];
  if (s === null) { if (!m.prop) return []; m.prop = null; return ['proposed']; }
  const st = cleanSet(s);
  if (sameSet(st, m.set)) return [];
  m.prop = { n: ++m.propN, s: st };
  return ['proposed'];
}
// Antwort auf den Vorschlag des Gegners. Der Host übernimmt angenommene Einstellungen sofort, der Gast bekommt sie über set.
export function answerProp(m, ok) {
  if (!m || !m.peerProp) return [];
  const s = m.peerProp.s;
  m.ans = { n: m.peerProp.n, ok: !!ok }; m.peerProp = null;
  const ev = ['answered'];
  if (ok && m.role === 'host') ev.push(...applySet(m, s));
  return ev;
}
// Host: neue Einstellungen gelten. Läuft gerade die Abstimmung, wird sie mit den neuen Einstellungen neu ausgelost.
function applySet(m, s) {
  m.set = cleanSet(s); m.budget = m.set.budget;
  const ev = ['set'];
  if (m.phase === 'vote' && m.cfg) {
    const c = m.cfg, n = nextRound(null, m.set, m.rand, c.chooser || null);
    newRound(m, { ...n, r: c.r, rev: num(c.rev) + 1 });
    ev.push(m.cfg.cat ? 'round' : 'vote');
  }
  return ev;
}

// Das Ergebnis, das zählt: das des Hosts (bei verschiedenen Browsern kann ein Kampf minimal anders laufen)
export function officialWinner(m) {
  if (!m.cfg) return null;
  if (m.role === 'host') return m.res ? m.res.w : null;
  return m.peerRes && m.peerRes.r === m.cfg.r ? m.peerRes.w : null;
}

// Neues presence-Objekt des Gegners verarbeiten (p darf null sein: niemand da). Liefert Ereignisse:
// 'round' (neue Runde, malen), 'xfer' (beide fertig), 'fight' ({ units, seed } in m.fight), 'score', 'error',
// 'peergave' (Gegner gibt auf, Runde an mich), 'peerwant' (Gegner will weiter), 'peervoted' (Gegner hat abgestimmt), 'peerready' (Gegner ist mit Malen fertig).
export function onPeer(m, p, W, H) {
  const ev = [];
  if (!isObj(p) || p.ks !== PROTO) return ev;
  // Emote des Gegners: nur neue (höherer Zähler)
  const pe = p.emo;
  if (isObj(pe) && Number.isInteger(pe.k) && pe.k >= 0 && pe.k < EMOTES.length && num(pe.n) > m.peerEmoN) {
    m.peerEmoN = num(pe.n); m.peerEmo = pe.k; ev.push('emote');
  }
  // Gast: Runde und Punktestand vom Host übernehmen
  if (m.role === 'guest') {
    const c = p.cfg;
    const fin = isObj(c) && RULE_IDS.includes(c.cat) && MAP_IDS.includes(c.map);
    const ag = isObj(c) && isObj(c.agreed) ? { rule: !!c.agreed.rule, map: !!c.agreed.map } : null;
    // Einstellungen des Hosts (Lobby oder angenommene Änderung)
    if (isObj(p.set) && !sameSet(p.set, m.set)) { m.set = cleanSet(p.set); m.budget = m.set.budget; if (m.cfg) ev.push('set'); }   // vor der ersten Runde still übernehmen
    if (Number.isInteger(p.match) && p.match > m.match) m.match = p.match;
    // neue Runde, oder dieselbe Runde neu ausgelost (rev: Regeln während der Abstimmung geändert)
    const cr = m.cfg ? m.cfg.r : 0, newer = isObj(c) && (num(c.r) > cr || (num(c.r) === cr && num(c.rev) > num(m.cfg && m.cfg.rev) && m.phase === 'vote'));
    if (newer && validOpts(c.opts) && ONLINE_BUDGETS.includes(c.budget)) {
      newRound(m, { r: num(c.r), seed: num(c.seed) | 0, budget: c.budget, opts: { rules: c.opts.rules, maps: c.opts.maps },
        cat: fin ? c.cat : null, map: fin ? c.map : null, agreed: fin ? ag : null, ...(c.rematch ? { rematch: true } : {}),
        ...(c.chooser === 'blau' || c.chooser === 'rot' ? { chooser: c.chooser } : {}), ...(c.drawn ? { drawn: true } : {}),
        ...(TIMES.includes(c.time) && c.time ? { time: c.time } : {}), ...(num(c.rev) ? { rev: num(c.rev) } : {}) });
      ev.push(fin ? 'round' : 'vote');
    } else if (fin && m.cfg && num(c.r) === m.cfg.r && m.phase === 'vote') {
      m.cfg = { ...m.cfg, cat: c.cat, map: c.map, agreed: ag }; m.phase = 'paint'; ev.push('round');
    }
    if (isObj(p.score)) {
      const s = { blau: num(p.score.blau), rot: num(p.score.rot) };
      if (s.blau !== m.score.blau || s.rot !== m.score.rot) { m.score = s; ev.push('score'); }
    }
  }
  // Regeländerung: Vorschlag des Gegners, Antwort auf meinen
  const pp = p.prop;
  if (isObj(pp) && Number.isInteger(pp.n) && pp.n > m.peerPropN && isObj(pp.s)) { m.peerPropN = pp.n; m.peerProp = { n: pp.n, s: cleanSet(pp.s) }; ev.push('peerprop'); }
  else if (m.peerProp && (!isObj(pp) || pp.n !== m.peerProp.n)) { m.peerProp = null; ev.push('peerprop'); }   // zurückgezogen
  const pa = p.ans;
  if (m.prop && isObj(pa) && pa.n === m.prop.n) {
    const s = m.prop.s; m.prop = null;
    if (pa.ok === true) { if (m.role === 'host') ev.push(...applySet(m, s)); ev.push('propok'); } else ev.push('propno');
  }
  if (!m.cfg) return ev;
  const r = m.cfg.r;
  // Gegner gibt auf: Runde an mich
  if (num(p.gave) === r && GIVE_PHASES.includes(m.phase)) { m.peerGave = true; endRound(m, m.side); ev.push('peergave', 'result'); }
  if (isObj(p.res) && num(p.res.r) === r && ['blau', 'rot', 'draw'].includes(p.res.w)) {
    if (!m.peerRes || m.peerRes.r !== r) { m.peerRes = { r, w: p.res.w }; ev.push('peerres'); }
  }
  const pw = num(p.want) === r + 1 ? (p.same === true ? 'same' : 'new') : null;
  if (pw !== m.peerWant) { m.peerWant = pw; ev.push('peerwant'); }
  // Hinweise: Gegner hat abgestimmt / ist mit Malen fertig (nur einmal je Runde melden)
  const pv = m.phase === 'vote' && isObj(p.vote) && num(p.vote.r) === r;
  if (pv && !m.peerVoted) { m.peerVoted = true; ev.push('peervoted'); }
  const pr = (m.phase === 'paint' || m.phase === 'ready') && num(p.ready) === r;
  if (pr && !m.peerReady) { m.peerReady = true; if (m.phase === 'paint') ev.push('peerready'); }
  // Host: Stimme des Gasts
  if (m.role === 'host' && m.phase === 'vote' && isObj(p.vote) && num(p.vote.r) === r
    && m.cfg.opts.rules.includes(p.vote.rule) && m.cfg.opts.maps.includes(p.vote.map)) {
    m.peerVote = { rule: p.vote.rule, map: p.vote.map }; ev.push(...hostResolve(m));
  }
  // Host: nächste Runde, wenn beide wollen und sich einig sind (Revanche vs. neue Abstimmung)
  if (m.role === 'host' && m.phase === 'result' && m.want === r + 1 && num(p.want) === r + 1 && m.same === (p.same === true)) {
    const both = m.same, w = m.res ? m.res.w : 'draw';
    if (matchWinner(m)) { m.score = { blau: 0, rot: 0 }; m.match++; ev.push('score'); }   // Match vorbei: neues Match
    const ch = w === 'blau' ? 'rot' : w === 'rot' ? 'blau' : null;   // „Verlierer wählt“
    newRound(m, both ? rematchRound(m.cfg, m.rand) : nextRound(m.cfg, m.set, m.rand, ch)); ev.push(m.cfg.cat ? 'round' : 'vote');
    return ev;
  }
  if (m.phase === 'ready' && num(p.ready) === r) { m.phase = 'xfer'; ev.push('xfer'); }
  if (m.phase === 'xfer' || m.phase === 'fight') {
    // senden: das Stück, das der Gegner als nächstes braucht
    const got = isObj(p.got) && num(p.got.r) === r ? num(p.got.n) : 0;
    if (m.chunks) m.sendI = Math.min(got, m.chunks.length - 1);
    // empfangen: Stücke der Reihe nach
    const a = p.arm;
    if (m.theirs === null && isObj(a) && num(a.r) === r && typeof a.d === 'string' && num(a.i) === m.recv.length && num(a.n) >= 1) {
      m.recv.push(a.d);
      if (m.recv.length >= num(a.n)) {
        try {
          const other = m.side === 'blau' ? 'rot' : 'blau';
          m.theirs = unpackArmy(m.recv.join(''), other, W, H, m.cfg);
        } catch (e) { m.error = e.message; m.theirs = []; ev.push('error'); }
      }
    }
    if (m.phase === 'xfer' && m.theirs !== null && m.chunks && got >= m.chunks.length) {
      let mine;
      try { mine = unpackArmy(m.mine, m.side, W, H, m.cfg); }
      catch (e) { m.error = e.message; mine = []; ev.push('error'); }
      m.fight = { units: m.side === 'blau' ? battleList(mine, m.theirs) : battleList(m.theirs, mine), seed: m.cfg.seed, map: m.cfg.map };
      m.phase = 'fight'; ev.push('fight');
    }
  }
  return ev;
}

// Unter den Teilnehmern des Raums den Gegner finden (passende Gegenrolle, bevorzugter peerRef zuerst)
export function pickPeer(peers, wantRole = null, preferPeer = null) {
  let first = null;
  for (const p of peers || []) {
    if (!p || p.isMe || !isObj(p.presence) || p.presence.ks !== PROTO) continue;
    if (wantRole && p.presence.role !== wantRole) continue;
    if (preferPeer && p.peer === preferPeer) return p;
    if (!first) first = p;
  }
  return first;
}
// Offene Räume aus der Lobby: [{ code, budget, set? }]
export function openRooms(peers) {
  const out = [];
  for (const p of peers || []) {
    const o = p && !p.isMe && isObj(p.presence) ? p.presence.open : null;
    // Räume anderer Modi (2v2: mode) gehören nicht hierher
    if (isObj(o) && !o.mode && normCode(o.code) && ONLINE_BUDGETS.includes(o.budget)) out.push({ code: normCode(o.code), budget: o.budget, ...(isObj(o.set) ? { set: cleanSet(o.set) } : {}) });
  }
  return out;
}
