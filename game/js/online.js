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
import { SHAPES } from './shapes.js';
import { RULES, RULE_IDS, MAP_IDS, ruleDef, ruleAllows, draw, resolveVote } from './rules.js';

export const PROTO = 2;   // 2: Abstimmung über Regel und Karte
export const ROOM_PREFIX = 'ks1v1-';
// cfg.cat ist die id einer Regel (rules.js); die vier Kategorien sind Regeln mit derselben id
export const ONLINE_CATS = RULE_IDS;
export const CAT_NAME = Object.fromEntries(RULES.map(r => [r.id, r.n]));
export const VOTE_N = 3;   // Auswahl je Runde: so viele Regeln und Karten
export const ONLINE_BUDGETS = [100, 150, 250];
export const ONLINE_DEFAULT = 150;
export const CHUNK = 2800;                 // Zeichen je Armee-Stück (presence hat 4 KiB je Spieler)
export const SIDE = { host: 'blau', guest: 'rot' };
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

/* ---------- Runden ---------- */
// Nächste Runde zur Abstimmung: drei Regeln (nie die der letzten Runde) und drei Karten; neue Saat für den Kampf
export function nextRound(prev, budget, rand = Math.random) {
  return {
    r: prev ? prev.r + 1 : 1,
    seed: (rand() * 2 ** 31) | 0,
    budget: ONLINE_BUDGETS.includes(budget) ? budget : ONLINE_DEFAULT,
    opts: { rules: draw(RULE_IDS, VOTE_N, rand, prev && prev.cat), maps: draw(MAP_IDS, VOTE_N, rand) },
    cat: null, map: null, agreed: null,
  };
}
// Revanche: dieselbe Regel, Karte und dasselbe Budget, neue Saat; beide malen neu
export function rematchRound(prev, rand = Math.random) {
  return { ...prev, r: prev.r + 1, seed: (rand() * 2 ** 31) | 0, agreed: { rule: true, map: true }, rematch: true };
}
// Runde mit Regel und Karte gleich ausgelost (ohne Abstimmung, für Tests und Zufall)
export function randomRound(prev, budget, rand = Math.random) {
  const c = nextRound(prev, budget, rand);
  return { ...c, cat: c.opts.rules[0], map: c.opts.maps[0] };
}
// Level-artiges Objekt für die Malleiste und paint.js (campaign/index.js unitAllowed, catAllowed): die Regel der Runde
export const roundDef = cfg => ({ ...ruleDef(cfg.cat), budget: cfg.budget });

/* ---------- Armee-Pakete ---------- */
// Jede Einheit in 5 Bytes: Typ (6 Bit) + Form (2 Bit), x und y als 16 Bit in Anteilen der Welt. Base64url.
export const PAINT_TYPES = Object.keys(UNITS).filter(t => UNITS[t].paint !== false);
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
  const us = world.units.filter(u => u.alive && u.team === side && u.T.paint !== false);
  const bytes = new Uint8Array(us.length * 5);
  us.forEach((u, k) => {
    const ti = PAINT_TYPES.indexOf(u.type), si = Math.max(0, SHAPE_KEYS.indexOf(u.shape || null));
    const x = qz(u.x, world.W), y = qz(u.y, world.H), o = k * 5;
    bytes[o] = (ti & 63) | (si << 6);
    bytes[o + 1] = x >> 8; bytes[o + 2] = x & 255; bytes[o + 3] = y >> 8; bytes[o + 4] = y & 255;
  });
  return b64(bytes);
}

// Text → [{ type, team, x, y, shape }]. Wirft bei kaputten Daten. Prüft die Seite (eigene Hälfte) und das Budget, damit
// ein veränderter Client nicht mehr malt als erlaubt.
export function unpackArmy(text, side, W, H, cfg) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('Armee unlesbar');
  const bytes = unb64(text);
  if (bytes.length % 5) throw new Error('Armee unvollständig');
  const out = [];
  let cost = 0;
  for (let o = 0; o < bytes.length; o += 5) {
    const type = PAINT_TYPES[bytes[o] & 63], shape = SHAPE_KEYS[bytes[o] >> 6] || null;
    if (!type) throw new Error('Unbekannte Einheit');
    if (cfg && !ruleAllows(cfg.cat, type)) throw new Error('Einheit nicht in der Kategorie');
    const x = dq((bytes[o + 1] << 8) | bytes[o + 2], W), y = dq((bytes[o + 3] << 8) | bytes[o + 4], H);
    if (side === 'blau' ? x > W / 2 + 1 : x < W / 2 - 1) throw new Error('Einheit auf der falschen Seite');
    cost += UNITS[type].cost;
    out.push({ type, team: side, x, y, shape });
  }
  if (cfg && cost > cfg.budget + EPS) throw new Error('Budget überschritten');
  return out;
}
export const splitChunks = (s, n = CHUNK) => { const out = []; for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n)); return out.length ? out : ['']; };

