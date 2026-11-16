// Wegfindung der Bodentruppen (Spez. #24): ein geteiltes Flussfeld je Fraktion auf einem groben Raster.
// Rein: kein DOM, kein Zufall. sim.step ruft updateFlow, combat.think liest flowDir und directBlocked.
//
// Raster PATH_CELL = 20 px (je 2×2 Geländezellen). Ein Feld ist Mauer (unpassierbar), wenn mindestens
// 2 seiner 4 Geländezellen Mauer sind; sonst kostet es so viel wie seine teuerste Zelle (frei 1, Wald 1,3,
// Wasser 2,5, Lava 12; ganzzahlig ×10). Je Fraktion ein Distanzfeld per Dijkstra mit Bucket-Queue
// (Dial, ringförmig), mehrere Quellen: alle lebenden Gegner-Bodeneinheiten dieser Fraktion. Schritt zum
// Nachbarn: Mittel der beiden Feldkosten, diagonal ×√½·2 (≈ ×1,41), diagonal nicht an Mauerecken vorbei.
// Neu berechnet wird je Fraktion alle PATH_REFRESH s (gestaffelt, höchstens 1 dieser Auffrischungen je
// Schritt) und sofort nach einer Geländeänderung (world.terrainVersion, auch Größenänderung); insgesamt
// höchstens PATH_MAX_PER_STEP Felder je Schritt. Felder gibt es nur für Fraktionen mit lebenden
// Bodentruppen und nur solange mindestens zwei Fraktionen Bodentruppen haben. Puffer werden je Fraktion
// wiederverwendet (neu nur bei neuer Fraktion oder neuer Rastergröße).
import { CELL } from './data.js';
import { factionOf } from './world.js';

export const PATH_CELL = 20;
export const PATH_COST = { free: 10, forest: 13, water: 25, lava: 120 };   // ×10 (1 / 1,3 / 2,5 / 12)
export const PATH_REFRESH = .5;          // s je Fraktion
export const PATH_MAX_PER_STEP = 2;      // Felder je Schritt höchstens
export const PATH_BASH_DETOUR = 2.5;     // think: einschlagen erst, wenn der Flussweg länger ist als 2,5× Luftlinie
export const PATH_BASH_MIN = 80;         // think: … und mindestens so viele px länger (kurze Wege um eine Ecke)
export const PATH_LAVA_CELLS = 2;        // think: gerade Linie über so viele Lavazellen folgt auch dem Fluss

const WALL = 4, LAVA = 2;
const TCOST = [PATH_COST.free, PATH_COST.water, PATH_COST.lava, PATH_COST.forest, 0];   // nach Gelände-id
const INF = 0x3fffffff;
const NB = 256, MASK = NB - 1;           // Ring der Bucket-Queue; größter Schritt (120+120)·181>>8 = 169 < 256
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const now = () => (globalThis.performance ? globalThis.performance.now() : 0);

export function createFlow(world) {
  const flow = {
    PW: 0, PH: 0, N: 0, GW: -1, GH: -1, terrRef: null, ver: -1,
    cost: new Uint8Array(0), hazards: 0,          // hazards: Mauer- plus Lavazellen im Geländeraster
    head: new Int32Array(NB), next: new Int32Array(0), prev: new Int32Array(0),
    fields: new Map(), list: [], gen: 0,          // list: dieselben Felder in Reihenfolge (Schleifen ohne Iteratoren)
    // Zähler für ?debug (__kritzel.flow()): Neuberechnungen gesamt, ms gesamt/letzte/max, je s
    stats: { recomputes: 0, ms: 0, lastMs: 0, maxMs: 0, rate: 0, msRate: 0, winN: 0, winMs: 0, winT: 0 },
  };
  rebuildCost(world, flow);
  return flow;
}

function makeField(flow, f) {
  return { f, dist: new Int32Array(flow.N).fill(INF), age: 0, dirty: true, ready: false, gen: 0 };
}

