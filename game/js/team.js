// 2 gegen 2 online (25.11.): vier Spieler auf vier Geräten im Live-Raum (net.js), zwei Teams. Rein: kein DOM, kein Netz.
// Zwei Modi, Silas' Wahl:
//   'staffel' (wie bei TFT): Zwei Duelle laufen gleichzeitig, Blau 1 gegen Rot 1 und Blau 2 gegen Rot 2, jeder auf dem
//             ganzen Feld seiner Seite mit derselben Regel. Danach treffen sich alle Überlebenden beider Duelle im Finale:
//             Die Reste des Siegers laufen zum Kampf des Teamkollegen rüber. Wer das Finale gewinnt, holt den Punkt.
//   'feld':   Ein gemeinsames Feld. Jeder malt sein Viertel (Blau links oben/unten, Rot rechts oben/unten) mit einer eigenen
//             Kategorie, alle vier Armeen kämpfen zusammen.
//
// Sitze: 0, 1 = Team Blau; 2, 3 = Team Rot. Sitz 0 ist der Host (erstellt den Raum), er verteilt die Sitze und lost die
// Runden aus. Gesprochen wird nur über presence (wie online.js):
//   jeder:  { ks: 'ks2v2', v: PROTO, role, pref: 'blau' | 'rot', n: Name, arm: { r, d } | null, want }
//   Host:   zusätzlich { mode, budget, seats: [peer-ids], cfg, score }
// Die Armeen sind klein genug für ein presence-Objekt (höchstens 150 Punkte, jede Einheit kostet mindestens 1).
// Alle Kämpfe sind deterministisch: Jedes Gerät rechnet beide Duelle und das Finale selbst und kommt zum selben Ergebnis.
import { UNITS } from './data.js';
import { createWorld, spawn, rebuildHash, cellIndex } from './world.js';
import { step, battleWinner } from './sim.js';
import { snapshotBattle, resetFight, STEP } from './battle.js';
import { applyShape } from './shapes.js';
import { RULE_IDS, MAP_IDS, applyMap, ruleDef } from './rules.js';
import { unpackArmy, budgetOf, roundDef } from './online.js';
import { cleanName } from './dailyboard.js';

export const PROTO = 1;
export const KS = 'ks2v2';
export const ROOM_PREFIX = 'ks2v2-';
export const MODES = ['staffel', 'feld'];
export const BUDGETS = [75, 100, 150];
export const BUDGET_DEFAULT = 100;
export const SEAT_TEAM = ['blau', 'blau', 'rot', 'rot'];
// Kategorien für „Gemeinsames Feld“: jeder Spieler bekommt eine eigene
export const SOLO_RULES = ['armee', 'tiere', 'mythisch', 'modern', 'schrott', 'urzeit'];
export const roomName = code => ROOM_PREFIX + code.toLowerCase();
export const mate = seat => seat ^ 1;                     // Teamkollege
export const duelOf = seat => seat % 2;                   // Staffel: Duell 0 (Sitze 0 und 2) oder 1 (Sitze 1 und 3)

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
const pick = (a, rand) => a[Math.floor(rand() * a.length) % a.length];

/* ---------- Runden ---------- */
// Neue Runde: Karte, Saaten und je Sitz die Regel (Staffel: alle dieselbe; Feld: vier verschiedene Kategorien)
export function newRound(prev, mode, budget, rand = Math.random) {
  let cats;
  if (mode === 'feld') {
    const pool = SOLO_RULES.slice();
    cats = [];
    for (let i = 0; i < 4; i++) cats.push(pool.splice(Math.floor(rand() * pool.length) % pool.length, 1)[0]);
  } else {
    const c = pick(RULE_IDS.filter(id => id !== (prev && prev.cats && prev.cats[0])), rand);
    cats = [c, c, c, c];
  }
  return {
    r: prev ? prev.r + 1 : 1, mode: MODES.includes(mode) ? mode : 'staffel',
    budget: BUDGETS.includes(budget) ? budget : BUDGET_DEFAULT,
    map: pick(MAP_IDS, rand), cats,
    seed: (rand() * 2 ** 31) | 0, seed2: (rand() * 2 ** 31) | 0,
  };
}
export function validCfg(c) {
  return isObj(c) && num(c.r) >= 1 && MODES.includes(c.mode) && BUDGETS.includes(c.budget) && MAP_IDS.includes(c.map)
    && Array.isArray(c.cats) && c.cats.length === 4 && c.cats.every(x => RULE_IDS.includes(x)) && Number.isInteger(c.seed) && Number.isInteger(c.seed2);
}
// Regel und Budget eines Sitzes als Level-artiges Objekt (Malleiste, paint.js) und Budget in Punkten
export const seatRule = (cfg, seat) => ({ cat: cfg.cats[seat], budget: cfg.budget });
export const seatDef = (cfg, seat) => roundDef(seatRule(cfg, seat));
export const seatBudget = (cfg, seat) => budgetOf(seatRule(cfg, seat));
// Malzone eines Sitzes in Anteilen: { x: [x0, x1], y: [y0, y1] }
export function seatZone(mode, seat) {
  const x = SEAT_TEAM[seat] === 'blau' ? [0, 0.5] : [0.5, 1];
  return { x, y: mode === 'feld' ? (seat % 2 ? [0.5, 1] : [0, 0.5]) : [0, 1] };
}

