// Rückzug und Erholung (Spez. #27): rein, kein DOM, kein Zufall. combat.think ruft updateMorale als Erstes
// (nach Brand und Luft/Betäubung) und steuert bei true die Flucht (fleeSteer) statt des normalen Verhaltens;
// sim.step ruft updateCentroids nach updateFormations.
//
// Flucht beginnt bei hp ≤ FLEE · T.hp, für Römer im marschierenden Block (formOn) erst bei FLEE_FORM; ein
// fliehender Römer verlässt den Block sofort (formation.js nimmt Fliehende in keinen Block auf). Bedrohung u.tg:
// der nächste Gegner bis FLEE_LOOK px (2 · SAFE_R), gesucht über den Spatial Hash in Ringen um u (bricht ab, sobald
// kein näherer mehr möglich ist), gedrosselt alle FLEE_SCAN s (+ id % 4 · FLEE_STAGGER, gestaffelt; Takt über u.rt,
// das die Zielsuche auf der Flucht nicht braucht). Dazwischen gilt der gemerkte Gegner mit seiner aktuellen Lage.
// Weiter als SAFE_R zählt er nicht als Gefahr, die Einheit läuft aber weiter von ihm weg: sonst bliebe sie knapp
// außerhalb von SAFE_R stehen, ein langsamer Verfolger käme immer wieder heran, und sie erholte sich nie.
// Erholung: ist SAFE_T s lang kein Gegner in SAFE_R (u.safeT), steigen die LP um REGEN · T.hp je s; ab BACK · T.hp
// endet die Flucht (u.rt = 0: think sucht gleich ein neues Ziel).
// Letztes Gefecht: fliehen (anfangen und weiter fliehen) nur, solange die eigene Fraktion mindestens MIN_ALLIES
// andere lebende, nicht fliehende Einheiten hat; sonst gibt es keine Truppen, zu denen sie laufen kann, und sie
// kämpft bis zum Ende. Die Zahl kommt aus world.cent (n, Schwerpunkt-Durchlauf); Fluchtbeginn und -ende zählen n
// sofort mit, Tode erst beim nächsten Durchlauf (höchstens CENT_T s später).
// In die Ecke gedrängt oder eingeholt (u.cornerT): der Gegner ist ohne Unterbrechung höchstens Nahkampfreichweite
// plus 10 px (CORNER_PAD, Körperränder plus 14 px) entfernt; ab CORNER_T s schlägt die Einheit zurück (combat.think),
// bleibt aber auf der Flucht. cornerT wächst höchstens bis CORNER_T + PIN_HOLD. Bricht der Kontakt ab, fällt
// cornerT über CORNER_T hinaus erst mit der Zeit zurück (danach auf 0), also höchstens PIN_HOLD s lang. Festgenagelt (fleeSteer findet keine freie Fluchtrichtung, echte Ecke oder Kartenrand): gilt
// sofort als in die Ecke gedrängt, cornerT = CORNER_T + PIN_HOLD (combat.retreat); sie wehrt sich gegen die
// Bedrohung, auch gegen einen Fernkämpfer: ist er außer Reichweite, geht sie auf ihn los, PIN_HOLD s lang auch
// über den Moment hinaus, in dem wieder eine Richtung frei wäre (sonst pendelte sie in der Ecke hin und her).
// Erreicht die Einheit BACK · T.hp auf irgendeinem Weg (eigene Erholung, Sanitäter), endet die Flucht sofort.
import { factionOf } from './world.js';
import { HASH_CELL } from './data.js';
import { hazardAt } from './formation.js';

