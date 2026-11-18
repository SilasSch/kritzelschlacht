// Zauberbuch der Magier und Gruppenzauber Meteor (Spez. #31, Nachtrag 3, Festlegungen 2, 4, 5). Rein: kein DOM, kein
// PIXI, Zufall nur über world.rng(). Kein ABILITY-Eintrag: das Zauberbuch ersetzt den normalen Wurf des Magiers
// (combat.think ruft castSpell, sobald er werfen darf und ein Ziel in Reichweite hat; während er nachlädt, prüft
// spellReact Windstoß und Steinwand). Eigene Felder je Einheit
// (world.spawn): windCd, wallCd, meteorCd (Abklingzeiten in s, laufen in combat.think ab), chanId (Kanal des Meteors,
// 0 = keiner). Name und Text der Zauber stehen in data.js (ABIL.magier), die Karten lesen nur dort.
//
// Importkreis wie bei abilities.js: world → abilities → combat → spells → combat … Darum hier keine Zugriffe auf
// importierte Werte beim Laden (nur in Funktionen); nur data.js darf beim Laden gelesen werden.
import { UNITS, CELL } from './data.js';
import { factionOf, query, touchTerrain, isBat, unseen } from './world.js';
import { fire, clearShot, fling, hurt, blast, hitWall } from './combat.js';
import { isFleeing } from './morale.js';
import { applyImpulse } from './physics.js';

const MAX_R = Math.max(...Object.values(UNITS).map(T => T.r));
const emit = (world, e) => { world.events.push(e); };
const sound = (world, k) => { world.events.push({ type: 'sound', k }); };