// Armee eines Sitzes auspacken und prüfen (Seite, Viertel, Regel, Budget). Wirft bei Fehlern.
export function seatArmy(text, cfg, seat, W, H) {
  const side = SEAT_TEAM[seat];
  const us = unpackArmy(text, side, W, H, seatRule(cfg, seat));
  const z = seatZone(cfg.mode, seat);
  for (const u of us) if (u.y < z.y[0] * H - 1 || u.y > z.y[1] * H + 1) throw new Error('Einheit im falschen Viertel');
  return us;
}

/* ---------- Kämpfe ---------- */
// Liste → Schnappschuss, genau wie main.js onlineFight die Welt aufstellt (Karte, Mauern ohne Bodentruppen, Form, LP)
export function buildSnap(list, map, W, H) {
  const w = createWorld(W, H, 1);
  w.teamMode = true;
  applyMap(w, map);
  for (const u of list) {
    if (!UNITS[u.type].fly && w.terr[cellIndex(w, u.x, u.y)] === 4) continue;
    const n = spawn(w, u.type, u.x, u.y, u.team);
    if (u.shape) applyShape(n, u.shape, true);
    if (u.hp != null) n.hp = Math.max(1, Math.min(u.hp, n.T.hp));
  }
  rebuildHash(w);
  return snapshotBattle(w);
}
// Kampf ohne Zeichnen; pump(ms) rechnet höchstens etwa ms Millisekunden. Ergebnis: { winner, t, survivors }
export function createRun(list, map, seed, W, H, now = () => globalThis.performance.now()) {
  const snap = buildSnap(list, map, W, H);
  const w = createWorld(W, H, 1);
  w.teamMode = true;
  resetFight(w, snap, seed);
  const c = { done: false, result: null, t: 0 };
  c.pump = (ms = Infinity) => {
    const end = now() + ms;
    while (!c.done) {
      for (let k = 0; k < 30 && !c.done; k++) {
        step(w, STEP); w.events.length = 0; c.t += STEP;
        const r = battleWinner(w, c.t);
        if (r) {
          const s = snapshotBattle(w);
          c.result = { winner: r, t: c.t, survivors: s.units.map(u => ({ type: u.type, team: u.team, x: u.x, y: u.y, hp: u.hp, shape: u.shape || null })) };
          c.done = true;
        }
      }
      if (now() >= end) break;
    }
    return c.done;
  };
  return c;
}
// Kampflisten der Runde. armies[seat] = Einheitenliste (seatArmy) oder [].
// Staffel: [Duell 0, Duell 1]; Feld: [alle vier]
export function roundLists(cfg, armies) {
  if (cfg.mode === 'feld') return [[...armies[0], ...armies[1], ...armies[2], ...armies[3]]];
  return [[...armies[0], ...armies[2]], [...armies[1], ...armies[3]]];
}
// Staffel: Überlebende der Duell-Sieger → Finale. Jeder bleibt auf seiner Seite (Blau links, Rot rechts), Höhe und LP bleiben.
// null, wenn kein Finale nötig ist (eine Seite hat niemanden mehr).
// Nur die Überlebenden des Siegers eines Duells laufen weiter (ein Unentschieden schickt niemanden).
export const winners = r => (r.winner === 'blau' || r.winner === 'rot' ? r.survivors.filter(u => u.team === r.winner) : []);
export function finaleList(results, W) {
  const all = results.flatMap(winners);
  const b = all.filter(u => u.team === 'blau'), r = all.filter(u => u.team === 'rot');
  if (!b.length || !r.length) return null;
  const clampX = u => (u.team === 'blau' ? Math.min(Math.max(u.x, 8), W / 2 - 8) : Math.max(Math.min(u.x, W - 8), W / 2 + 8));
  return [...b, ...r].map(u => ({ ...u, x: clampX(u) }));
}
// Sieger einer Staffel ohne Finale: wer Überlebende hat
export function staffelWinner(results) {
  const all = results.flatMap(winners);
  const b = all.some(u => u.team === 'blau'), r = all.some(u => u.team === 'rot');
  return b && !r ? 'blau' : r && !b ? 'rot' : 'draw';
}

