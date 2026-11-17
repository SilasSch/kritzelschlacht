// Römer-Blockformation (Spez. #25): Römer derselben Fraktion marschieren als geschlossener Block mit festen
// Plätzen im Gleichschritt, alle im Tempo des Langsamsten. Rein: kein DOM, kein Zufall. sim.step ruft
// updateFormations direkt nach updateFlow; combat.think liest die Felder auf den Römern (formOn, slotX/slotY,
// formVx/formVy, formSp, formAx/formAy).
//
// Blöcke entstehen alle FORM.REFORM s neu (rebuild): Römer derselben Fraktion, die über Ketten mit Abstand
// ≤ LINK verbunden sind (Suche über den Spatial Hash), bilden eine Gruppe; ab MIN Römern im Zustand 'ok'
// wird sie ein Block. Die Gruppe übernimmt id und Zustand des alten Blocks, aus dem die meisten ihrer
// Mitglieder kommen (Gruppen nach Größe abgearbeitet: bei einer Teilung behält der größere Teil die id, der
// kleinere bekommt eine neue, aber denselben Zustand).
// Plätze: cols = clamp(round(√(n·2,5)), 2, 10) Spalten, Reihen- und Spaltenabstand SPACING, erste Reihe vorn
// in Blickrichtung (ax, ay). Zuordnung: Mitglieder nach Tiefe entlang der Blickrichtung, dann je Reihe nach
// Seitenlage; wer gerade nicht steuerbar ist (betäubt, in der Luft), wird nach seinem alten Platz einsortiert.
// Blickrichtung (bei jeder Neubildung): zum nächsten Gegner; ist die gerade Linie dorthin verbaut
// (pathing.directBlocked), die Richtung des Flussfelds im Blockzentrum (ohne Weg doch zum Gegner). Sie dreht
// erst ab FORM_TURN rad Unterschied, damit der Block nicht zittert.
//
// Jeder Schritt, nur für marschierende Blöcke und ihre Mitglieder (march): Das Zentrum folgt dem Gegner bzw.
// bei verbauter Linie dem Flussfeld der Fraktion mit dem Blocktempo speed (Minimum der Tempi) mal dem
// langsamsten Gelände unter einem Mitglied (wie physics.integrate) mal dem Sammelfaktor (größte Platzabweichung
// ≤ FORM_LOOSE[0] px: voll, ≥ FORM_LOOSE[1] px: FORM_LOOSE[2]). So wartet der Block auf Nachzügler und auf den
// Hintermann, der in eine Lücke rückt. Das Zentrum läuft höchstens FORM_LEAD px vor der Lage, die die
// Mitglieder tatsächlich einnehmen (Mittel aus Lage minus Platzversatz), damit es an einer Mauer nicht
// davonläuft. Platz = Zentrum + gedrehter Versatz. Liegt ein Platz auf Lava oder Mauer, gibt der Block den Römer
// frei (FORM_PROBE); freie Römer zählen weder für Zentrum noch Tempo. Sind mehr als die Hälfte frei, zählt das
// als Festhängen.
// Speerwurf: Hat der Block zum ersten Mal einen Gegner ≤ PILUM_MAX px vor der vordersten Reihe, läuft seine
// Uhr volT; jedes Mitglied bekommt formVol = volT − PILUM_RANK_DT · Reihe (Reihe nach dem Platz, vorn 0).
// combat.think wirft ab formVol ≥ 0 den einen Speer, wenn das eigene Ziel in [PILUM_MIN, PILUM_MAX] px ist.
// Auflösen (state 'charge'): ein Gegner ≤ ENGAGE px von der vordersten Reihe (Mitglied mit der größten
// Tiefe), ein Gegner ≤ FORM_FLANK px an irgendeinem Mitglied (Flanke, Prüfung gestaffelt nach id), oder der
// Block kommt STUCK s lang keine STUCK_PX weit (stuckT). Danach bleibt er aufgelöst, bis kein Gegner mehr in
// ENGAGE · 2 px um ein Mitglied ist und, nach Festhängen, mindestens STUCK s vergangen sind (holdT); geprüft
// bei der Neubildung. Aufgelöste Römer verhalten sich wie Krieger.
import { factionOf, query, nearestEnemy, cellIndex } from './world.js';
import { flowDir, directBlocked } from './pathing.js';

