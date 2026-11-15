// Reiner Simulationsschritt, Bewegung, Missionsaufbau, Missionsergebnis, Sieger im Sandkasten.
// Port aus kritzelschlacht.html. Kein DOM, Zufall nur über world.rng().
import { MISSIONS, TERRAIN, CELL, HASH_CELL } from './data.js';
import { spawn, setCell, cellIndex, rebuildHash } from './world.js';
import { think, hurt, stepProjectiles } from './combat.js';

const HC = HASH_CELL;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (world, a, b) => a + world.rng() * (b - a);

/* ---------- Bewegung ---------- */
export function move(world, u, dt) {
  const T = u.T, terr = world.terr;
  let sp = 1; const tt = T.fly ? 0 : terr[cellIndex(world, u.x, u.y)];
  if (tt === 1) sp = .4;
  else if (tt === 2) {
    sp = .8; hurt(world, u, 10 * dt, 'fire', null);
    // etwa 6 Flammen pro Sekunde, ohne den Spielzufall zu verbrauchen
    if (u.alive && ((world.time * 60 | 0) + u.id) % 10 === 0) world.events.push({ type: 'burn', x: u.x, y: u.y });
  } else if (tt === 3) sp = .85;
  if (!u.alive) return;
  // u.vx/u.vy = Rückstoß, klingt ab
  const vx = u.mx * sp + u.vx, vy = u.my * sp + u.vy; u.vx *= .88; u.vy *= .88;
  let nx = u.x + vx * dt, ny = u.y + vy * dt, blocked = false;
  if (!T.fly && tt !== 4) {
    const a = cellIndex(world, nx + Math.sign(vx) * T.r * .6, u.y);
    if (terr[a] === 4) { nx = u.x; blocked = true; u.bcell = a; u.vx = 0; }
    const b = cellIndex(world, nx, ny + Math.sign(vy) * T.r * .6);
    if (terr[b] === 4) { ny = u.y; blocked = true; u.bcell = b; u.vy = 0; }
  }
  u.blk = blocked ? u.blk + dt : Math.max(0, u.blk - dt * 2);
  u.x = clamp(nx, 6, world.W - 6); u.y = clamp(ny, 6, world.H - 6);
  u.moving = Math.abs(vx) + Math.abs(vy) > 6;
}

export function separate(world) {
  const { units, hash, HW, HH } = world;
  for (const u of units) {
    if (!u.alive) continue; const ru = u.T.r, fu = !!u.T.fly;
    const gx = clamp(u.x / HC | 0, 0, HW - 1), gy = clamp(u.y / HC | 0, 0, HH - 1);
    for (let yy = Math.max(0, gy - 1); yy <= Math.min(HH - 1, gy + 1); yy++) for (let xx = Math.max(0, gx - 1); xx <= Math.min(HW - 1, gx + 1); xx++) {
      const cell = hash[yy * HW + xx];
      for (let i = 0; i < cell.length; i++) {
        const v = cell[i]; if (v === u || !v.alive || !!v.T.fly !== fu) continue;
        const rr = (ru + v.T.r) * .92, dx = u.x - v.x, dy = u.y - v.y, d2 = dx * dx + dy * dy;
        if (d2 < rr * rr) { const d = Math.sqrt(d2) || .01, ov = (rr - d) / d, w = v.T.r / (ru + v.T.r); u.x += dx * ov * .5 * w; u.y += dy * ov * .5 * w; }
      }
    }
  }
}

/* ---------- Schritt ---------- */
export function step(world, dt) {
  world.time += dt;
  rebuildHash(world);
  const units = world.units;
  for (const u of units) u.att = 0;
  for (const u of units) if (u.alive && u.tg && u.tg.alive) u.tg.att++;
  for (const u of units) if (u.alive) think(world, u, dt);
  for (const u of units) if (u.alive) move(world, u, dt);
  separate(world);
  stepProjectiles(world, dt);
  if ((world.dead || 0) > 300) { world.units = world.units.filter(u => u.alive); world.dead = 0; }
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

// Baut Mission i auf (leert vorher Einheiten, Geschosse und Gelände). Gegner gehören 'rot'.
export function buildMission(world, i) {
  const m = MISSIONS[i];
  world.units = []; world.proj = []; world.corpses = []; world.debris = [];
  world.terr.fill(0); world.towner.fill(0); world.whp.fill(0);
  world.dead = 0; world.contested = false; world.teamMode = true;
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
