// Fähigkeiten (Spez. #30, Nachtrag 3): rein, kein DOM, kein PIXI, Zufall nur über world.rng(). Nur das Verhalten;
// Name und Text jeder Fähigkeit stehen in data.js (ABIL → UNITS[t].abil), die Karten lesen nur dort (Vorgabe 2).
//
// ABILITY[type] = { cd, ready(world, u) → bool, start(world, u), update(world, u, dt) → bool (true = fertig),
// end?(world, u) }:
//   cd      Abklingzeit in s. Beim Spawn startet u.abCd bei cd · (0,3 + 0,7 · rng) (world.spawn), damit gleichzeitig
//           gemalte Einheiten nicht alle zugleich auslösen.
//   ready   Darf sie jetzt auslösen (Ziel, Lage)? Kann dabei Ziel bzw. Zielpunkt merken (u.tg, u.abX/u.abY). Ohne
//           Erfolg versucht stepAbility es erst nach ABILITY_RETRY s wieder (u.abCd), statt jeden Schritt zu suchen.
//   start   Beginn (einmal). Gleich danach läuft update mit dt = 0 im selben Schritt.
//   update  Jeder Schritt, solange sie läuft; u.abT = Zeit seit dem Start, u.abK = Zähler (z. B. Raketen). true:
//           fertig, dann läuft im selben Schritt das normale Verhalten weiter.
//   end     (optional) Aufräumen, beim regulären Ende wie beim Abbruch.
// Nach dem Ende und nach jedem Abbruch beginnt die Abklingzeit neu (u.abCd = cd); während sie läuft, steht sie.
//
// Vorrang der Zustände (Festlegung 1), geführt in combat.think: tot > betäubt oder in der Luft > Schreck > Rückzug
// > laufende Fähigkeit > normales Verhalten. Betäubung, Abheben, Schreck und Rückzug brechen ab (cancelAbility);
// stepAbility selbst prüft das noch einmal, damit kein anderer Aufrufer den Vorrang umgehen kann.
import { UNITS } from './data.js';
import { factionOf, query } from './world.js';
import { fire, clearShot, hasLineOfFire } from './combat.js';
import { isFleeing } from './morale.js';
import { leaveBlock } from './formation.js';

/* ---------- Feuer (Festlegung 7) ---------- */
// Feuerball, Drachenatem, Brand über Zeit, Brandpfeile, Phönixspur: gemeinsames Merkmal Feuer (combat.hurt: Panzer
// ×0,6, Geist voll; später Troll-Heilung, Vampir doppelt)
export const FIRE_KINDS = new Set(['fire', 'breath', 'burn', 'firearrow', 'phoenix']);
export const isFire = kind => FIRE_KINDS.has(kind);

// s bis zum nächsten Versuch, wenn ready ablehnt (kein Ziel in Reichweite)
export const ABILITY_RETRY = .5;

const MAX_R = Math.max(...Object.values(UNITS).map(T => T.r));

/* ---------- Schreck (Festlegung 1) ---------- */
// Kurzer erzwungener Rückzug von sec s, unabhängig vom Leben und ohne Erholung (morale.updateMorale führt ihn,
// combat.retreat steuert: Liegende stehen erst auf, in der Ecke wehrt sie sich). Ein längerer laufender Schreck
// bleibt (fearT = max). Verlässt sofort den Römerblock (kein Schildschutz), bricht eine laufende Fähigkeit ab und
// zählt sofort nicht mehr zum Schwerpunkt der Fraktion (wie der Fluchtbeginn). Wer betäubt oder in der Luft ist, erschrickt
// trotzdem; der Schreck läuft dann erst ab, wenn er wieder steht (Vorrang: betäubt > Schreck). Schreckwirkungen treffen nur Feinde: das prüft der Aufrufer.
export function scare(world, v, sec) {
  if (!v.alive || !(sec > 0)) return;
  if (!isFleeing(v)) {
    const c = world.cent.get(factionOf(world, v));
    if (c && c.n > 0) c.n--;
    v.safeT = 0; v.cornerT = 0; v.run = 0;
  }
  if (sec > v.fearT) v.fearT = sec;
  v.rt = 0; v.tg = null;   // Bedrohung gleich neu suchen (morale.updateMorale)
  leaveBlock(v);
  cancelAbility(world, v);
}

/* ---------- Ablauf ---------- */
// Ein Schritt Fähigkeit für u (aus combat.think, nach Schreck und Rückzug). Liefert true, solange eine Fähigkeit die
// Steuerung hat (think macht dann nichts anderes).
export function stepAbility(world, u, dt) {
  const A = ABILITY[u.type];
  if (A === undefined) return false;
  if (u.state !== 'ok' || isFleeing(u)) { if (u.abOn) finish(world, u, A); return false; }
  if (u.abOn) {
    u.abT += dt;
    if (A.update(world, u, dt)) { finish(world, u, A); return false; }
    return true;
  }
  if (u.abCd > 0) return false;
  if (!A.ready(world, u)) { u.abCd = ABILITY_RETRY; return false; }
  u.abOn = true; u.abT = 0; u.abK = 0;
  A.start(world, u);
  if (A.update(world, u, 0)) { finish(world, u, A); return false; }
  return true;
}

// Abbruch (Betäubung, Abheben, Schreck, Rückzug): wie das Ende, die Abklingzeit beginnt neu
export function cancelAbility(world, u) {
  const A = ABILITY[u.type];
  if (A !== undefined && u.abOn) finish(world, u, A);
}