// Beide Armeen in fester Reihenfolge (Blau, dann Rot): so stellen beide Geräte dieselbe Welt auf
export function battleList(blau, rot) { return [...blau, ...rot]; }

/* ---------- Ablauf ---------- */
// phase: 'wait' (Host wartet auf Gegner / Gast auf die erste Runde) → 'vote' (Regel und Karte wählen) → 'paint' → 'ready' (fertig, Gegner malt noch) →
// 'xfer' (Armeen werden getauscht) → 'fight' → 'result'. 'left': der Gegner ist weg.
export function createMatch(role, budget = ONLINE_DEFAULT, rand = Math.random) {
  return {
    role, side: SIDE[role], budget: ONLINE_BUDGETS.includes(budget) ? budget : ONLINE_DEFAULT, rand,
    phase: 'wait', cfg: null, score: { blau: 0, rot: 0 }, mine: null, chunks: null, recv: [], theirs: null,
    res: null, peerRes: null, want: 0, same: false, counted: 0, error: null, vote: null, peerVote: null,
  };
}
const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

// Was ich veröffentliche (presence-Objekt)
export function view(m) {
  const r = m.cfg ? m.cfg.r : 0, o = { ks: PROTO, role: m.role, ready: 0, arm: null, got: null, res: null, want: m.want, same: m.same };
  if (m.role === 'host') { o.cfg = m.cfg; o.score = m.score; }
  if (m.mine !== null && (m.phase === 'ready' || m.phase === 'xfer' || m.phase === 'fight' || m.phase === 'result')) o.ready = r;
  if (m.phase === 'xfer' || m.phase === 'fight' || m.phase === 'result') {
    o.got = { r, n: m.recv.length };
    if (m.chunks) { const i = Math.min(m.sendI || 0, m.chunks.length - 1); o.arm = { r, n: m.chunks.length, i, d: m.chunks[i] }; }
  }
  if (m.res) o.res = m.res;
  o.vote = m.vote && m.cfg ? { r, rule: m.vote.rule, map: m.vote.map } : null;
  return o;
}

function newRound(m, cfg) {
  m.cfg = cfg; m.phase = cfg.cat ? 'paint' : 'vote'; m.vote = null; m.peerVote = null; m.same = false; m.peerWant = null; m.mine = null; m.chunks = null; m.sendI = 0; m.recv = []; m.theirs = null;
  m.res = null; m.peerRes = null; m.error = null; m.peerReady = false; m.peerVoted = false;
}

// Gegner ist da (Host): erste Runde würfeln. Liefert Ereignisse.
export function hostStart(m) {
  if (m.role !== 'host' || m.cfg) return [];
  newRound(m, nextRound(null, m.budget, m.rand));
  return ['vote'];
}

// Eigene Stimme: eine der angebotenen Regeln und Karten
export function castVote(m, rule, map) {
  if (m.phase !== 'vote' || !m.cfg.opts.rules.includes(rule) || !m.cfg.opts.maps.includes(map)) return [];
  m.vote = { rule, map };
  return ['voted', ...hostResolve(m)];
}
// Host: beide haben abgestimmt → Regel und Karte festlegen, malen
function hostResolve(m) {
  if (m.role !== 'host' || m.phase !== 'vote' || !m.vote || !m.peerVote) return [];
  const a = resolveVote(m.vote.rule, m.peerVote.rule, m.rand), b = resolveVote(m.vote.map, m.peerVote.map, m.rand);
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
  m.res = { r: m.cfg.r, w: winner }; m.phase = 'result';
  if (m.role === 'host' && m.counted < m.cfg.r) { m.counted = m.cfg.r; if (winner !== 'draw') m.score[winner]++; }
  return ['result'];
}
// same: Revanche (gleiche Regel und Karte) statt neuer Abstimmung; die gibt es nur, wenn beide Revanche wollen
export function wantNext(m, same = false) {
  if (m.phase !== 'result') return [];
  m.want = m.cfg.r + 1; m.same = !!same;
  return ['want'];
}