/* ---------- Wahl nach Lage ---------- */
// Lage geht vor, in dieser Reihenfolge: ein feindlicher Nahkämpfer (Reichweite < 20) bis MELEE_R px (Mitte zu Mitte
// plus sein Radius) → Windstoß, lädt der noch → Steinwand. Sonst nach dem Ziel: dichte Gruppe (mindestens DENSE_N
// Feinde bis DENSE_R px ums Ziel, das Ziel mitgezählt; auch ein dichter Bienenschwarm) → Feuerball vor Blitz; Flieger
// oder Einzelziel (kein weiterer Feind bis DENSE_R) → Blitz vor Feuerball; dazwischen (2 bis 3 Feinde am Boden)
// Feuerball vor Blitz. Kein Feuerball, wenn im Einschlagkreis (Splash des Magiers) mehr Eigene als Feinde stehen
// (Festlegung 2). Mit SECOND_P (world.rng) nimmt er den zweitbesten passenden Zauber; mit nur einem passenden wird
// nicht gewürfelt.
// REACT_T: Takt der Abwehrprüfung zwischen den Würfen (spellReact); RETRY: s bis zum nächsten Versuch einer Steinwand
// ohne Platz
export const SPELL = { MELEE_R: 60, DENSE_R: 45, DENSE_N: 4, SECOND_P: .2, RETRY: 2, REACT_T: .2 };
// Feuerball: Wurf und Splash des Magiers (UNITS.magier), zündet alle Getroffenen an (combat.impact → blast). GEN:
// Generation des Brands; 3 = höchste (combat.BURN_MAX_GEN): der Getroffene brennt, das Feuer springt nicht über (wie
// bei den Brandpfeilen; die Magier-Konter bleiben so im Rahmen).
export const FIREBALL = { GEN: 3 };
// Blitz: sofort auf das Ziel, dann bis zu JUMPS Sprünge, jeder auf den nächsten noch nicht getroffenen Feind bis R px
// (Mitte zu Mitte) vom letzten Treffer; Schaden DMG, je Sprung ×FALL. Springt nur auf Feinde (Festlegung 2), kein
// Feuer, kein Schild hält ihn ab.
export const LIGHTNING = { DMG: 18, FALL: .7, JUMPS: 3, R: 70 };
// Windstoß: Kegel ANGLE (gesamt) und R px in Richtung des Nahkämpfers. Jeder Körper darin (auch Eigene) wird vom Magier
// weggestoßen (combat.fling, Stoß I · Abfall 1 → 0,5 zum Rand; Leichte heben ab und landen betäubt), Bienen mit
// BEE_V px/s weit weg; nur Feinde nehmen DMG Schaden (Festlegung 2). Eigene Abklingzeit CD s.
export const WIND = { ANGLE: Math.PI / 3, R: 110, DMG: 4, CD: 6, I: 320, BEE_V: 1300 };
// Steinwand: höchstens N Mauerzellen auf einer Linie quer zur Angriffsrichtung, Mitte AHEAD px vor dem Magier, halbe
// Länge HALF px (in Zellschritten gemessen, schräg also kürzer: die Linie bleibt dicht). Nur auf freien Zellen (kein
// Gelände: keine Lava, kein Wasser, kein Missionsgelände, keine Mauer) ohne Bodeneinheit darauf; mindestens MIN
// Zellen, sonst keine Wand. Die Zellen tragen towner 2 (Zauber, wie eigenes Gelände für Malen und Radierer), 140
// LP wie eine gemalte Mauer und stehen T s; dann zerfallen sie in Brocken, die niemanden verletzen. Eigene
// Abklingzeit CD s.
export const STONE_WALL = { AHEAD: 40, HALF: 30, N: 7, MIN: 3, T: 12, CD: 10, OWNER: 2, HP: 140 };
// Meteor (Festlegung 4): ab MIN Magiern derselben Fraktion bis GROUP_R px um den Auslöser (stehend, nicht fliehend,
// ohne Abklingzeit, nicht schon im Kanal; höchstens MAX_M). Ziel: unter den CAND nächsten Feinden in Reichweite der
// mit den meisten Feinden bis FOE_R px, mindestens FOES; nicht, wenn im Einschlagkreis R mehr Eigene als Feinde
// stehen. Die Gruppe kanalisiert CHANNEL s und steht dabei still; fällt sie unter MIN (Tod, Betäubung, Schreck,
// Flucht), bricht er ab (die Übrigen versuchen es frühestens nach RETRY s wieder). Dann: blast R, DMG, Feuer, Brand
// der Generation GEN; jeder Teilnehmer lädt CD s. Ein Magier ohne Gruppe oder Ziel versucht es nach RETRY s wieder.
// SKY: Höhe des Sammelpunkts der Strahlen über dem Ziel (nur Darstellung, fxcore).
// Meteor (Wunsch Silas, 18.11.): weniger Einschlag (70 → 45), dafür Feuer der Generation 0 (springt weiter über), Abklingzeit 30 → 32 s
export const METEOR = {
  GROUP_R: 90, MIN: 3, MAX_M: 8, FOES: 6, FOE_R: 60, R: 80, DMG: 45, CHANNEL: 1.5, CD: 32, CAND: 16, GEN: 0, RETRY: 2,
  SKY: 160, WALL_MUL: 2,
};

const COS_HALF = Math.cos(WIND.ANGLE / 2);
const isMelee = v => v.T.range < 20 && !v.T.heal;

// Nächster feindlicher Nahkämpfer bis MELEE_R (Ergebnis in MT_V), Feinde und Eigene um einen Punkt (CN_FOE, CN_OWN)
let MT_W = null, MT_U = null, MT_F = null, MT_V = null, MT_D = 0;
function meleeTest(v) {
  if (!isMelee(v) || v.T.high || isBat(v) || factionOf(MT_W, v) === MT_F) return;   // Fledermausform beißt nicht
  if (v.hidden && unseen(MT_U, v)) return;   // verstecktes Krokodil (Task 5): der Magier sieht es nicht
  const dx = v.x - MT_U.x, dy = v.y - MT_U.y, d = dx * dx + dy * dy, r = SPELL.MELEE_R + v.T.r;
  if (d <= r * r && d < MT_D) { MT_D = d; MT_V = v; }
}
function meleeThreat(world, u) {
  MT_W = world; MT_U = u; MT_F = factionOf(world, u); MT_V = null; MT_D = Infinity;
  query(world, u.x, u.y, SPELL.MELEE_R + MAX_R, meleeTest);
  const v = MT_V;
  MT_W = null; MT_U = null; MT_F = null; MT_V = null;
  return v;
}
// Feinde (CN_FOE) und Eigene (CN_OWN) bis R px um (x, y); pad: Körperradius zählt mit (wie blast)
let CN_W = null, CN_F = null, CN_X = 0, CN_Y = 0, CN_R = 0, CN_PAD = false, CN_FOE = 0, CN_OWN = 0;
function countTest(v) {
  const dx = v.x - CN_X, dy = v.y - CN_Y, r = CN_R + (CN_PAD ? v.T.r : 0);
  if (dx * dx + dy * dy > r * r) return;
  if (factionOf(CN_W, v) === CN_F) CN_OWN++; else CN_FOE++;
}
function countAround(world, f, x, y, R, pad) {
  CN_W = world; CN_F = f; CN_X = x; CN_Y = y; CN_R = R; CN_PAD = pad; CN_FOE = 0; CN_OWN = 0;
  query(world, x, y, R + (pad ? MAX_R : 0), countTest);
  CN_W = null; CN_F = null;
}

