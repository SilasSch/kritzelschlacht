// Schlanke Körperphysik: Kreise mit Masse, Impulse, Reibung, Schwerkraft auf der Höhenachse z,
// Kollision untereinander und mit dem Geländeraster. Kein DOM, kein Zufall.
//
// Geschwindigkeiten: u.mx/u.my = Wunschbewegung (setzt think), u.vx/u.vy/u.vz = Fremdgeschwindigkeit
// (Impulse). Zustände: 'ok' (läuft), 'air' (fliegt nach Impuls mit iz > 0), 'stun' (gelandet, betäubt).
// Flieger (T.fly) halten immer T.flyZ, ignorieren iz und werden nie 'air' oder 'stun'.
// Leichen (world.corpses, angelegt von combat.die) fliegen, drehen sich, prallen auf und rutschen aus
// (stepCorpses); sie sind für Einheiten und untereinander kein Hindernis.
import { CELL, HASH_CELL, UNITS } from './data.js';
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
export const LAUNCH_VZ = 60;         // Explosionen heben erst ab dieser Steiggeschwindigkeit ab (px/s)
export const MAX_FLING = 700;        // Explosionen beschleunigen waagrecht höchstens um so viel (px/s)

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
// Schnelle Körper (mehr als SWEEP_PX je Schritt, z. B. von einer Explosion geschleudert) prüfen den Weg
// in Teilschritten von höchstens SWEEP_SUB px, damit sie nicht durch eine 1-Zellen-Mauer tunneln.
// dt ist optional (nur für blk), sim.step reicht den Schrittwert durch.
const SWEEP_PX = 8, SWEEP_SUB = 5;
export function collideWalls(world, u, dt = 1 / 60) {
  const T = u.T, terr = world.terr;
  let blocked = false;
  if (!T.fly && u.z < WALL_CLEAR_Z) {
    const px = u.px ?? u.x, py = u.py ?? u.y;
    // Stand schon vorher in der Mauer (übermalt, von oben gelandet): heraus. Sonst den Weg prüfen.
    if (terr[cellIndex(world, px, py)] === WALL) unstick(world, u);
    else {
      const dx = u.x - px, dy = u.y - py, la = T.r * .6;
      const d2 = dx * dx + dy * dy;
      const n = d2 > SWEEP_PX * SWEEP_PX ? Math.ceil(Math.sqrt(d2) / SWEEP_SUB) : 1;
      const sx = dx / n, sy = dy / n;
      const ex = u.x, ey = u.y;   // der letzte Teilschritt endet genau dort (n = 1: wie bisher)
      let cx = px, cy = py, bx = false, by = false;
      for (let k = 0; k < n && !(bx && by); k++) {
        const last = k === n - 1;
        let nx = cx, ny = cy;
        if (!bx && sx !== 0) {
          nx = last ? ex : cx + sx;
          const a = cellIndex(world, nx + (sx > 0 ? la : -la), cy);
          if (terr[a] === WALL) { nx = cx; bx = true; u.bcell = a; }
        }
        if (!by && sy !== 0) {
          ny = last ? ey : cy + sy;
          const b = cellIndex(world, nx, ny + (sy > 0 ? la : -la));
          if (terr[b] === WALL) { ny = cy; by = true; u.bcell = b; }
        }
        cx = nx; cy = ny;
      }
      u.x = cx; u.y = cy;
      if (bx) u.vx = 0;
      if (by) u.vy = 0;
      blocked = bx || by;
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

/* ---------- Leichen ---------- */
// Leiche bzw. Leichenteil (kind 'part', part = 'headgear' | 'weapon' | 'shield' | 'turret').
// state: 'fly' (in Bewegung), 'rest' (liegt), 'float' (treibt im Wasser), 'sink' (geht unter, wird nach
// SINK_T entfernt), 'ash' (in Lava verbrannt). t: Sekunden im aktuellen Zustand. fade > 0: verblasst,
// wird bei 0 entfernt. px/py: letzte Position (für unstick).
export const CORPSE_CAP = 1500;      // darüber verblassen die ältesten
export const CORPSE_FADE = 1;        // s
const C_BOUNCE = .3, C_BOUNCE_V = 40;     // Aufprall über 40 px/s prallt mit 30 % ab
const C_FRICTION = 3, C_GRIP = 80;        // Bodenreibung: v *= exp(−3·dt), dazu −80 px/s² Haftreibung
const C_ROT_BRAKE = 5;                    // Drehung am Boden: vrot *= exp(−5·dt)
const C_REST_V = 5;                       // Ruhe bei |v| < 5 und z = 0
const SINK_T = 2;                         // s, dann ist die Leiche untergegangen
const HEAVY = 3;                          // ab dieser Masse sinkt eine Leiche im Wasser

export function makeCorpse(kind, part, type, team, face, x, y, z, vx, vy, vz, rot, vrot) {
  return { kind, part, type, team, face, x, y, z, vx, vy, vz, rot, vrot, state: 'fly', t: 0, fade: 0, px: x, py: y };
}

// Zustand beim Liegenbleiben je nach Gelände
function settle(world, c) {
  c.vx = 0; c.vy = 0; c.vz = 0; c.vrot = 0; c.t = 0;
  const tt = world.terr[cellIndex(world, c.x, c.y)];
  if (tt === 1) {
    const heavy = c.kind === 'part' ? c.part === 'turret' : (UNITS[c.type].mass || 1) >= HEAVY;
    c.state = heavy ? 'sink' : 'float';
  } else c.state = tt === 2 ? 'ash' : 'rest';
}

// Mauer am Boden: der Weg wird in Teilschritten ≤ SWEEP_SUB px geprüft; an der ersten Mauerzelle bleibt
// die Leiche davor liegen (waagrechte Geschwindigkeit 0). Mehr Kollision gibt es nicht.
function corpseWalls(world, c) {
  const terr = world.terr, px = c.px, py = c.py;
  if (terr[cellIndex(world, px, py)] === WALL) { unstick(world, c); return; }
  const dx = c.x - px, dy = c.y - py, d2 = dx * dx + dy * dy;
  if (d2 === 0) return;
  const n = d2 > SWEEP_SUB * SWEEP_SUB ? Math.ceil(Math.sqrt(d2) / SWEEP_SUB) : 1;
  for (let k = 1; k <= n; k++) {
    const x = px + dx * k / n, y = py + dy * k / n;
    if (terr[cellIndex(world, x, y)] === WALL) {
      c.x = px + dx * (k - 1) / n; c.y = py + dy * (k - 1) / n; c.vx = 0; c.vy = 0;
      return;
    }
  }
}

export function stepCorpses(world, dt) {
  const list = world.corpses, terr = world.terr, W = world.W, H = world.H;
  const drag = Math.exp(-AIR_DRAG * dt), fr = Math.exp(-C_FRICTION * dt), rb = Math.exp(-C_ROT_BRAKE * dt);
  // Deckel: die ältesten (vorne in der Liste) über CORPSE_CAP verblassen
  const over = list.length - CORPSE_CAP;
  for (let i = 0; i < over; i++) if (list[i].fade === 0) list[i].fade = CORPSE_FADE;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    c.t += dt;
    if (c.fade > 0) { c.fade -= dt; if (c.fade <= 0) continue; }
    if (c.state === 'sink' && c.t >= SINK_T) continue;
    if (c.state === 'fly') {
      c.px = c.x; c.py = c.y;
      if (c.z > 0 || c.vz > 0) {
        c.vz -= GRAVITY * dt; c.z += c.vz * dt;
        c.vx *= drag; c.vy *= drag;
        if (c.z <= 0) {
          c.z = 0;
          const impact = -c.vz;
          c.vz = impact > C_BOUNCE_V ? impact * C_BOUNCE : 0;
        }
      } else {
        const v = Math.hypot(c.vx, c.vy);
        if (v < C_REST_V) { settle(world, c); list[n++] = c; continue; }
        const k = Math.max(0, v * fr - C_GRIP * dt) / v;
        c.vx *= k; c.vy *= k; c.vrot *= rb;
      }
      c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vrot * dt;
      if (c.z < WALL_CLEAR_Z) corpseWalls(world, c);
      clampEdge(c, W, H);
    } else if (terr[cellIndex(world, c.x, c.y)] === WALL) {
      unstick(world, c);   // übermalt: heraus aus der Mauer
    }
    list[n++] = c;
  }
  list.length = n;
}
