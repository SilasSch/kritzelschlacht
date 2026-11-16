// Reiner Simulationsschritt (Körperphysik in physics.js), Missionsaufbau, Missionsergebnis, Sieger im Sandkasten.
// Port aus kritzelschlacht.html. Kein DOM, Zufall nur über world.rng().
import { MISSIONS, TERRAIN, CELL } from './data.js';
import { spawn, setCell, rebuildHash, clearBattle, touchTerrain } from './world.js';
import { think, stepProjectiles } from './combat.js';
import { integrate, collide, collideWalls, stepCorpses, stepDebris } from './physics.js';
import { createFlow, updateFlow } from './pathing.js';

const rnd = (world, a, b) => a + world.rng() * (b - a);

/* ---------- Schritt ---------- */
// Zeit je Teil von step, immer mitgezählt (ms, aufsummiert seit Programmstart; SIM_TIME.steps = Schritte).
// Für Messungen (tools/bench.mjs --profile, __bench.measure) Differenzen bilden. Immer aktiv statt nur unter
// einem Schalter: ein selten genommener Messzweig ließ V8 step immer wieder verwerfen (Task 13).
export const SIM_PHASES = ['hash', 'flow', 'think', 'integrate', 'collide', 'walls', 'proj', 'corpses'];
export const SIM_TIME = { ms: new Float64Array(SIM_PHASES.length), steps: 0 };
const pnow = globalThis.performance ? () => globalThis.performance.now() : () => 0;
export function step(world, dt) {
  const M = SIM_TIME.ms;
  let t0 = pnow(), t1 = 0;
  world.time += dt;
  rebuildHash(world);
  t1 = pnow(); M[0] += t1 - t0; t0 = t1;
  // Flussfelder der Wegfindung (gestaffelt, sofort nach Geländeänderungen), vor den Entscheidungen
  if (!world.flow) world.flow = createFlow(world);
  updateFlow(world, world.flow, dt);
  t1 = pnow(); M[1] += t1 - t0; t0 = t1;
  const units = world.units;
  for (const u of units) u.att = 0;
  for (const u of units) if (u.alive && u.tg && u.tg.alive) u.tg.att++;
  for (const u of units) if (u.alive) think(world, u, dt);
  t1 = pnow(); M[2] += t1 - t0; t0 = t1;
  integrate(world, dt);
  t1 = pnow(); M[3] += t1 - t0; t0 = t1;
  collide(world);
  t1 = pnow(); M[4] += t1 - t0; t0 = t1;
  for (const u of units) if (u.alive) collideWalls(world, u, dt);
  t1 = pnow(); M[5] += t1 - t0; t0 = t1;
  stepProjectiles(world, dt);
  t1 = pnow(); M[6] += t1 - t0; t0 = t1;
  stepCorpses(world, dt);
  stepDebris(world, dt);
  if ((world.dead || 0) > 300) { world.units = world.units.filter(u => u.alive); world.dead = 0; }
  M[7] += pnow() - t0; SIM_TIME.steps++;
}

/* ---------- Sieger ---------- */
// Sandkasten: meldet einmal die Fraktion, die als letzte übrig bleibt (nach einem echten Kampf).
export function sandboxWinner(world) {
  const fc = world.facCount;
  if (fc.size >= 2) world.contested = true;
  else if (world.contested && fc.size === 1 && world.time - (world.lastWinT ?? -9) > 2) {
    world.contested = false; world.lastWinT = world.time;
    world.events.push({ type: 'sound', k: 'win' });
    return [...fc.keys()][0];
  } else if (fc.size === 0) world.contested = false;
  return null;
}

// Mission: zählt lebende Einheiten direkt (auch vor dem ersten Schritt korrekt).
export function missionResult(world, battleTime) {
  let b = 0, r = 0;
  for (const u of world.units) { if (!u.alive) continue; if (u.team === 'blau') b++; else if (u.team === 'rot') r++; }
  if (r === 0 && b > 0) return 'win';
  if (b === 0 || battleTime > 180) return 'lose';
  return null;
}

/* ---------- Aufbau ---------- */
export function placeRect(world, type, n, x0, y0, x1, y1, team) {
  const { W, H } = world;
  const X0 = x0 * W, Y0 = y0 * H, w = (x1 - x0) * W, h = (y1 - y0) * H;
  const cols = Math.max(1, Math.round(Math.sqrt(n * w / Math.max(1, h)))), rows = Math.ceil(n / cols);
  let k = 0;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols && k < n; i++, k++) {
    const x = X0 + (cols === 1 ? w / 2 : i * w / (cols - 1)) + rnd(world, -2, 2);
    const y = Y0 + (rows === 1 ? h / 2 : j * h / (rows - 1)) + rnd(world, -2, 2);
    spawn(world, type, x, y, team);
  }
}

export function placeCircle(world, type, n, cx, cy, rr, team) {
  const { W, H } = world;
  for (let k = 0; k < n; k++) {
    const a = k * 2.39996, d = Math.sqrt((k + .5) / n) * rr * H;
    spawn(world, type, cx * W + Math.cos(a) * d, cy * H + Math.sin(a) * d, team);
  }
}

export function tRect(world, key, x0, y0, x1, y1) {
  const id = TERRAIN[key].id, { W, H, GW, GH } = world;
  for (let gy = Math.floor(y0 * H / CELL); gy <= Math.floor(y1 * H / CELL); gy++)
    for (let gx = Math.floor(x0 * W / CELL); gx <= Math.floor(x1 * W / CELL); gx++) {
      if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue;
      setCell(world, gy * GW + gx, id, 0);
    }
}

export function tCircle(world, key, cx, cy, rr, inner = 0) {
  const id = TERRAIN[key].id, { W, H, GW, GH } = world, X = cx * W, Y = cy * H, R = rr * H, Ri = inner * H;
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const d = Math.hypot(gx * CELL + 5 - X, gy * CELL + 5 - Y);
    if (d <= R && d >= Ri) setCell(world, gy * GW + gx, id, 0);
  }
}

// Baut Mission i auf (leert vorher die Schlacht per clearBattle und das Gelände). Gegner gehören 'rot'.
export function buildMission(world, i) {
  const m = MISSIONS[i];
  clearBattle(world);
  world.terr.fill(0); world.towner.fill(0); world.whp.fill(0); touchTerrain(world);
  world.contested = false; world.teamMode = true;
  const { W, H } = world;
  for (const p of m.place) {
    switch (p[0]) {
      case 'rect': placeRect(world, p[1], p[2], p[3], p[4], p[5], p[6], 'rot'); break;
      case 'circle': placeCircle(world, p[1], p[2], p[3], p[4], p[5], 'rot'); break;
      case 'unit': spawn(world, p[1], p[2] * W, p[3] * H, 'rot'); break;
      case 'tRect': tRect(world, p[1], p[2], p[3], p[4], p[5]); break;
      case 'tCircle': tCircle(world, p[1], p[2], p[3], p[4], p[5]); break;
    }
  }
  world.events.push({ type: 'terrain', gx0: 0, gy0: 0, gx1: world.GW - 1, gy1: world.GH - 1 });
  rebuildHash(world);
}