// Rangliste der passenden Zauber (OPT, OPT_N) und der Nahkämpfer der Lage (THREAT)
const OPT = ['', '', '', ''];
let OPT_N = 0, THREAT = null;
function rank(world, u, t) {
  const f = factionOf(world, u);
  OPT_N = 0;
  THREAT = meleeThreat(world, u);
  if (THREAT) {
    if (!(u.windCd > 0)) OPT[OPT_N++] = 'wind';
    if (!(u.wallCd > 0) && !THREAT.T.fly) OPT[OPT_N++] = 'wall';   // Flieger kommen über die Mauer
  }
  countAround(world, f, t.x, t.y, u.T.splash, true);
  const fireOk = CN_OWN <= CN_FOE;
  countAround(world, f, t.x, t.y, SPELL.DENSE_R, false);
  const foes = CN_FOE;
  // Einzelziel oder Flieger: Blitz, außer gegen den Geist (Task 7): nur Feuer trifft ihn voll, der Blitz halb
  if (foes < SPELL.DENSE_N && (t.T.fly || foes <= 1)) {
    if (t.type === 'geist' && fireOk) { OPT[OPT_N++] = 'fireball'; OPT[OPT_N++] = 'lightning'; }
    else { OPT[OPT_N++] = 'lightning'; if (fireOk) OPT[OPT_N++] = 'fireball'; }
  }
  else { if (fireOk) OPT[OPT_N++] = 'fireball'; OPT[OPT_N++] = 'lightning'; }
}
function pick(world, u, t) {
  rank(world, u, t);
  return OPT_N > 1 && world.rng() < SPELL.SECOND_P ? OPT[1] : OPT[0];
}
export function chooseSpell(world, u, t) { const s = pick(world, u, t); THREAT = null; return s; }

/* ---------- Wurf ---------- */
// Ein Wurf des Magiers auf das Ziel t in Reichweite (combat.think, wenn u.cd ≤ 0): erst der Meteor (Gruppe bereit?),
// sonst ein Zauber nach chooseSpell. Feuerball mit verdeckter Bahn (ein Verbündeter zuerst im Weg) und Steinwand ohne
// Platz werden zum Blitz. Danach lädt er wie nach dem alten Feuerball (u.cd).
export function castSpell(world, u, t) {
  if (!(u.meteorCd > 0) && tryMeteor(world, u)) return 'meteor';
  let s = pick(world, u, t);
  const threat = THREAT;
  THREAT = null;
  const T = u.T;
  u.cd = T.cd * (.85 + world.rng() * .3);
  u.fireT = 0;   // Rückstoß des Stabs (rig.js)
  if (s === 'fireball') {
    const a = clearShot(world, u, t, 'fire');
    if (a) { fire(world, u, t, 'fire', a.x, a.y); return s; }
    s = 'lightning';
  }
  if (s === 'wind' || s === 'wall') {
    const dx = threat.x - u.x, dy = threat.y - u.y, d = Math.hypot(dx, dy) || 1;
    u.face = dx < 0 ? -1 : 1; u.fx = dx / d; u.fy = dy / d;
    if (s === 'wind') { windGust(world, u, dx / d, dy / d); return s; }
    if (stoneWall(world, u, dx / d, dy / d) > 0) return s;
    u.wallCd = SPELL.RETRY;
    s = 'lightning';
  }
  lightning(world, u, t);
  return s;
}