function finish(world, u, A) {
  u.abOn = false; u.abT = 0; u.abK = 0; u.abCd = A.cd;
  if (A.end) A.end(world, u);
}

/* ---------- Hubschrauber: Raketensalve ---------- */
// N gerade Raketen im Abstand GAP s auf das Ziel: Schaden der Panzerfaust ÷ 2, Splash der Panzerfaust (trifft auch
// Eigene, #5). Ziel: unter den CAND nächsten Feinden in Reichweite (dazu das aktuelle Ziel) der mit der dichtesten
// Gruppe (Feinde minus Eigene im Umkreis GROUP_R; das aktuelle Ziel gewinnt Gleichstände), nur mit mehr Feinden als
// Eigenen und freier Schusslinie. Fällt es während der Salve, wird neu gewählt; ohne Ziel endet die Salve. Steht
// vor einer Rakete ein Verbündeter in der Bahn, fällt diese Rakete aus. Der Heli kreist dabei weiter.
export const HELI_SALVO = {
  N: 4, GAP: .25, DMG: UNITS.panzerfaust.dmg / 2, R: UNITS.panzerfaust.splash, GROUP_R: 40, CAND: 8,
};

// Kandidaten: die CAND nächsten Feinde in Reichweite (eine begrenzte Hash-Abfrage, nur beim Auslösen)
const CU = new Array(HELI_SALVO.CAND + 1).fill(null), CS = new Float64Array(HELI_SALVO.CAND + 1);
let CN = 0, Q_W = null, Q_U = null, Q_F = null, Q_R = 0;
function candTest(v) {
  if (factionOf(Q_W, v) === Q_F) return;
  const u = Q_U, dx = v.x - u.x, dy = v.y - u.y, d = dx * dx + dy * dy, r = Q_R + v.T.r, M = HELI_SALVO.CAND;
  if (d > r * r || (CN === M && d >= CS[M - 1])) return;
  let k = CN < M ? CN++ : M - 1;
  while (k > 0 && CS[k - 1] > d) { CS[k] = CS[k - 1]; CU[k] = CU[k - 1]; k--; }
  CS[k] = d; CU[k] = v;
}
// Gruppe um (x, y): +1 je Feind, −1 je Eigener der Fraktion f
let G_W = null, G_F = null, G_X = 0, G_Y = 0, G_R2 = 0, G_S = 0;
function groupTest(v) {
  const dx = v.x - G_X, dy = v.y - G_Y;
  if (dx * dx + dy * dy <= G_R2) G_S += factionOf(G_W, v) === G_F ? -1 : 1;
}
function groupScore(world, f, x, y) {
  const R = HELI_SALVO.GROUP_R;
  G_W = world; G_F = f; G_X = x; G_Y = y; G_R2 = R * R; G_S = 0;
  query(world, x, y, R, groupTest);
  G_W = null; G_F = null;
  return G_S;
}

function salvoTarget(world, u) {
  const T = u.T, f = factionOf(world, u), reach = T.range + T.r;
  CN = 0; Q_W = world; Q_U = u; Q_F = f; Q_R = reach;
  query(world, u.x, u.y, reach + MAX_R, candTest);
  Q_W = null; Q_U = null; Q_F = null;
  const cur = u.tg;
  let has = false;
  for (let k = 0; k < CN; k++) if (CU[k] === cur) has = true;
  if (!has && cur && cur.alive && factionOf(world, cur) !== f) {
    const r = reach + cur.T.r;
    if ((cur.x - u.x) ** 2 + (cur.y - u.y) ** 2 <= r * r) CU[CN++] = cur;
  }
  for (let k = 0; k < CN; k++) CS[k] = groupScore(world, f, CU[k].x, CU[k].y) + (CU[k] === cur ? .5 : 0);
  let best = null;
  for (;;) {
    let bk = -1, bs = 0;
    for (let k = 0; k < CN; k++) if (CS[k] > bs) { bs = CS[k]; bk = k; }
    if (bk < 0 || bs < 1) break;   // nichts mehr oder höchstens so viele Eigene wie Feinde
    if (hasLineOfFire(world, u, CU[bk])) { best = CU[bk]; break; }
    CS[bk] = -Infinity;
  }
  CU.fill(null);   // keine Verweise auf Einheiten festhalten
  return best;
}

function heliReady(world, u) {
  const t = salvoTarget(world, u);
  if (!t) return false;
  u.tg = t; u.abX = t.x; u.abY = t.y;
  return true;
}

function heliUpdate(world, u) {
  const S = HELI_SALVO;
  let t = u.tg;
  if (!t || !t.alive || factionOf(world, t) === factionOf(world, u)) {
    t = salvoTarget(world, u);
    if (!t) return true;
    u.tg = t;
  }
  const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
  u.face = dx < 0 ? -1 : 1; u.fx = nx; u.fy = ny;
  // weiter kreisen wie beim normalen Feuer (combat.think)
  const s = u.id % 2 ? 1 : -1, sp = u.T.speed * .5;
  u.mx = -ny * s * sp; u.my = nx * s * sp;
  while (u.abK < S.N && u.abT >= u.abK * S.GAP - 1e-9) {
    const a = clearShot(world, u, t, 'rocket');
    if (a) fire(world, u, t, 'rocket', a.x, a.y, S.DMG, S.R);
    u.abK++;
  }
  u.abX = t.x; u.abY = t.y;
  return u.abK >= S.N;
}

/* ---------- Tabelle ---------- */
export const ABILITY = {
  heli: { cd: 25, ready: heliReady, start() {}, update: heliUpdate },
};