export const FORM = { MIN: 4, LINK: 46, SPACING: 22, ENGAGE: 90, PILUM_MIN: 90, PILUM_MAX: 160, REFORM: .5, STUCK: 3 };
export const FORM_LEAD = 22;              // px: so weit darf das Zentrum der tatsächlichen Lage vorauslaufen
export const FORM_FLANK = 40;             // px: Gegner so nah an einem Mitglied löst den Block auf
export const FORM_LOOSE = [6, 30, .3];    // Sammelfaktor: größte Platzabweichung (px) → Tempoanteil
export const FORM_TURN = .14;             // rad (≈ 8°): kleinere Änderungen der Blickrichtung zählen nicht
export const FORM_GAIN = 4;               // 1/s: think steuert Blocktempo + Abweichung · FORM_GAIN (combat.think)
export const FORM_CATCHUP = 1.25;         // think: höchstens speed · 1,25
const STUCK_PX = 10;
// Freigabe an Hindernissen: ein Römer, dessen Platz auf oder bis SLOT_MARGIN px neben Lava oder Mauer liegt
// oder dessen gerader Weg dorthin in den nächsten FORM_PROBE px eine solche Zelle kreuzt, verlässt den Platz
// (formFree) und läuft wie eine einzelne Bodeneinheit dem Flussfeld nach (combat.think); zurück, sobald der
// Platz und der ganze Weg (bis FREE_LOOK px) frei sind. Der Block bleibt in Formation.
export const FORM_PROBE = 20;
const FREE_LOOK = 400, LOOK_STEP = 5, SLOT_MARGIN = 10;
const HAZ = [false, false, true, false, true];   // nach Gelände-id: Lava, Mauer
// Lava oder Mauer unter (x, y)? (combat.think: freie Römer treten nicht hinein)
export const hazardAt = (world, x, y) => HAZ[world.terr[cellIndex(world, x, y)]];
const FLANK_EVERY = 6;                    // Flankenprüfung je Mitglied jeden 6. Schritt (nach id versetzt)
const TURN_COS = Math.cos(FORM_TURN);
// Geländebremse wie physics.integrate (Wasser, Lava, Wald)
const TERR_SP = [1, .4, .8, .85, 1];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------- Schilde und Speerwurf ---------- */
// Schilde wirken nur in Formation (formOn): Pfeile, Kugeln und Speere, die von vorn kommen (Flugrichtung
// höchstens 60° gegen die Blickrichtung des Blocks), richten nur SHIELD_MUL des Schadens an (combat.landArc,
// combat.impact). Explosionen, Feuerbälle, Raketen, Brand und Nahkampf gehen nie über diesen Test.
export const SHIELD_KINDS = new Set(['arrow', 'bullet', 'pilum']);
export const SHIELD_MUL = .1, SHIELD_COS = .5;   // cos 60°
// Speerwurf: Versatz je Reihe (s) ab dem Moment, in dem der Block zum ersten Mal einen Gegner höchstens
// PILUM_MAX px vor seiner vordersten Reihe hat (march: f.volT, je Mitglied u.formVol = Zeit seit seiner Freigabe)
export const PILUM_RANK_DT = .15;
// Hält das Schild von v ein Geschoss der Art kind mit Flugrichtung (dx, dy) ab?
export function shieldBlocks(v, kind, dx, dy) {
  if (v.type !== 'roemer' || !v.formOn || !SHIELD_KINDS.has(kind)) return false;
  const l = Math.hypot(dx, dy);
  return l > 1e-9 && -(dx * v.formAx + dy * v.formAy) / l >= SHIELD_COS;
}

function makeForm(id, faction) {
  return {
    id, faction, n: 0, cx: 0, cy: 0, ax: 0, ay: 0, speed: 0, state: 'march', stuckT: 0,
    holdT: 0, sx: 0, sy: 0, vx: 0, vy: 0, tg: null, blocked: false,
    volT: -1,                // s seit dem ersten Gegner ≤ PILUM_MAX vor der Front (Speerwurf), −1 = noch keiner
    m: [], oD: [], oL: [],   // Mitglieder und ihr Platzversatz (Tiefe entlang ax/ay, Seite entlang −ay/ax)
  };
}