// Abwehr zwischen den Würfen (combat.think, solange der Magier nachlädt, u.cd > 0): Windstoß und Steinwand haben eigene
// Abklingzeiten und sind Antworten auf die Lage, darum prüft er sie alle REACT_T s (Drossel u.meleeT, nach id
// gestaffelt) und nicht nur, wenn er wieder werfen darf; sonst käme die Wand fast nie rechtzeitig zwischen ihn und den
// Angreifer. Ein feindlicher Nahkämpfer bis MELEE_R → Windstoß, lädt der → Steinwand (nicht gegen Flieger). Danach lädt
// er wie nach einem Wurf (u.cd). Kein Zufall. Liefert true, wenn er gezaubert hat.
export function spellReact(world, u) {
  if (u.meleeT > 0) return false;
  u.meleeT = SPELL.REACT_T + (u.id % 4) * .02;
  const windOk = !(u.windCd > 0), wallOk = !(u.wallCd > 0);
  if (!windOk && !wallOk) return false;
  const v = meleeThreat(world, u);
  if (!v || (!windOk && v.T.fly)) return false;
  const dx = v.x - u.x, dy = v.y - u.y, d = Math.hypot(dx, dy) || 1;
  if (windOk) windGust(world, u, dx / d, dy / d);
  else if (stoneWall(world, u, dx / d, dy / d) === 0) { u.wallCd = SPELL.RETRY; return false; }
  u.face = dx < 0 ? -1 : 1; u.fx = dx / d; u.fy = dy / d;
  u.cd = u.T.cd * (.85 + world.rng() * .3);
  u.fireT = 0;
  return true;
}

/* ---------- Blitz ---------- */
// Treffer der Kette (höchstens 1 + JUMPS), nächster Sprung über die Hash-Abfrage
const HIT = new Array(LIGHTNING.JUMPS + 1).fill(null);
let LN_W = null, LN_F = null, LN_N = 0, LN_X = 0, LN_Y = 0, LN_B = null, LN_D = 0;
function jumpTest(v) {
  if (factionOf(LN_W, v) === LN_F) return;
  for (let k = 0; k < LN_N; k++) if (HIT[k] === v) return;
  const dx = v.x - LN_X, dy = v.y - LN_Y, d = dx * dx + dy * dy;
  if (d <= LIGHTNING.R * LIGHTNING.R && d < LN_D) { LN_D = d; LN_B = v; }
}
export function lightning(world, u, t) {
  const L = LIGHTNING, f = factionOf(world, u), face = u.face < 0 ? -1 : 1;
  // vom Stab (Spitze oben vor dem Körper) zum ersten Ziel, dann von Ziel zu Ziel
  let x0 = u.x + face * u.T.r * 1.08, y0 = u.y, z0 = (u.z || 0) + u.T.r * 1.3, v = t, dmg = L.DMG;
  LN_N = 0;
  for (;;) {
    HIT[LN_N++] = v;
    const x1 = v.x, y1 = v.y, z1 = (v.z || 0) + v.T.r * .5;
    emit(world, { type: 'spell', k: 'bolt', x0, y0, z0, x1, y1, z1, n: LN_N });
    hurt(world, v, dmg, 'lightning', u);
    emit(world, { type: 'hit', x: x1, y: y1, flank: false, kind: 'lightning' });
    if (LN_N > L.JUMPS) break;
    LN_W = world; LN_F = f; LN_X = x1; LN_Y = y1; LN_B = null; LN_D = Infinity;
    query(world, x1, y1, L.R, jumpTest);
    const nv = LN_B;
    LN_W = null; LN_F = null; LN_B = null;
    if (!nv) break;
    x0 = x1; y0 = y1; z0 = z1; v = nv; dmg *= L.FALL;
  }
  HIT.fill(null);   // keine Verweise auf Einheiten festhalten
  sound(world, 'shot');
}