export const MORALE = { FLEE: .25, FLEE_FORM: .15, BACK: .6, SAFE_R: 200, SAFE_T: 2, REGEN: .05, SPEED: 1.2, CORNER_T: 1.5, MIN_ALLIES: 3 };
// Nahkampfreichweite (höchstens 4 px bei allen Nahkämpfern) plus 10 px, zusätzlich zu den beiden Radien
export const CORNER_PAD = 14;
export const PIN_HOLD = 3;
export const FLEE_SCAN = .1, FLEE_STAGGER = .02, FLEE_LOOK = 2 * MORALE.SAFE_R;
// Schwerpunkt je Fraktion (ohne Fliehende), neu alle CENT_T s
export const CENT_T = .25;
// Fluchtrichtung: weg vom Feind (Gewicht 1) plus HOME_W zum Schwerpunkt; näher als HOME_NEAR px am Schwerpunkt
// zählt er nicht mehr (dort warten, die Sanitäter kommen). Ohne Feind in SAFE_R läuft sie nur zum Schwerpunkt.
export const HOME_W = .7, HOME_NEAR = 50;
// Bodentruppen: Lava, Mauer und Kartenrand in PROBE px (zwei Proben: r + PROBE[0], r + PROBE[1]) gelten als
// versperrt; dann die freie Richtung unter FLEE_DIRS, die der Wunschrichtung am nächsten liegt, aber höchstens
// BACK_COS gegen die Richtung weg vom Feind (nicht an ihm vorbei). Gibt es keine, steht sie (in die Ecke gedrängt:
// der Feind kommt heran, cornerT läuft, sie wehrt sich). Dazu weg von
// Lava/Mauer, die in AVOID px (8 Richtungen) liegt, wie freie Römer (combat.holdSlot). Flieger prüfen nur den Rand.
export const PROBE = [6, 18], AVOID = 14, FLEE_DIRS = 16, EDGE = 8, BACK_COS = -.35;

const HC = HASH_CELL;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const SAFE_R2 = MORALE.SAFE_R * MORALE.SAFE_R;
const D8X = [1, -1, 0, 0, .7071, .7071, -.7071, -.7071], D8Y = [0, 0, 1, -1, .7071, -.7071, .7071, -.7071];
const DIRX = [], DIRY = [];
for (let k = 0; k < FLEE_DIRS; k++) { DIRX.push(Math.cos(k * 2 * Math.PI / FLEE_DIRS)); DIRY.push(Math.sin(k * 2 * Math.PI / FLEE_DIRS)); }

/* ---------- Schwerpunkt der Fraktionen ---------- */
// world.cent: Map Fraktion → { x, y, n } (lebende, nicht fliehende Einheiten). Objekte werden wiederverwendet;
// Fraktionen ohne Einheiten behalten n = 0.
export function updateCentroids(world, dt) {
  world.centT -= dt;
  if (world.centT > 0) return;
  world.centT = world.centT + CENT_T > 0 ? world.centT + CENT_T : CENT_T;
  const C = world.cent;
  C.forEach(resetC);
  const units = world.units;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (!u.alive || u.flee) continue;
    const f = factionOf(world, u);
    let c = C.get(f);
    if (!c) { c = { x: 0, y: 0, n: 0 }; C.set(f, c); }
    c.x += u.x; c.y += u.y; c.n++;
  }
  C.forEach(meanC);
}
function resetC(c) { c.x = 0; c.y = 0; c.n = 0; }
function meanC(c) { if (c.n) { c.x /= c.n; c.y /= c.n; } }

