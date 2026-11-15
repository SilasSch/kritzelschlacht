// Schlanke Körperphysik: Kreise mit Masse, Impulse, Reibung, Schwerkraft auf der Höhenachse z,
// Kollision untereinander und mit dem Geländeraster. Kein DOM, kein Zufall.
//
// Geschwindigkeiten: u.mx/u.my = Wunschbewegung (setzt think), u.vx/u.vy/u.vz = Fremdgeschwindigkeit
// (Impulse). Zustände: 'ok' (läuft), 'air' (fliegt nach Impuls mit iz > 0), 'stun' (gelandet, betäubt).
// Flieger (T.fly) halten immer T.flyZ, ignorieren iz und werden nie 'air' oder 'stun'.
import { CELL, HASH_CELL } from './data.js';
import { cellIndex } from './world.js';
import { hurt } from './combat.js';

export const GRAVITY = 900;          // px/s²
export const GROUND_FRICTION = 8;    // je s: v *= exp(-8·dt) auf Fremdgeschwindigkeit am Boden
export const WALL_CLEAR_Z = 12;      // ab dieser Höhe geht es über Mauern hinweg
const AIR_DRAG = .4;                 // je s, horizontal in der Luft
const BOUNCE_V = 250, BOUNCE = .25;  // Aufprall über 250 px/s prallt einmal mit 25 % ab
const STUN_MIN = .3, STUN_MAX = .8, STUN_PER_PX = .5 / 120;
const UNSTICK_RINGS = 6;             // Suche nach freier Zelle in Ringen bis 6 Zellen
const EDGE = 6;                      // Kartenrand

const HC = HASH_CELL;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const WALL = 4;

/* ---------- Impuls ---------- */
// v += I / Masse. Bei iz > 0 hebt der Körper ab; peakZ wird ab hier gemessen.
export function applyImpulse(u, ix, iy, iz = 0) {
  const m = u.T.mass || 1;
  u.vx += ix / m; u.vy += iy / m;
  if (iz > 0 && !u.T.fly) {
    if (u.state !== 'air') { u.state = 'air'; u.peakZ = u.z; u.bounced = false; u.impact = 0; }
    u.vz += iz / m;
  }
}

/* ---------- Bewegung ---------- */
export function integrate(world, dt) {
  const terr = world.terr, W = world.W, H = world.H;
  const fr = Math.exp(-GROUND_FRICTION * dt), drag = Math.exp(-AIR_DRAG * dt);
  for (const u of world.units) {
    if (!u.alive) continue;
    const T = u.T;
    u.px = u.x; u.py = u.y;        // für die Mauerprüfung in collideWalls
    let wx = 0, wy = 0, f = fr;
    if (T.fly) {
      u.z = T.flyZ; u.vz = 0;
      wx = u.mx; wy = u.my;
    } else if (u.state === 'air') {
      f = drag;
      u.vz -= GRAVITY * dt; u.z += u.vz * dt;
      if (u.z > u.peakZ) u.peakZ = u.z;
      if (u.z <= 0 && u.vz < 0) land(world, u);
    } else {
      if (u.state === 'stun') { u.stunT -= dt; if (u.stunT <= 0) { u.stunT = 0; u.state = 'ok'; } }
      // Gelände bremst die Wunschbewegung; Lava brennt
      let sp = 1; const tt = terr[cellIndex(world, u.x, u.y)];
      if (tt === 1) sp = .4;
      else if (tt === 2) {
        sp = .8; hurt(world, u, 10 * dt, 'fire', null);
        // etwa 6 Flammen pro Sekunde, ohne den Spielzufall zu verbrauchen
        if (u.alive && ((world.time * 60 | 0) + u.id) % 10 === 0) world.events.push({ type: 'burn', x: u.x, y: u.y });
      } else if (tt === 3) sp = .85;
      if (!u.alive) continue;
      if (u.state === 'ok') { wx = u.mx * sp; wy = u.my * sp; }
    }
    const vx = wx + u.vx, vy = wy + u.vy;
    u.vx *= f; u.vy *= f;
    u.x += vx * dt; u.y += vy * dt;
    clampEdge(u, W, H);
    u.moving = Math.abs(vx) + Math.abs(vy) > 6;
  }
}

function land(world, u) {
  const impact = -u.vz;
  u.z = 0;
  u.impact = Math.max(u.impact || 0, impact);
  if (impact > BOUNCE_V && !u.bounced) { u.vz = impact * BOUNCE; u.bounced = true; return; }
  u.vz = 0; u.state = 'stun';
  u.stunT = clamp(STUN_MIN + STUN_PER_PX * u.peakZ, STUN_MIN, STUN_MAX);
  world.events.push({ type: 'land', x: u.x, y: u.y, impact: u.impact });
}

// Klemmt auf [6, W−6] × [6, H−6]; die Geschwindigkeit nach außen wird 0.
function clampEdge(u, W, H) {
  if (u.x < EDGE) { u.x = EDGE; if (u.vx < 0) u.vx = 0; } else if (u.x > W - EDGE) { u.x = W - EDGE; if (u.vx > 0) u.vx = 0; }
  if (u.y < EDGE) { u.y = EDGE; if (u.vy < 0) u.vy = 0; } else if (u.y > H - EDGE) { u.y = H - EDGE; if (u.vy > 0) u.vy = 0; }
}