/* ---------- Windstoß ---------- */
let WD_W = null, WD_U = null, WD_F = null, WD_NX = 0, WD_NY = 0;
function windTest(v) {
  const u = WD_U;
  if (v === u) return;
  const dx = v.x - u.x, dy = v.y - u.y, d = Math.hypot(dx, dy), W = WIND;
  if (d > W.R + v.T.r || d < 1e-6 || dx * WD_NX + dy * WD_NY < COS_HALF * d) return;
  const ex = dx / d, ey = dy / d;
  if (v.type === 'biene') {
    const m = v.T.mass || 1;
    applyImpulse(v, ex * W.BEE_V * m, ey * W.BEE_V * m, 0);
  } else fling(v, ex, ey, 1, W.I * (1 - .5 * Math.min(1, d / W.R)));
  if (factionOf(WD_W, v) !== WD_F) hurt(WD_W, v, W.DMG, 'wind', u);
}
// Kegel in Richtung (nx, ny), Länge 1
export function windGust(world, u, nx, ny) {
  WD_W = world; WD_U = u; WD_F = factionOf(world, u); WD_NX = nx; WD_NY = ny;
  query(world, u.x, u.y, WIND.R + MAX_R, windTest);
  WD_W = null; WD_U = null; WD_F = null;
  u.windCd = WIND.CD; u.swingT = .25;
  emit(world, { type: 'spell', k: 'wind', x: u.x, y: u.y, nx, ny, R: WIND.R });
  sound(world, 'whoosh');
}

/* ---------- Steinwand ---------- */
const WALL_CELLS = new Int32Array(STONE_WALL.N);
let OC_X = 0, OC_Y = 0, OC_HIT = false;
function occTest(v) {
  if (v.T.fly) return;
  const dx = Math.max(Math.abs(v.x - OC_X) - CELL / 2, 0), dy = Math.max(Math.abs(v.y - OC_Y) - CELL / 2, 0), r = v.T.r + 1;
  if (dx * dx + dy * dy < r * r) { OC_HIT = true; return true; }
}
// Steht eine Bodeneinheit (auch eine geschleuderte) auf Zelle i (Körperkreis berührt das Zellquadrat)?
function occupied(world, i) {
  OC_X = (i % world.GW) * CELL + CELL / 2; OC_Y = ((i / world.GW) | 0) * CELL + CELL / 2; OC_HIT = false;
  query(world, OC_X, OC_Y, CELL + MAX_R, occTest);
  return OC_HIT;
}
// Wand quer zur Richtung (nx, ny), Länge 1. Liefert die Zahl gesetzter Zellen (0: keine Wand, keine Abklingzeit).
export function stoneWall(world, u, nx, ny) {
  const S = STONE_WALL, { GW, GH, terr, towner, whp } = world;
  const cx = u.x + nx * S.AHEAD, cy = u.y + ny * S.AHEAD, px = -ny, py = nx;
  const L = S.HALF / ((Math.abs(px) + Math.abs(py)) || 1);
  // von der Mitte nach außen (abwechselnd beide Seiten), bis N Zellen gesammelt sind
  let n = 0;
  for (let k = 0; n < S.N; k++) {
    const s = (k + 1 >> 1) * 2.5 * (k & 1 ? 1 : -1);
    if (Math.abs(s) > L) break;
    const x = cx + px * s, y = cy + py * s;
    if (x < 0 || y < 0 || x >= world.W || y >= world.H) continue;
    const gx = (x / CELL) | 0, gy = (y / CELL) | 0;
    if (gx >= GW || gy >= GH) continue;
    const i = gy * GW + gx;
    let dup = false;
    for (let j = 0; j < n; j++) if (WALL_CELLS[j] === i) dup = true;
    if (!dup) WALL_CELLS[n++] = i;
  }
  let m = 0;
  for (let j = 0; j < n; j++) { const i = WALL_CELLS[j]; if (terr[i] === 0 && !occupied(world, i)) WALL_CELLS[m++] = i; }
  if (m < S.MIN) return 0;
  let gx0 = GW, gy0 = GH, gx1 = 0, gy1 = 0;
  for (let j = 0; j < m; j++) {
    const i = WALL_CELLS[j], gx = i % GW, gy = (i / GW) | 0;
    terr[i] = 4; towner[i] = S.OWNER; whp[i] = S.HP;
    // Task 7: ein alter Eintrag derselben Zelle (Wand dort zerschlagen, noch nicht aus der Liste) ließe die neue Wand
    // mit seiner Restzeit zu früh zerfallen: je Zelle nur der neue Eintrag
    purgeCell(world.tempWalls, i);
    world.tempWalls.push({ i, t: S.T });
    if (gx < gx0) gx0 = gx; if (gx > gx1) gx1 = gx; if (gy < gy0) gy0 = gy; if (gy > gy1) gy1 = gy;
  }
  touchTerrain(world);
  emit(world, { type: 'terrain', gx0: Math.max(0, gx0 - 1), gy0: Math.max(0, gy0 - 1), gx1: Math.min(GW - 1, gx1 + 1), gy1: Math.min(GH - 1, gy1 + 1) });
  emit(world, { type: 'spell', k: 'wall', x: cx, y: cy, px, py, L, n: m });
  sound(world, 'thud');
  u.wallCd = S.CD; u.swingT = .25;
  return m;
}