/* ---------- Gegner in der Nähe ---------- */
// Rückruf über Modulvariablen (keine Closure je Aufruf)
let EN_W = null, EN_F = null, EN_X = 0, EN_Y = 0, EN_R2 = 0, EN_HIT = false;
function enemyTest(v) {
  // Hubschrauber erreichen Nahkämpfer nicht (wie world.nearestEnemy)
  if (v.type === 'heli' || factionOf(EN_W, v) === EN_F) return;
  const dx = v.x - EN_X, dy = v.y - EN_Y;
  if (dx * dx + dy * dy <= EN_R2) { EN_HIT = true; return true; }
}
function enemyWithin(world, faction, x, y, R) {
  EN_W = world; EN_F = faction; EN_X = x; EN_Y = y; EN_R2 = R * R; EN_HIT = false;
  query(world, x, y, R, enemyTest);
  EN_W = null; EN_F = null;
  return EN_HIT;
}

/* ---------- Neubildung ---------- */
const ROM = [], GRP = [], SEEN = new Set();
let GR_W = null, GR_F = null, GR_X = 0, GR_Y = 0;
const LINK2 = FORM.LINK * FORM.LINK;
function linkTest(v) {
  if (v.type !== 'roemer' || SEEN.has(v) || factionOf(GR_W, v) !== GR_F) return;
  const dx = v.x - GR_X, dy = v.y - GR_Y;
  if (dx * dx + dy * dy > LINK2) return;
  SEEN.add(v); GRP.push(v);
}

function rebuild(world) {
  const old = world.formations, oldById = new Map();
  for (let k = 0; k < old.length; k++) oldById.set(old[k].id, old[k]);
  const claimed = new Set(), out = [];
  ROM.length = 0;
  for (const u of world.units) if (u.alive && u.type === 'roemer') ROM.push(u);
  if (ROM.length === 0) { if (old.length) world.formations = []; return; }
  SEEN.clear();
  GR_W = world;
  const groups = [];
  for (let r = 0; r < ROM.length; r++) {
    const u0 = ROM[r];
    if (SEEN.has(u0)) continue;
    GRP.length = 0; GRP.push(u0); SEEN.add(u0);
    GR_F = factionOf(world, u0);
    for (let k = 0; k < GRP.length; k++) { const a = GRP[k]; GR_X = a.x; GR_Y = a.y; query(world, a.x, a.y, FORM.LINK, linkTest); }
    let ok = 0;
    for (let k = 0; k < GRP.length; k++) if (GRP[k].state === 'ok') ok++;
    if (ok < FORM.MIN) { for (let k = 0; k < GRP.length; k++) { GRP[k].form = 0; GRP[k].formOn = false; GRP[k].formFree = false; } continue; }
    groups.push(GRP.slice());
  }
  // größere Gruppen zuerst: bei einer Teilung behält der größere Teil die alte id (sort ist stabil)
  groups.sort((a, b) => b.length - a.length);
  for (let g = 0; g < groups.length; g++) {
    GRP.length = 0; for (const u of groups[g]) GRP.push(u);
    out.push(adopt(world, factionOf(world, GRP[0]), oldById, claimed));
  }
  GR_W = null; GR_F = null; GRP.length = 0; ROM.length = 0; SEEN.clear();
  world.formations = out;
}