// Das Ergebnis, das zählt: das des Hosts (bei verschiedenen Browsern kann ein Kampf minimal anders laufen)
export function officialWinner(m) {
  if (!m.cfg) return null;
  if (m.role === 'host') return m.res ? m.res.w : null;
  return m.peerRes && m.peerRes.r === m.cfg.r ? m.peerRes.w : null;
}

// Neues presence-Objekt des Gegners verarbeiten (p darf null sein: niemand da). Liefert Ereignisse:
// 'round' (neue Runde, malen), 'xfer' (beide fertig), 'fight' ({ units, seed } in m.fight), 'score', 'error',
// 'peerwant' (Gegner will weiter), 'peervoted' (Gegner hat abgestimmt), 'peerready' (Gegner ist mit Malen fertig).
export function onPeer(m, p, W, H) {
  const ev = [];
  if (!isObj(p) || p.ks !== PROTO) return ev;
  // Gast: Runde und Punktestand vom Host übernehmen
  if (m.role === 'guest') {
    const c = p.cfg;
    const fin = isObj(c) && RULE_IDS.includes(c.cat) && MAP_IDS.includes(c.map);
    const ag = isObj(c) && isObj(c.agreed) ? { rule: !!c.agreed.rule, map: !!c.agreed.map } : null;
    if (isObj(c) && num(c.r) > (m.cfg ? m.cfg.r : 0) && validOpts(c.opts) && ONLINE_BUDGETS.includes(c.budget)) {
      newRound(m, { r: num(c.r), seed: num(c.seed) | 0, budget: c.budget, opts: { rules: c.opts.rules, maps: c.opts.maps },
        cat: fin ? c.cat : null, map: fin ? c.map : null, agreed: fin ? ag : null, ...(c.rematch ? { rematch: true } : {}) });
      ev.push(fin ? 'round' : 'vote');
    } else if (fin && m.cfg && num(c.r) === m.cfg.r && m.phase === 'vote') {
      m.cfg = { ...m.cfg, cat: c.cat, map: c.map, agreed: ag }; m.phase = 'paint'; ev.push('round');
    }
    if (isObj(p.score)) {
      const s = { blau: num(p.score.blau), rot: num(p.score.rot) };
      if (s.blau !== m.score.blau || s.rot !== m.score.rot) { m.score = s; ev.push('score'); }
    }
  }
  if (!m.cfg) return ev;
  const r = m.cfg.r;
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
  // Host: nächste Runde, wenn beide wollen
  if (m.role === 'host' && m.phase === 'result' && m.want === r + 1 && num(p.want) === r + 1) {
    const both = m.same && p.same === true;
    newRound(m, both ? rematchRound(m.cfg, m.rand) : nextRound(m.cfg, m.budget, m.rand)); ev.push(both ? 'round' : 'vote');
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
      const mine = unpackArmy(m.mine, m.side, W, H, null);
      m.fight = { units: m.side === 'blau' ? battleList(mine, m.theirs) : battleList(m.theirs, mine), seed: m.cfg.seed, map: m.cfg.map };
      m.phase = 'fight'; ev.push('fight');
    }
  }
  return ev;
}

// Unter den Teilnehmern des Raums den Gegner finden (erster fremder Spieler mit unserem Protokoll)
export function pickPeer(peers) {
  for (const p of peers || []) if (p && !p.isMe && isObj(p.presence) && p.presence.ks === PROTO) return p;
  return null;
}
// Offene Räume aus der Lobby: [{ code, budget }]
export function openRooms(peers) {
  const out = [];
  for (const p of peers || []) {
    const o = p && !p.isMe && isObj(p.presence) ? p.presence.open : null;
    if (isObj(o) && normCode(o.code) && ONLINE_BUDGETS.includes(o.budget)) out.push({ code: normCode(o.code), budget: o.budget });
  }
  return out;
}