// Steinwände ablaufen lassen: abgelaufene Zellen zerfallen (combat.hitWall mit voller LP: Gelände frei, towner 0,
// Brocken in Zufallsrichtungen, terrain-Ereignis, Flussfeld neu). Zellen, die inzwischen keine Steinwand mehr sind
// (zerschlagen, übermalt, radiert), fallen nur aus der Liste.
function stepTempWalls(world, dt) {
  const L = world.tempWalls;
  if (L.length === 0) return;
  const { terr, towner, whp } = world;
  let n = 0;
  for (let k = 0; k < L.length; k++) {
    const e = L[k];
    if (terr[e.i] !== 4 || towner[e.i] !== STONE_WALL.OWNER) continue;
    e.t -= dt;
    if (e.t <= 0) { hitWall(world, e.i, whp[e.i] + 1); continue; }
    L[n++] = e;
  }
  L.length = n;
}

function purgeCell(L, i) { let n = 0; for (let k = 0; k < L.length; k++) if (L[k].i !== i) L[n++] = L[k]; L.length = n; }

// Alle Steinwände sofort entfernen, ohne Brocken (Rückgängig: paint.undo)
export function clearSpellWalls(world) {
  const { terr, towner, whp } = world;
  let any = false;
  for (const e of world.tempWalls) {
    if (terr[e.i] === 4 && towner[e.i] === STONE_WALL.OWNER) { terr[e.i] = 0; towner[e.i] = 0; whp[e.i] = 0; any = true; }
  }
  for (let i = 0; i < towner.length; i++) if (towner[i] === STONE_WALL.OWNER) { terr[i] = 0; towner[i] = 0; whp[i] = 0; any = true; }
  world.tempWalls.length = 0;
  if (any) touchTerrain(world);
  return any;
}

/* ---------- Meteor ---------- */
// Gruppe (GR, GR_N; der Auslöser zuerst) und Kandidaten (CU/CS: die CAND nächsten Feinde in Reichweite)
const GR = new Array(METEOR.MAX_M).fill(null), CU = new Array(METEOR.CAND).fill(null), CS = new Float64Array(METEOR.CAND);
let GR_N = 0, MQ_W = null, MQ_U = null, MQ_F = null, MQ_R = 0, CN = 0;
const ready = v => v.alive && v.state === 'ok' && v.chanId === 0 && !(v.meteorCd > 0) && !isFleeing(v);
function groupTest(v) {
  if (GR_N >= METEOR.MAX_M || v === MQ_U || v.type !== 'magier' || factionOf(MQ_W, v) !== MQ_F || !ready(v)) return;
  const dx = v.x - MQ_U.x, dy = v.y - MQ_U.y;
  if (dx * dx + dy * dy <= METEOR.GROUP_R * METEOR.GROUP_R) GR[GR_N++] = v;
}
function candTest(v) {
  if (factionOf(MQ_W, v) === MQ_F || (v.hidden && unseen(MQ_U, v))) return;   // Task 5: verstecktes Krokodil ist kein Ziel
  const dx = v.x - MQ_U.x, dy = v.y - MQ_U.y, d = dx * dx + dy * dy, r = MQ_R + v.T.r, M = METEOR.CAND;
  if (d > r * r || (CN === M && d >= CS[M - 1])) return;
  let k = CN < M ? CN++ : M - 1;
  while (k > 0 && CS[k - 1] > d) { CS[k] = CS[k - 1]; CU[k] = CU[k - 1]; k--; }
  CS[k] = d; CU[k] = v;
}
function release() { GR.fill(null); CU.fill(null); MQ_W = null; MQ_U = null; MQ_F = null; }