// Kosten des groben Rasters aus dem Geländeraster (bei jeder Geländeänderung)
function rebuildCost(world, flow) {
  const { GW, GH, terr } = world;
  const PW = Math.ceil(GW / 2), PH = Math.ceil(GH / 2), N = PW * PH;
  if (N !== flow.N) {
    flow.cost = new Uint8Array(N); flow.next = new Int32Array(N); flow.prev = new Int32Array(N);
    for (let k = 0; k < flow.list.length; k++) flow.list[k].dist = new Int32Array(N).fill(INF);
  }
  flow.PW = PW; flow.PH = PH; flow.N = N; flow.GW = GW; flow.GH = GH;
  flow.terrRef = terr; flow.ver = world.terrainVersion | 0;
  const cost = flow.cost;
  let hazards = 0;
  for (let i = 0; i < terr.length; i++) if (terr[i] === WALL || terr[i] === LAVA) hazards++;
  for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) {
    let walls = 0, c = 0;
    for (let k = 0; k < 4; k++) {
      const gx = 2 * px + (k & 1), gy = 2 * py + (k >> 1);
      if (gx >= GW || gy >= GH) continue;
      const t = terr[gy * GW + gx];
      if (t === WALL) walls++;
      else { const tc = TCOST[t] || PATH_COST.free; if (tc > c) c = tc; }
    }
    cost[py * PW + px] = walls >= 2 || c === 0 ? 0 : c;
  }
  flow.hazards = hazards;
}

const pcell = (flow, x, y) =>
  clamp((y / PATH_CELL) | 0, 0, flow.PH - 1) * flow.PW + clamp((x / PATH_CELL) | 0, 0, flow.PW - 1);