/* ---------- Körper untereinander ---------- */
// Kreise mit Massenanteil: u weicht um m_v/(m_u+m_v) aus. Boden mit Boden, Flieger mit Fliegern.
// Wer in der Luft höher als sein Radius ist, wird übersprungen.
const high = u => u.state === 'air' && u.z > u.T.r;

export function collide(world) {
  const { units, hash, HW, HH } = world;
  for (const u of units) {
    if (!u.alive || high(u)) continue;
    const ru = u.T.r, fu = !!u.T.fly, mu = u.T.mass || 1;
    const gx = clamp(u.x / HC | 0, 0, HW - 1), gy = clamp(u.y / HC | 0, 0, HH - 1);
    for (let yy = Math.max(0, gy - 1); yy <= Math.min(HH - 1, gy + 1); yy++) for (let xx = Math.max(0, gx - 1); xx <= Math.min(HW - 1, gx + 1); xx++) {
      const cell = hash[yy * HW + xx];
      for (let i = 0; i < cell.length; i++) {
        const v = cell[i]; if (v === u || !v.alive || !!v.T.fly !== fu || high(v)) continue;
        const rr = (ru + v.T.r) * .92, dx = u.x - v.x, dy = u.y - v.y, d2 = dx * dx + dy * dy;
        if (d2 < rr * rr) {
          const mv = v.T.mass || 1, d = Math.sqrt(d2) || .01, ov = (rr - d) / d, w = mv / (mu + mv);
          u.x += dx * ov * .5 * w; u.y += dy * ov * .5 * w;
        }
      }
    }
  }
}

/* ---------- Gelände ---------- */
// Am Boden (z < WALL_CLEAR_Z) gleiten Einheiten an Mauern entlang wie bisher: die Probe r·0.6 vor dem
// Körper in Bewegungsrichtung (seit integrate) stoppt die Achse. blk zählt die Zeit vor der Mauer,
// bcell ist die blockierende Zelle (beides liest die KI). Steckt ein Körper in einer Mauerzelle
// (gelandet, hineingedrückt oder übermalt), wird er in die nächste freie Zelle verschoben.
// dt ist optional (nur für blk), sim.step reicht den Schrittwert durch.
export function collideWalls(world, u, dt = 1 / 60) {
  const T = u.T, terr = world.terr;
  let blocked = false;
  if (!T.fly && u.z < WALL_CLEAR_Z) {
    if (terr[cellIndex(world, u.x, u.y)] === WALL) unstick(world, u);
    else {
      const px = u.px ?? u.x, py = u.py ?? u.y, dx = u.x - px, dy = u.y - py;
      if (dx !== 0) {
        const a = cellIndex(world, u.x + Math.sign(dx) * T.r * .6, py);
        if (terr[a] === WALL) { u.x = px; blocked = true; u.bcell = a; u.vx = 0; }
      }
      if (dy !== 0) {
        const b = cellIndex(world, u.x, u.y + Math.sign(dy) * T.r * .6);
        if (terr[b] === WALL) { u.y = py; blocked = true; u.bcell = b; u.vy = 0; }
      }
      if (terr[cellIndex(world, u.x, u.y)] === WALL) unstick(world, u);
    }
  }
  u.blk = blocked ? u.blk + dt : Math.max(0, u.blk - dt * 2);
  clampEdge(u, world.W, world.H);
}

// Nächste freie Zelle (kein Mauerfeld) bis UNSTICK_RINGS Zellen entfernt, Mittelpunkt in der Welt.
function unstick(world, u) {
  const { GW, GH, W, H, terr } = world;
  const gx = clamp(u.x / CELL | 0, 0, GW - 1), gy = clamp(u.y / CELL | 0, 0, GH - 1);
  let bx = 0, by = 0, bd = Infinity;
  for (let r = 1; r <= UNSTICK_RINGS; r++) {
    if ((r - 1) * CELL > Math.sqrt(bd)) break;    // weiter draußen liegt nichts Näheres
    for (let yy = gy - r; yy <= gy + r; yy++) {
      if (yy < 0 || yy >= GH) continue;
      const edge = yy === gy - r || yy === gy + r, stp = edge ? 1 : 2 * r;
      for (let xx = gx - r; xx <= gx + r; xx += stp) {
        if (xx < 0 || xx >= GW) continue;
        const x = clamp(xx * CELL + CELL / 2, EDGE, W - EDGE), y = clamp(yy * CELL + CELL / 2, EDGE, H - EDGE);
        if (terr[cellIndex(world, x, y)] === WALL) continue;
        const d = (x - u.x) ** 2 + (y - u.y) ** 2;
        if (d < bd) { bd = d; bx = x; by = y; }
      }
    }
  }
  if (bd === Infinity) return;      // ganz eingemauert: bleibt stehen, die KI haut sich frei
  u.x = bx; u.y = by; u.px = bx; u.py = by; u.vx = 0; u.vy = 0;
}