// Versucht, mit u als Auslöser einen Meteor zu beginnen. true: die Gruppe kanalisiert (world.casts).
export function tryMeteor(world, u) {
  const M = METEOR, f = factionOf(world, u);
  MQ_W = world; MQ_U = u; MQ_F = f; GR_N = 0;
  if (!ready(u)) { release(); return false; }
  GR[GR_N++] = u;
  query(world, u.x, u.y, M.GROUP_R, groupTest);
  if (GR_N < M.MIN) { release(); u.meteorCd = M.RETRY; return false; }
  CN = 0; MQ_R = u.T.range + u.T.r;
  query(world, u.x, u.y, MQ_R + MAX_R, candTest);
  let bx = 0, by = 0, bn = 0;
  for (let k = 0; k < CN; k++) {
    countAround(world, f, CU[k].x, CU[k].y, M.FOE_R, false);
    if (CN_FOE > bn) { bn = CN_FOE; bx = CU[k].x; by = CU[k].y; }
  }
  if (bn < M.FOES) { release(); u.meteorCd = M.RETRY; return false; }
  countAround(world, f, bx, by, M.R, true);
  if (CN_OWN > CN_FOE) { release(); u.meteorCd = M.RETRY; return false; }
  // Kanal beginnen: alle stehen still und schauen zum Ziel; Sammelpunkt der Strahlen über dem Ziel, zur Gruppe hin
  let gx = 0;
  for (let k = 0; k < GR_N; k++) gx += GR[k].x;
  gx /= GR_N;
  const id = world.castNext++, m = GR.slice(0, GR_N);
  world.casts.push({ id, x: bx, y: by, t: 0, sx: bx + (gx - bx) * .35, sy: by - M.SKY, f, n: GR_N, m });
  for (const v of m) {
    v.chanId = id; v.mx = 0; v.my = 0;
    const dx = bx - v.x, dy = by - v.y, d = Math.hypot(dx, dy) || 1;
    v.face = dx < 0 ? -1 : 1; v.fx = dx / d; v.fy = dy / d;
  }
  release();
  emit(world, { type: 'spell', k: 'channel', x: bx, y: by, n: m.length });
  sound(world, 'whoosh');
  return true;
}

// Kanäle fortschreiben (sim.step, nach den Entscheidungen): Teilnehmer, die gestorben, betäubt, geschleudert,
// erschreckt oder auf der Flucht sind, fallen heraus; unter MIN bricht der Zauber ab, nach CHANNEL s schlägt er ein.
function stepCasts(world, dt) {
  const C = world.casts, M = METEOR;
  if (C.length === 0) return;
  let n = 0;
  for (let k = 0; k < C.length; k++) {
    const c = C[k], m = c.m;
    let j = 0;
    for (let q = 0; q < m.length; q++) {
      const v = m[q];
      if (v.alive && v.chanId === c.id && v.state === 'ok' && !isFleeing(v)) { m[j++] = v; continue; }
      if (v.chanId === c.id) { v.chanId = 0; v.meteorCd = M.RETRY; }
    }
    m.length = j; c.n = j;
    if (j < M.MIN) {
      for (const v of m) { v.chanId = 0; v.meteorCd = M.RETRY; }
      emit(world, { type: 'spell', k: 'fizzle', x: c.sx, y: c.sy });
      continue;
    }
    c.t += dt;
    if (c.t < M.CHANNEL - 1e-9) { C[n++] = c; continue; }
    for (const v of m) { v.chanId = 0; v.meteorCd = M.CD; }
    emit(world, { type: 'spell', k: 'meteor', x: c.x, y: c.y, R: M.R, shake: 12 });
    blast(world, c.x, c.y, M.R, M.DMG, c.f, m[0], 'fire', M.WALL_MUL, M.GEN);
    sound(world, 'impact');
  }
  C.length = n;
}

// Ein Schritt der Zauber in der Welt (sim.step): Meteor-Kanäle, dann die Steinwände
export function stepSpells(world, dt) {
  stepCasts(world, dt);
  stepTempWalls(world, dt);
}