// Block aus der Gruppe GRP: id und Zustand vom alten Block der meisten Mitglieder, dann Plätze
function adopt(world, faction, oldById, claimed) {
  const votes = new Map();
  let best = 0, bv = 0;
  for (let k = 0; k < GRP.length; k++) {
    const id = GRP[k].form, o = id ? oldById.get(id) : null;
    if (!o || o.faction !== faction) continue;
    const c = (votes.get(id) || 0) + 1; votes.set(id, c);
    if (c > bv || (c === bv && id < best)) { bv = c; best = id; }
  }
  const prev = best ? oldById.get(best) : null;
  let f;
  if (prev && !claimed.has(best)) { f = prev; claimed.add(best); }
  else {
    f = makeForm(world.formNext++, faction);
    if (prev) { f.state = prev.state; f.holdT = prev.holdT; f.ax = prev.ax; f.ay = prev.ay; f.volT = prev.volT; }
  }
  const fresh = f !== prev;
  // Schwerpunkt der Gruppe
  let gx = 0, gy = 0, sp = Infinity;
  for (let k = 0; k < GRP.length; k++) { const u = GRP[k]; gx += u.x; gy += u.y; if (u.T.speed < sp) sp = u.T.speed; }
  gx /= GRP.length; gy /= GRP.length;
  f.speed = sp;
  if (f.state === 'charge' && f.holdT <= 0 && !groupNearEnemy(world, faction)) {
    f.state = 'march'; f.stuckT = 0; f.cx = gx; f.cy = gy; f.sx = gx; f.sy = gy;
    f.volT = -1;   // neuer Anmarsch: wer noch einen Speer hat, wirft beim nächsten Zusammenstoß
  } else if (fresh) { f.cx = gx; f.cy = gy; f.sx = gx; f.sy = gy; f.stuckT = 0; }
  if (f.state === 'march') face(world, f, gx, gy);
  slots(f);
  return f;
}

function groupNearEnemy(world, faction) {
  for (let k = 0; k < GRP.length; k++) if (enemyWithin(world, faction, GRP[k].x, GRP[k].y, FORM.ENGAGE * 2)) return true;
  return false;
}

// Ziel und Blickrichtung des Blocks (gx, gy: Schwerpunkt; das Zentrum hängt höchstens FORM_LEAD davor)
function face(world, f, gx, gy) {
  let rep = GRP[0], rd = Infinity;
  for (let k = 0; k < GRP.length; k++) { const u = GRP[k], d = (u.x - gx) ** 2 + (u.y - gy) ** 2; if (d < rd) { rd = d; rep = u; } }
  const t = nearestEnemy(world, rep);
  f.tg = t;
  let nx = 0, ny = 0;
  if (t) {
    f.blocked = directBlocked(world, world.flow, f.cx, f.cy, t.x, t.y) !== 0;
    if (f.blocked && world.flow) { const fd = flowDir(world.flow, f.faction, f.cx, f.cy); if (fd && fd.dist > 0) { nx = fd.dx; ny = fd.dy; } }
    if (nx === 0 && ny === 0) { const dx = t.x - f.cx, dy = t.y - f.cy, l = Math.hypot(dx, dy); if (l > 1e-6) { nx = dx / l; ny = dy / l; } }
  } else f.blocked = false;
  if (nx === 0 && ny === 0) { if (f.ax === 0 && f.ay === 0) { f.ax = rep.face < 0 ? -1 : 1; f.ay = 0; } return; }
  if ((f.ax === 0 && f.ay === 0) || nx * f.ax + ny * f.ay < TURN_COS) { f.ax = nx; f.ay = ny; }
}

// Plätze: Mitglieder nach Tiefe (vorn zuerst), dann je Reihe nach Seitenlage
const KEY_D = new Map(), KEY_L = new Map();
function slots(f) {
  const n = GRP.length, S = FORM.SPACING, ax = f.ax, ay = f.ay, px = -ay, py = ax;
  const cols = clamp(Math.round(Math.sqrt(n * 2.5)), 2, 10), rows = Math.ceil(n / cols);
  for (let k = 0; k < n; k++) {
    const u = GRP[k];
    // nicht steuerbar: behält seinen Platz (alte Platzlage statt der Lage im Flug)
    const keep = u.state !== 'ok' && u.form === f.id;
    const x = (keep ? u.slotX : u.x) - f.cx, y = (keep ? u.slotY : u.y) - f.cy;
    KEY_D.set(u, x * ax + y * ay); KEY_L.set(u, x * px + y * py);
  }
  const m = GRP.slice().sort((a, b) => (KEY_D.get(b) - KEY_D.get(a)) || (a.id - b.id));
  f.m = m; f.oD.length = n; f.oL.length = n; f.n = n;
  for (let j = 0; j < rows; j++) {
    const i0 = j * cols, cnt = Math.min(cols, n - i0);
    const row = m.slice(i0, i0 + cnt).sort((a, b) => (KEY_L.get(a) - KEY_L.get(b)) || (a.id - b.id));
    const dep = ((rows - 1) / 2 - j) * S;
    for (let i = 0; i < cnt; i++) { m[i0 + i] = row[i]; f.oD[i0 + i] = dep; f.oL[i0 + i] = (i - (cnt - 1) / 2) * S; }
  }
  KEY_D.clear(); KEY_L.clear();
  const on = f.state === 'march';
  for (let k = 0; k < n; k++) {
    const u = m[k];
    u.form = f.id; u.formOn = on;
    u.formAx = ax; u.formAy = ay; u.formSp = f.speed;
    u.slotX = f.cx + ax * f.oD[k] + px * f.oL[k]; u.slotY = f.cy + ay * f.oD[k] + py * f.oL[k];
    if (!on) { u.formVx = 0; u.formVy = 0; }
  }
}