/* ---------- Bedrohung ---------- */
// Nächster Gegner (jede Art, auch Flieger) höchstens R px von u, über die Hash-Zellen in Ringen um u.
export const THREAT_SCAN = { calls: 0 };
export function nearestThreat(world, u, R) {
  const f = factionOf(world, u);
  if (world.totalAlive - (world.facCount.get(f) || 0) <= 0) return null;
  THREAT_SCAN.calls++;
  const { HW, HH, hash } = world, ux = u.x, uy = u.y;
  const cx = clamp(ux / HC | 0, 0, HW - 1), cy = clamp(uy / HC | 0, 0, HH - 1), maxR = Math.ceil(R / HC) + 1;
  let best = null, bd = R * R;
  for (let r = 0; r <= maxR; r++) {
    if (best && (r - 1) * HC > Math.sqrt(bd)) break;
    for (let gy = cy - r; gy <= cy + r; gy++) {
      if (gy < 0 || gy >= HH) continue;
      const edge = gy === cy - r || gy === cy + r, stp = edge ? 1 : Math.max(1, 2 * r);
      for (let gx = cx - r; gx <= cx + r; gx += stp) {
        if (gx < 0 || gx >= HW) continue;
        const cell = hash[gy * HW + gx];
        for (let i = 0; i < cell.length; i++) {
          const v = cell[i];
          if (!v.alive) continue;
          const d = (v.x - ux) ** 2 + (v.y - uy) ** 2;
          if (d <= bd && factionOf(world, v) !== f) { bd = d; best = v; }
        }
      }
    }
  }
  return best;
}

/* ---------- Zustand ---------- */
// Ein Denkschritt Moral für u (state 'ok'). Liefert true, solange u flieht.
export function updateMorale(world, u, dt) {
  const T = u.T, M = MORALE;
  const c = world.cent.get(factionOf(world, u)), others = c ? c.n - (u.flee ? 0 : 1) : 0;
  if (!u.flee) {
    if (u.hp > (u.formOn ? M.FLEE_FORM : M.FLEE) * T.hp || others < M.MIN_ALLIES) return false;
    c.n--;
    u.flee = true; u.safeT = 0; u.cornerT = 0; u.rt = 0; u.tg = null; u.run = 0;
    // Römer verlassen den Block (formation.rebuild nimmt Fliehende nicht wieder auf)
    if (u.formOn) { u.formOn = false; u.formFree = false; u.formVol = -1; u.formVx = 0; u.formVy = 0; }
  }
  else if (others < M.MIN_ALLIES) { endFlee(u, c); return false; }   // letztes Gefecht
  if (u.rt <= 0 || (u.tg && !u.tg.alive)) {
    u.tg = nearestThreat(world, u, FLEE_LOOK);
    u.rt = FLEE_SCAN + (u.id % 4) * FLEE_STAGGER;
  }
  const t = u.tg;
  let d2 = Infinity;
  if (t) d2 = (t.x - u.x) ** 2 + (t.y - u.y) ** 2;
  if (d2 <= SAFE_R2) u.safeT = 0; else u.safeT += dt;
  const cr = t ? T.r + t.T.r + CORNER_PAD : 0;
  // höchstens CORNER_T + PIN_HOLD: nach langem Nahkampf hält das Wehren nicht länger an als nach dem Festnageln
  if (t && d2 <= cr * cr) { u.cornerT += dt; if (u.cornerT > M.CORNER_T + PIN_HOLD) u.cornerT = M.CORNER_T + PIN_HOLD; }
  else u.cornerT = u.cornerT - dt > M.CORNER_T ? u.cornerT - dt : 0;
  if (u.safeT >= M.SAFE_T) {
    const hp = u.hp + M.REGEN * T.hp * dt;
    u.hp = hp < T.hp ? hp : T.hp;
  }
  // geheilt (Erholung oder Sanitäter): zurück in den Kampf, auch mit Gegner in SAFE_R
  if (u.hp >= M.BACK * T.hp) { endFlee(u, c); return false; }
  return true;
}
// Flucht endet (erholt oder letztes Gefecht): zählt wieder als kämpfende Einheit der Fraktion, sucht gleich ein Ziel
function endFlee(u, c) {
  u.flee = false; u.safeT = 0; u.cornerT = 0; u.rt = 0;
  if (c) c.n++;
}