// Feld unter (x, y); liegt es auf einer Mauer (Körper steht im freien Teil), das nächstgelegene freie
// Nachbarfeld (nach Mittelpunktabstand). −1, wenn keins frei ist.
function openCell(flow, x, y) {
  const c = pcell(flow, x, y), { cost, PW, PH } = flow;
  if (cost[c]) return c;
  const cx = c % PW, cy = (c / PW) | 0;
  let best = -1, bd = Infinity;
  for (let k = 0; k < 8; k++) {
    const nx = cx + DX[k], ny = cy + DY[k];
    if (nx < 0 || ny < 0 || nx >= PW || ny >= PH) continue;
    const n = ny * PW + nx; if (!cost[n]) continue;
    const ex = (nx + .5) * PATH_CELL - x, ey = (ny + .5) * PATH_CELL - y, d = ex * ex + ey * ey;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

function link(flow, i, b) {
  const { head, next, prev } = flow, h = head[b];
  next[i] = h; prev[i] = -1; if (h >= 0) prev[h] = i; head[b] = i;
}
function unlink(flow, i, b) {
  const { head, next, prev } = flow, p = prev[i], n = next[i];
  if (p >= 0) next[p] = n; else head[b] = n;
  if (n >= 0) prev[n] = p;
}

// Distanzfeld der Fraktion f: Dijkstra von allen lebenden Gegner-Bodeneinheiten aus.
function compute(world, flow, field, f) {
  const { PW, PH, cost, head } = flow, dist = field.dist, units = world.units;
  dist.fill(INF); head.fill(-1);
  let queued = 0;
  for (let i = 0; i < units.length; i++) {
    const v = units[i];
    if (!v.alive || v.T.fly || factionOf(world, v) === f) continue;
    const c = openCell(flow, v.x, v.y);
    if (c < 0 || dist[c] === 0) continue;
    dist[c] = 0; link(flow, c, 0); queued++;
  }
  let cur = 0;
  while (queued > 0) {
    let b = cur & MASK;
    while (head[b] < 0) { cur++; b = cur & MASK; }
    const c = head[b]; unlink(flow, c, b); queued--;
    const dc = dist[c], cx = c % PW, cy = (c / PW) | 0, cc = cost[c];
    for (let k = 0; k < 8; k++) {
      const dx = DX[k], dy = DY[k], nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= PW || ny >= PH) continue;
      const n = ny * PW + nx, cn = cost[n];
      if (!cn) continue;
      let nd;
      if (dx !== 0 && dy !== 0) {
        if (!cost[cy * PW + nx] || !cost[ny * PW + cx]) continue;   // nicht an Mauerecken vorbei
        nd = dc + (((cc + cn) * 181) >> 8);
      } else nd = dc + ((cc + cn + 1) >> 1);
      const od = dist[n];
      if (nd >= od) continue;
      if (od !== INF) unlink(flow, n, od & MASK); else queued++;
      dist[n] = nd; link(flow, n, nd & MASK);
    }
  }
  field.ready = true; field.dirty = false; field.age = 0;
}

function timed(world, flow, field) {
  const t0 = now();
  compute(world, flow, field, field.f);
  const ms = now() - t0, s = flow.stats;
  s.recomputes++; s.ms += ms; s.lastMs = ms; if (ms > s.maxMs) s.maxMs = ms;
  s.winN++; s.winMs += ms;
}

// Ein Schritt: Raster bei Geländeänderung neu, Fraktionen abgleichen, gestaffelt neu berechnen.
export function updateFlow(world, flow, dt) {
  const fields = flow.fields, list = flow.list;
  if (flow.ver !== (world.terrainVersion | 0) || flow.terrRef !== world.terr || flow.GW !== world.GW || flow.GH !== world.GH) {
    rebuildCost(world, flow);
    for (let k = 0; k < list.length; k++) list[k].dirty = true;
  }
  // Fraktionen mit lebenden Bodentruppen
  const gen = ++flow.gen, units = world.units;
  let groundF = 0;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (!u.alive || u.T.fly) continue;
    const f = factionOf(world, u);
    let fl = fields.get(f);
    if (!fl) { fl = makeField(flow, f); fields.set(f, fl); list.push(fl); }
    if (fl.gen !== gen) { fl.gen = gen; groundF++; }
  }
  // verschwundene Fraktionen fallen weg (Liste in place verdichten)
  let m = 0;
  for (let k = 0; k < list.length; k++) { const fl = list[k]; if (fl.gen === gen) list[m++] = fl; else fields.delete(fl.f); }
  list.length = m;
  const s = flow.stats;
  s.winT += dt;
  if (s.winT >= 1) { s.rate = s.winN / s.winT; s.msRate = s.winMs / s.winT; s.winN = 0; s.winMs = 0; s.winT = 0; }
  // Ohne Gegner mit Bodentruppen gibt es kein Ziel: Felder ungültig, beim nächsten Gegner sofort neu
  if (groundF < 2) { for (let k = 0; k < m; k++) { list[k].ready = false; list[k].dirty = true; } return; }
  let budget = PATH_MAX_PER_STEP;
  for (let k = 0; k < m; k++) {
    const fl = list[k];
    fl.age += dt;
    if (budget > 0 && (fl.dirty || !fl.ready)) { timed(world, flow, fl); budget--; }
  }
  if (budget <= 0) return;
  // eine Auffrischung je Schritt: das älteste fällige Feld
  let bfl = null;
  for (let k = 0; k < m; k++) { const fl = list[k]; if (fl.age >= PATH_REFRESH && (!bfl || fl.age > bfl.age)) bfl = fl; }
  if (bfl) timed(world, flow, bfl);
}