/* ---------- Marsch ---------- */
function charge(f, hold) {
  f.state = 'charge'; f.holdT = hold; f.vx = 0; f.vy = 0;
  const m = f.m;
  for (let k = 0; k < m.length; k++) { const u = m[k]; u.formOn = false; u.formFree = false; u.formVx = 0; u.formVy = 0; u.formVol = -1; }
}

// Platz auf oder bis SLOT_MARGIN px neben Lava/Mauer (der Körper ragte sonst hinein, ein Schubs genügt)
function slotHazard(world, x, y) {
  const M = SLOT_MARGIN;
  return hazardAt(world, x, y) || hazardAt(world, x + M, y) || hazardAt(world, x - M, y) || hazardAt(world, x, y + M) || hazardAt(world, x, y - M);
}

// Lava- oder Mauerzelle auf der Strecke (x0, y0) → (x1, y1), geprüft alle LOOK_STEP px bis höchstens maxL px
function lineHazard(world, x0, y0, x1, y1, maxL) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), terr = world.terr;
  if (L < 1e-6) return false;
  const end = L < maxL ? L : maxL;
  for (let s = LOOK_STEP; s < end + LOOK_STEP; s += LOOK_STEP) {
    const q = s < end ? s : end;
    if (HAZ[terr[cellIndex(world, x0 + dx * q / L, y0 + dy * q / L)]]) return true;
  }
  return false;
}