/* ---------- Steuerung ---------- */
// Fluchtbewegung von u (auch für spätere Schreck-Zustände): weg von der Bedrohung u.tg (falls gesetzt und am
// Leben), gemischt mit der Richtung zum Schwerpunkt der eigenen Fraktion (world.cent). Zieht der Schwerpunkt auf
// den Feind zu, zählt nur sein seitlicher Anteil. Tempo T.speed · MORALE.SPEED, Blickrichtung = Laufrichtung.
// Bodentruppen meiden Lava, Mauern und den Kartenrand, Flieger nur den Rand. Liefert true, wenn keine
// Fluchtrichtung frei ist (festgenagelt: u steht).
export function fleeSteer(world, u, dt) {
  const T = u.T, t = u.tg && u.tg.alive ? u.tg : null;
  let ax = 0, ay = 0;
  if (t) {
    const ex = u.x - t.x, ey = u.y - t.y, l = Math.hypot(ex, ey);
    if (l > 1e-6) { ax = ex / l; ay = ey / l; } else { ax = u.face < 0 ? -1 : 1; }
  }
  let dx = ax, dy = ay;
  const c = world.cent.get(factionOf(world, u));
  if (c && c.n > 0) {
    const hx = c.x - u.x, hy = c.y - u.y, l = Math.hypot(hx, hy);
    if (l > HOME_NEAR) {
      let nx = hx / l, ny = hy / l;
      const k = nx * ax + ny * ay;
      if (k < 0) { nx -= k * ax; ny -= k * ay; }
      dx += HOME_W * nx; dy += HOME_W * ny;
    }
  }
  let l = Math.hypot(dx, dy);
  if (l < 1e-6) { u.mx = 0; u.my = 0; return false; }
  dx /= l; dy /= l;
  const fly = !!T.fly, haz = !fly && (!world.flow || world.flow.hazards > 0);
  if (blocked(world, u, dx, dy, haz)) {
    let bs = -Infinity, bx = 0, by = 0;
    const away = ax !== 0 || ay !== 0;
    for (let k = 0; k < FLEE_DIRS; k++) {
      const s = DIRX[k] * dx + DIRY[k] * dy;
      if (s > bs && (!away || DIRX[k] * ax + DIRY[k] * ay >= BACK_COS) && !blocked(world, u, DIRX[k], DIRY[k], haz)) { bs = s; bx = DIRX[k]; by = DIRY[k]; }
    }
    if (bs === -Infinity) { u.mx = 0; u.my = 0; return true; }   // festgenagelt
    dx = bx; dy = by;
  }
  if (haz) {
    let rx = 0, ry = 0;
    for (let k = 0; k < 8; k++) if (hazardAt(world, u.x + D8X[k] * AVOID, u.y + D8Y[k] * AVOID)) { rx -= D8X[k]; ry -= D8Y[k]; }
    const rl = Math.hypot(rx, ry);
    if (rl > 1e-6) { dx += rx / rl; dy += ry / rl; l = Math.hypot(dx, dy); if (l > 1e-6) { dx /= l; dy /= l; } }
  }
  const sp = T.speed * MORALE.SPEED;
  u.mx = dx * sp; u.my = dy * sp; u.fx = dx; u.fy = dy;
  if (dx < -.2) u.face = -1; else if (dx > .2) u.face = 1;
  return false;
}

// Richtung (dx, dy) versperrt? Kartenrand (EDGE px) bei r + PROBE[1], dazu für Bodentruppen (haz) Lava/Mauer bei
// r + PROBE[0] und r + PROBE[1]
function blocked(world, u, dx, dy, haz) {
  const r = u.T.r, p0 = r + PROBE[0], p1 = r + PROBE[1];
  const x1 = u.x + dx * p1, y1 = u.y + dy * p1;
  if ((x1 < EDGE && dx < 0) || (x1 > world.W - EDGE && dx > 0) || (y1 < EDGE && dy < 0) || (y1 > world.H - EDGE && dy > 0)) return true;
  return haz && (hazardAt(world, u.x + dx * p0, u.y + dy * p0) || hazardAt(world, x1, y1));
}