/* ---------- Spiel ---------- */
// phase: 'lobby' → 'paint' → 'ready' (fertig, andere malen noch) → 'fight' → 'result' → 'paint' …
export function createTeamMatch(role, mode = 'staffel', budget = BUDGET_DEFAULT, rand = Math.random) {
  return {
    role, rand, mode: MODES.includes(mode) ? mode : 'staffel', budget: BUDGETS.includes(budget) ? budget : BUDGET_DEFAULT,
    seats: [null, null, null, null], me: null, seat: -1, pref: null, name: '',
    phase: 'lobby', cfg: null, score: { blau: 0, rot: 0 }, mine: null, armies: [null, null, null, null], errors: [],
    want: 0, counted: 0, names: ['', '', '', ''],
  };
}
// Was ich veröffentliche
export function teamView(m) {
  const o = { ks: KS, v: PROTO, role: m.role, pref: m.pref, n: cleanName(m.name), arm: null, want: m.want };
  if (m.mine && m.cfg && m.phase !== 'lobby') o.arm = { r: m.cfg.r, d: m.mine };
  if (m.role === 'host') { o.mode = m.mode; o.budget = m.budget; o.seats = m.seats; o.cfg = m.cfg; o.score = m.score; }
  return o;
}
const live = p => p && !p.isMe && isObj(p.presence) && p.presence.ks === KS && p.presence.v === PROTO;

// Host: Sitze an die Spieler im Raum verteilen (Lobby). peers = room.peers(). Liefert true, wenn sich etwas geändert hat.
// Wer schon sitzt, bleibt sitzen. Will jemand ins andere Team (pref), bekommt er dort einen freien Sitz oder tauscht mit
// jemandem, der dort sitzt und nicht ausdrücklich in dieses Team will. Neue kommen in ihr Wunsch-Team, sonst irgendwohin.
export function hostSeats(m, peers) {
  if (m.role !== 'host' || m.phase !== 'lobby') return false;
  const here = new Map(peers.filter(live).map(p => [p.peer, p.presence]));
  const old = JSON.stringify(m.seats);
  const seats = [m.me, null, null, null];
  for (let i = 1; i < 4; i++) if (m.seats[i] && here.has(m.seats[i])) seats[i] = m.seats[i];
  const prefOf = id => { const p = here.get(id); return p && (p.pref === 'blau' || p.pref === 'rot') ? p.pref : null; };
  for (const [id] of here) {
    if (seats.includes(id)) continue;
    const want = prefOf(id);
    let i = [1, 2, 3].find(k => !seats[k] && (!want || SEAT_TEAM[k] === want));
    if (i === undefined) i = [1, 2, 3].find(k => !seats[k]);
    if (i !== undefined) seats[i] = id;
  }
  for (let i = 1; i < 4; i++) {
    const id = seats[i], want = id && prefOf(id);
    if (!want || SEAT_TEAM[i] === want) continue;
    const k = [1, 2, 3].find(j => SEAT_TEAM[j] === want && (!seats[j] || prefOf(seats[j]) !== want));
    if (k !== undefined) { seats[i] = seats[k]; seats[k] = id; }
  }
  m.seats = seats;
  return JSON.stringify(seats) !== old;
}
export const full = m => m.seats.every(Boolean);

// Host: Spiel starten (alle vier Sitze voll)
export function hostStart(m) {
  if (m.role !== 'host' || !full(m) || m.phase !== 'lobby') return [];
  beginRound(m, newRound(null, m.mode, m.budget, m.rand));
  return ['round'];
}
function beginRound(m, cfg) {
  m.cfg = cfg; m.phase = 'paint'; m.mine = null; m.armies = [null, null, null, null]; m.errors = [];
}
// Fertig gemalt: eigene Armee eingepackt
export function teamReady(m, packed) {
  if (m.phase !== 'paint') return [];
  m.mine = packed; m.phase = 'ready';
  return ['ready'];
}
// Kampf vorbei (lokal ausgewertet): Punkt zählen
export function teamResult(m, winner) {
  if (m.phase !== 'fight' || !m.cfg) return [];
  m.phase = 'result';
  if (m.counted < m.cfg.r) { m.counted = m.cfg.r; if (winner === 'blau' || winner === 'rot') m.score[winner]++; }
  m.last = winner;
  return ['result'];
}
// Weiter zur nächsten Runde
export function teamNext(m) {
  if (m.phase !== 'result') return [];
  m.want = m.cfg.r + 1;
  return ['want', ...hostNext(m, m.lastPeers || [])];
}
function hostNext(m, peers) {
  if (m.role !== 'host' || m.phase !== 'result' || m.want !== m.cfg.r + 1) return [];
  const byId = new Map(peers.filter(live).map(p => [p.peer, p.presence]));
  for (let i = 1; i < 4; i++) { const p = byId.get(m.seats[i]); if (!p || num(p.want) !== m.cfg.r + 1) return []; }
  beginRound(m, newRound(m.cfg, m.mode, m.budget, m.rand));
  return ['round'];
}