function march(world, f, dt) {
  const m = f.m, ax = f.ax, ay = f.ay, px = -ay, py = ax, terr = world.terr;
  let n = 0, ix = 0, iy = 0, worst = 0, tsp = 1, front = null, fd = -Infinity, alive = 0, free = 0;
  for (let k = 0; k < m.length; k++) {
    const u = m[k];
    if (!u.alive) continue;
    alive++;
    const ox = ax * f.oD[k] + px * f.oL[k], oy = ay * f.oD[k] + py * f.oL[k];
    const pr = (u.x - f.cx) * ax + (u.y - f.cy) * ay;
    if (pr > fd) { fd = pr; front = u; }
    if (u.state !== 'ok') continue;
    // Platz auf Lava/Mauer oder Weg dorthin gleich verbaut: frei (Flussfeld); zurück, sobald Platz und ganzer Weg frei
    const sx = f.cx + ox, sy = f.cy + oy;
    if (u.formFree) { if (!slotHazard(world, sx, sy) && !lineHazard(world, u.x, u.y, sx, sy, FREE_LOOK)) u.formFree = false; }
    else if (slotHazard(world, sx, sy) || lineHazard(world, u.x, u.y, sx, sy, FORM_PROBE)) u.formFree = true;
    if (u.formFree) { free++; continue; }
    n++; ix += u.x - ox; iy += u.y - oy;
    const e = Math.hypot(u.x - f.cx - ox, u.y - f.cy - oy); if (e > worst) worst = e;
    const s = TERR_SP[terr[cellIndex(world, u.x, u.y)]] || 1; if (s < tsp) tsp = s;
  }
  f.n = alive;
  if (n === 0 && free === 0) { f.vx = 0; f.vy = 0; return; }
  // Mehr als die Hälfte der Plätze verbaut: zählt als Festhängen (der Block löst sich nach STUCK s auf)
  const jammed = free * 2 > n + free;
  if (n > 0) { ix /= n; iy /= n; } else { ix = f.cx; iy = f.cy; }
  // Gegner vor der Front oder an der Flanke: auflösen
  if (front && enemyWithin(world, f.faction, front.x, front.y, FORM.ENGAGE)) { charge(f, 0); return; }
  const tick = (world.time * 60) | 0;
  for (let k = 0; k < m.length; k++) {
    const u = m[k];
    if (u.alive && (tick + u.id) % FLANK_EVERY === 0 && enemyWithin(world, f.faction, u.x, u.y, FORM_FLANK)) { charge(f, 0); return; }
  }
  // Speerwurf: Uhr ab dem ersten Gegner ≤ PILUM_MAX vor der Front (die Reihen werfen danach gestaffelt)
  if (f.volT >= 0) f.volT += dt;
  else if (front && enemyWithin(world, f.faction, front.x, front.y, FORM.PILUM_MAX)) f.volT = 0;
  // Richtung: zum Ziel, bei verbauter Linie das Flussfeld im Zentrum
  const t = f.tg && f.tg.alive ? f.tg : null;
  let dx = 0, dy = 0;
  if (t) {
    if (f.blocked && world.flow) { const d = flowDir(world.flow, f.faction, f.cx, f.cy); if (d && d.dist > 0) { dx = d.dx; dy = d.dy; } }
    if (dx === 0 && dy === 0) { const ex = t.x - f.cx, ey = t.y - f.cy, l = Math.hypot(ex, ey); if (l > 1e-6) { dx = ex / l; dy = ey / l; } }
  }
  const [L0, L1, LMIN] = FORM_LOOSE;
  const loose = worst <= L0 ? 1 : worst >= L1 ? LMIN : 1 - (1 - LMIN) * (worst - L0) / (L1 - L0);
  const sp = n > 0 ? f.speed * tsp * loose : 0;
  f.vx = dx * sp; f.vy = dy * sp;
  f.cx += f.vx * dt; f.cy += f.vy * dt;
  // nicht davonlaufen: höchstens FORM_LEAD vor der tatsächlichen Lage
  const lx = f.cx - ix, ly = f.cy - iy, ll = Math.hypot(lx, ly);
  if (ll > FORM_LEAD) { f.cx = ix + lx * FORM_LEAD / ll; f.cy = iy + ly * FORM_LEAD / ll; }
  // Festhängen: tatsächliche Lage kommt STUCK s lang keine STUCK_PX weit
  if (t) {
    if (!jammed && Math.hypot(ix - f.sx, iy - f.sy) >= STUCK_PX) { f.sx = ix; f.sy = iy; f.stuckT = 0; }
    else { f.stuckT += dt; if (f.stuckT >= FORM.STUCK) { charge(f, FORM.STUCK); return; } }
  } else { f.sx = ix; f.sy = iy; f.stuckT = 0; }
  const d0 = f.oD[0], S = FORM.SPACING;
  for (let k = 0; k < m.length; k++) {
    const u = m[k];
    if (!u.alive) continue;
    u.slotX = f.cx + ax * f.oD[k] + px * f.oL[k]; u.slotY = f.cy + ay * f.oD[k] + py * f.oL[k];
    u.formVx = f.vx; u.formVy = f.vy;
    // Reihe nach dem Platz (vorn 0): Freigabe des Wurfs PILUM_RANK_DT s je Reihe später
    u.formVol = f.volT >= 0 ? f.volT - PILUM_RANK_DT * Math.round((d0 - f.oD[k]) / S) : -1;
  }
}

// Ein Schritt: alle REFORM s neu bilden, dann die marschierenden Blöcke bewegen
export function updateFormations(world, dt) {
  world.formT -= dt;
  if (world.formT <= 0) {
    world.formT = world.formT + FORM.REFORM > 0 ? world.formT + FORM.REFORM : FORM.REFORM;
    rebuild(world);
  }
  const fs = world.formations;
  for (let k = 0; k < fs.length; k++) {
    const f = fs[k];
    if (f.state === 'march') march(world, f, dt);
    else if (f.holdT > 0) f.holdT -= dt;
  }
}