// Richtung von (x, y) zum günstigsten Nachbarfeld im Feld der Fraktion. Liefert ein wiederverwendetes
// Objekt { dx, dy, dist } (dist: gewichtete Weglänge in px; im Feld eines Gegners dx = dy = dist = 0)
// oder null, wenn kein Weg zu einem Gegner führt (oder die Fraktion kein Feld hat).
const FD = { dx: 0, dy: 0, dist: 0 };
export function flowDir(flow, faction, x, y) {
  const field = flow.fields.get(faction);
  if (!field || !field.ready) return null;
  const c = openCell(flow, x, y);
  if (c < 0) return null;
  const dist = field.dist, dc = dist[c];
  if (dc === INF) return null;
  if (dc === 0) { FD.dx = 0; FD.dy = 0; FD.dist = 0; return FD; }
  const { PW, PH, cost } = flow, cx = c % PW, cy = (c / PW) | 0, cc = cost[c];
  let best = -1, bd = INF;
  for (let k = 0; k < 8; k++) {
    const dx = DX[k], dy = DY[k], nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= PW || ny >= PH) continue;
    const n = ny * PW + nx, cn = cost[n];
    if (!cn || dist[n] >= dc) continue;
    let e;
    if (dx !== 0 && dy !== 0) {
      if (!cost[cy * PW + nx] || !cost[ny * PW + cx]) continue;
      e = ((cc + cn) * 181) >> 8;
    } else e = (cc + cn + 1) >> 1;
    if (dist[n] + e < bd) { bd = dist[n] + e; best = n; }
  }
  if (best < 0) return null;
  const bx = best % PW, by = (best / PW) | 0;
  let ex = (bx + .5) * PATH_CELL - x, ey = (by + .5) * PATH_CELL - y, l = Math.hypot(ex, ey);
  if (l < 1e-3) { ex = bx - cx; ey = by - cy; l = Math.hypot(ex, ey); }
  FD.dx = ex / l; FD.dy = ey / l; FD.dist = dc * PATH_CELL / 10;
  return FD;
}

// Hält das grobe Raster die Geländezelle i (Index in world.terr) für begehbar? (Dünne Mauern, die im
// groben Raster durchrutschen: dort darf think trotz Weg einschlagen.)
export function pathOpen(world, flow, i) {
  const gx = i % world.GW, gy = (i / world.GW) | 0, px = gx >> 1, py = gy >> 1;
  return px < flow.PW && py < flow.PH && flow.cost[py * flow.PW + px] !== 0;
}

// Gerade Linie (x0, y0) → (x1, y1) auf dem Geländeraster (Gitterlauf): true, wenn sie eine Mauerzelle
// oder mindestens PATH_LAVA_CELLS Lavazellen kreuzt. Ohne Mauern und Lava im Gelände sofort false.
export function directBlocked(world, flow, x0, y0, x1, y1) {
  if (!flow || !flow.hazards) return false;
  const { GW, GH, terr } = world, dx = x1 - x0, dy = y1 - y0;
  let gx = clamp(x0 / CELL | 0, 0, GW - 1), gy = clamp(y0 / CELL | 0, 0, GH - 1);
  const tgx = clamp(x1 / CELL | 0, 0, GW - 1), tgy = clamp(y1 / CELL | 0, 0, GH - 1);
  const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0, sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tdx = sx ? CELL / Math.abs(dx) : Infinity, tdy = sy ? CELL / Math.abs(dy) : Infinity;
  let tx = sx > 0 ? ((gx + 1) * CELL - x0) / dx : sx < 0 ? (gx * CELL - x0) / dx : Infinity;
  let ty = sy > 0 ? ((gy + 1) * CELL - y0) / dy : sy < 0 ? (gy * CELL - y0) / dy : Infinity;
  let lava = 0;
  for (let guard = GW + GH + 2; guard > 0; guard--) {
    const t = terr[gy * GW + gx];
    if (t === WALL) return true;
    if (t === LAVA && ++lava >= PATH_LAVA_CELLS) return true;
    if (gx === tgx && gy === tgy) return false;
    if (tx < ty) { if (tx > 1) return false; tx += tdx; gx += sx; } else { if (ty > 1) return false; ty += tdy; gy += sy; }
    if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return false;
  }
  return false;
}