// Presence aller anderen verarbeiten. peers = room.peers(). Liefert Ereignisse:
// 'seats' (Sitzverteilung geändert), 'round' (neue Runde, malen), 'fight' (alle vier Armeen da, m.armies gefüllt),
// 'score', 'error', 'mode' (Host hat Modus/Budget geändert)
export function teamPeers(m, peers, W, H) {
  const ev = [];
  m.lastPeers = peers;
  const byId = new Map(peers.filter(live).map(p => [p.peer, p.presence]));
  if (m.role === 'host') { if (hostSeats(m, peers)) ev.push('seats'); }
  else {
    const host = [...byId.values()].find(p => p.role === 'host');
    if (host) {
      if (Array.isArray(host.seats) && host.seats.length === 4) {
        const s = host.seats.map(x => (typeof x === 'string' ? x : null));
        if (JSON.stringify(s) !== JSON.stringify(m.seats)) { m.seats = s; ev.push('seats'); }
      }
      if (MODES.includes(host.mode) && BUDGETS.includes(host.budget) && (host.mode !== m.mode || host.budget !== m.budget)) { m.mode = host.mode; m.budget = host.budget; ev.push('mode'); }
      if (validCfg(host.cfg) && host.cfg.r > (m.cfg ? m.cfg.r : 0)) { beginRound(m, host.cfg); ev.push('round'); }
      if (isObj(host.score)) {
        const s = { blau: num(host.score.blau), rot: num(host.score.rot) };
        if (s.blau !== m.score.blau || s.rot !== m.score.rot) { m.score = s; ev.push('score'); }
      }
    }
  }
  m.seat = m.seats.indexOf(m.me);
  for (let i = 0; i < 4; i++) { const p = m.seats[i] && byId.get(m.seats[i]); if (p) m.names[i] = cleanName(p.n); }
  if (m.seat >= 0) m.names[m.seat] = cleanName(m.name);
  // Armeen einsammeln
  if (m.cfg && (m.phase === 'ready' || m.phase === 'paint')) {
    const r = m.cfg.r, texts = m.seats.map((id, i) => {
      if (i === m.seat) return m.phase === 'ready' ? m.mine : null;
      const p = id && byId.get(id);
      return p && isObj(p.arm) && num(p.arm.r) === r && typeof p.arm.d === 'string' ? p.arm.d : null;
    });
    if (m.phase === 'ready' && texts.every(t => t !== null)) {
      m.errors = [];
      m.armies = texts.map((t, i) => {
        try { return seatArmy(t, m.cfg, i, W, H); } catch (e) { m.errors.push({ seat: i, e: e.message }); return []; }
      });
      m.phase = 'fight';
      ev.push('fight');
      if (m.errors.length) ev.push('error');
    }
    m.readyN = texts.filter(t => t !== null).length;
  }
  ev.push(...hostNext(m, peers));
  return ev;
}
// Fehlt ein Spieler, der einen Sitz hat? (Sitz-Indizes)
export function missing(m, peers) {
  const ids = new Set(peers.filter(live).map(p => p.peer));
  return m.seats.map((id, i) => (i !== m.seat && id && !ids.has(id) ? i : -1)).filter(i => i >= 0);
}
// Offene 2v2-Räume aus der Lobby-presence (wie online.openRooms)
export function openTeamRooms(peers) {
  const out = [];
  for (const p of peers) {
    const o = p && !p.isMe && isObj(p.presence) && p.presence.ks === KS ? p.presence.open : null;
    const mode = isObj(o) ? (o.mode === 'tft' ? 'staffel' : o.mode) : null;
    if (isObj(o) && typeof o.code === 'string' && /^[A-Z0-9]{4}$/.test(o.code) && MODES.includes(mode)) out.push({ code: o.code, mode, n: Math.max(1, Math.min(4, num(o.n))) });
  }
  return out;
}
export { ruleDef };
