// Schlanke Körperphysik: Kreise mit Masse, Impulse, Reibung, Schwerkraft auf der Höhenachse z,
// Kollision untereinander und mit dem Geländeraster. Kein DOM, kein Zufall.
//
// Geschwindigkeiten: u.mx/u.my = Wunschbewegung (setzt think), u.vx/u.vy/u.vz = Fremdgeschwindigkeit
// (Impulse). Zustände: 'ok' (läuft), 'air' (fliegt nach Impuls mit iz > 0), 'stun' (gelandet, betäubt).
// Flieger (T.fly) halten ihre Flughöhe u.fz (sonst T.flyZ; der Sturzflug des Drachen senkt sie, abilities.js) und
// steigen oder sinken dorthin mit höchstens FLY_VZ px/s, ignorieren iz und werden nie 'air' oder 'stun'.
// u.spdMul (Verstärkung, abilities.js) wirkt auf die Wunschbewegung.
// Leichen (world.corpses, angelegt von combat.die) fliegen, drehen sich, prallen auf und rutschen aus
// (stepCorpses); sie sind für Einheiten und untereinander kein Hindernis. Mauerbrocken (world.debris,
// angelegt von combat.hitWall) fliegen genauso, berühren aber nur Boden und Mauern (stepDebris).
import { CELL, HASH_CELL, TERRAIN, TERR_SPEED } from './data.js';
import { cellIndex } from './world.js';
import { hurt, crash } from './combat.js';

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
export const FLY_VZ = 120;           // Flieger steigen und sinken zu ihrer Flughöhe u.fz mit höchstens so viel (px/s)

const HC = HASH_CELL;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const WATER = TERRAIN.wasser.id, LAVA = TERRAIN.lava.id, WALL = TERRAIN.mauer.id;

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
      if (u.z !== u.fz) { const dz = u.fz - u.z, s = FLY_VZ * dt; u.z = dz > s ? u.z + s : dz < -s ? u.z - s : u.fz; }
      u.vz = 0;
      wx = u.mx * u.spdMul; wy = u.my * u.spdMul;
    } else if (u.state === 'air') {
      f = drag;
      u.vz -= GRAVITY * dt; u.z += u.vz * dt;
      if (u.z > u.peakZ) u.peakZ = u.z;
      if (u.z <= 0 && u.vz < 0) land(world, u);
    } else {
      if (u.state === 'stun') { u.stunT -= dt; if (u.stunT <= 0) { u.stunT = 0; u.state = 'ok'; } }
      // Gelände bremst die Wunschbewegung (TERRAIN sp); Lava brennt
      const tt = terr[cellIndex(world, u.x, u.y)];
      // Task 5: Krokodil (T.swim, T.land) schwimmt im Wasser schneller statt gebremst, an Land langsamer
      const sp = T.swim ? (tt === WATER ? T.swim : TERR_SPEED[tt] * T.land) : TERR_SPEED[tt];
      if (tt === LAVA) {
        hurt(world, u, 10 * dt, 'fire', null);
        // etwa 6 Flammen pro Sekunde, ohne den Spielzufall zu verbrauchen
        if (u.alive && ((world.time * 60 | 0) + u.id) % 10 === 0) world.events.push({ type: 'burn', x: u.x, y: u.y });
      }
      if (!u.alive) continue;
      if (u.state === 'ok') { wx = u.mx * sp * u.spdMul; wy = u.my * sp * u.spdMul; }
    }
    const vx = wx + u.vx, vy = wy + u.vy;
    u.vx *= f; u.vy *= f;
    u.x += vx * dt; u.y += vy * dt;
    clampEdge(u, W, H);
  }
}

// Erster Bodenkontakt im Wasser (vor einem Abpraller oder beim direkten Landen): splash
function land(world, u) {
  const impact = -u.vz;
  u.z = 0;
  if (!u.bounced && world.terr[cellIndex(world, u.x, u.y)] === WATER) world.events.push({ type: 'splash', x: u.x, y: u.y });
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

// Jedes Paar einmal (Task 13): Zellen des Spatial Hash der Reihe nach, je Einheit die späteren in ihrer Zelle
// und alle in den vier Nachbarzellen "vorwärts" (rechts, links unten, unten, rechts unten). Beide weichen im
// selben Besuch aus, u um m_v/(m_u+m_v), v um m_u/(m_u+m_v) des halben Überlapps (vorher besuchte jede
// Einheit das Paar einmal von ihrer Seite und schob nur sich selbst; gleiche Wirkung, halbe Arbeit).
const FWD_X = [1, -1, 0, 1], FWD_Y = [0, 1, 1, 1];
function pushPair(u, v) {
  if (!v.alive || !!v.T.fly !== !!u.T.fly || high(v)) return;
  const rr = (u.T.r + v.T.r) * .92, dx = u.x - v.x, dy = u.y - v.y, d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return;
  const mu = u.T.mass || 1, mv = v.T.mass || 1, d = Math.sqrt(d2) || .01, k = (rr - d) / d * .5 / (mu + mv);
  u.x += dx * k * mv; u.y += dy * k * mv;
  v.x -= dx * k * mu; v.y -= dy * k * mu;
}
export function collide(world) {
  const { hash, HW, HH } = world;
  for (let gy = 0; gy < HH; gy++) for (let gx = 0; gx < HW; gx++) {
    const cell = hash[gy * HW + gx], n = cell.length;
    for (let i = 0; i < n; i++) {
      const u = cell[i];
      if (!u.alive || high(u)) continue;
      for (let j = i + 1; j < n; j++) pushPair(u, cell[j]);
      for (let k = 0; k < 4; k++) {
        const nx = gx + FWD_X[k], ny = gy + FWD_Y[k];
        if (nx < 0 || nx >= HW || ny >= HH) continue;
        const c2 = hash[ny * HW + nx];
        for (let j = 0; j < c2.length; j++) pushPair(u, c2[j]);
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
    const px = u.px === u.px ? u.px : u.x, py = u.py === u.py ? u.py : u.y;   // NaN: noch keine Lage vor dem Schritt
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

/* ---------- Fliegende Körper ohne Einheit (Leichen, Brocken) ---------- */
// Gemeinsame Bewegung: fall (Schwerkraft, Luftwiderstand; true beim Bodenkontakt), bounce (Abprallen
// ×0.3 über 40 px/s), slide (Bodenreibung; false, sobald |v| < 5), advance (Weg, Drehung, Mauerprobe am
// Boden, Kartenrand). Einheiten berühren sie nicht.
const C_BOUNCE = .3, C_BOUNCE_V = 40;     // Aufprall über 40 px/s prallt mit 30 % ab
const C_FRICTION = 3, C_GRIP = 80;        // Bodenreibung: v *= exp(−3·dt), dazu −80 px/s² Haftreibung
const C_ROT_BRAKE = 5;                    // Drehung am Boden: vrot *= exp(−5·dt)
const C_REST_V = 5;                       // Ruhe bei |v| < 5 und z = 0

function fall(b, dt, drag) {
  b.vz -= GRAVITY * dt; b.z += b.vz * dt;
  b.vx *= drag; b.vy *= drag;
  if (b.z > 0) return false;
  b.z = 0; return true;
}
function bounce(b) { const impact = -b.vz; b.vz = impact > C_BOUNCE_V ? impact * C_BOUNCE : 0; }
function slide(b, dt, fr, rb) {
  const v = Math.hypot(b.vx, b.vy);
  if (v < C_REST_V) return false;
  const k = Math.max(0, v * fr - C_GRIP * dt) / v;
  b.vx *= k; b.vy *= k; b.vrot *= rb;
  return true;
}
function advance(world, b, dt) {
  b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vrot * dt;
  if (b.z < WALL_CLEAR_Z) bodyWalls(world, b);
  clampEdge(b, world.W, world.H);
}

// Mauer am Boden: der Weg (px/py → x/y) wird in Teilschritten ≤ SWEEP_SUB px geprüft; an der ersten
// Mauerzelle bleibt der Körper davor liegen (waagrechte Geschwindigkeit 0). Mehr Kollision gibt es nicht.
function bodyWalls(world, c) {
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

/* ---------- Leichen ---------- */
// Leiche bzw. Leichenteil (kind 'part', part = 'headgear' | 'weapon' | 'shield' | 'turret').
// state: 'fly' (in Bewegung), 'rest' (liegt), 'float' (treibt FLOAT_T s im Wasser), 'sink' (geht SINK_T s
// unter, dann entfernt), 'ash' (in Lava verbrannt, nach ASH_T s entfernt). Wasser und Lava fangen eine
// Leiche beim ersten Bodenkontakt (kein Abprallen) oder sobald sie rutschend hineingerät. Ereignisse dazu:
// splash beim Eintauchen; terrain mit kind 'ash' und dem Zellbereich gx0…gy1 für den Asche-Fleck.
// crash ('heli' | 'drache' | null): abgeschossener Flieger, löst beim ersten Bodenkontakt combat.crash aus.
// t: Sekunden im aktuellen Zustand. fade > 0: verblasst, wird bei 0 entfernt. px/py: letzte Position.
// Deckel (Spez. #11): höchstens CORPSE_CAP Körper (kind 'body') und PART_CAP Leichenteile; darüber verblassen
// jeweils die ältesten. Teile haben den kleineren eigenen Deckel und gehen so vor den Körpern; zusammen
// höchstens CORPSE_CAP + PART_CAP Einträge (zuzüglich der gerade verblassenden).
export const CORPSE_CAP = 1500;
export const PART_CAP = 500;
export const CORPSE_FADE = 1;        // s
export const CORPSE_REST = 29;       // s liegen (rest), danach CORPSE_FADE s verblassen: weg nach etwa 30 s
export const FLOAT_T = 2, SINK_T = 3, ASH_T = 2;   // s

export function makeCorpse(kind, part, type, team, face, x, y, z, vx, vy, vz, rot, vrot, crash = null) {
  return { kind, part, type, team, face, x, y, z, vx, vy, vz, rot, vrot, state: 'fly', t: 0, fade: 0, px: x, py: y, crash };
}

const liquid = tt => tt === WATER || tt === LAVA;

// Zustand beim Liegenbleiben je nach Gelände tt
function settle(world, c, tt) {
  c.vx = 0; c.vy = 0; c.vz = 0; c.vrot = 0; c.t = 0;
  if (tt === WATER) {
    c.state = 'float';
    world.events.push({ type: 'splash', x: c.x, y: c.y });
  } else if (tt === LAVA) {
    c.state = 'ash';
    const { GW, GH } = world, gx = clamp(c.x / CELL | 0, 0, GW - 1), gy = clamp(c.y / CELL | 0, 0, GH - 1);
    world.events.push({ type: 'terrain', kind: 'ash', x: c.x, y: c.y,
      gx0: Math.max(0, gx - 1), gy0: Math.max(0, gy - 1), gx1: Math.min(GW - 1, gx + 1), gy1: Math.min(GH - 1, gy + 1) });
  } else c.state = 'rest';
}

export function stepCorpses(world, dt) {
  const list = world.corpses, terr = world.terr;
  const drag = Math.exp(-AIR_DRAG * dt), fr = Math.exp(-C_FRICTION * dt), rb = Math.exp(-C_ROT_BRAKE * dt);
  // Deckel: die ältesten (vorne in der Liste) Körper über CORPSE_CAP und Teile über PART_CAP verblassen
  let bodies = 0;
  for (let i = 0; i < list.length; i++) if (list[i].kind === 'body') bodies++;
  let overB = bodies - CORPSE_CAP, overP = list.length - bodies - PART_CAP;
  for (let i = 0; i < list.length && (overB > 0 || overP > 0); i++) {
    const c = list[i];
    if (c.kind === 'body') { if (overB-- > 0 && c.fade === 0) c.fade = CORPSE_FADE; }
    else if (overP-- > 0 && c.fade === 0) c.fade = CORPSE_FADE;
  }
  // Ein Absturz (crash) kann während der Schleife Leichen anhängen; sie laufen noch in diesem Schritt mit.
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    c.t += dt;
    if (c.fade > 0) { c.fade -= dt; if (c.fade <= 0) continue; }
    else if (c.state === 'rest' && c.t >= CORPSE_REST) c.fade = CORPSE_FADE;   // float/ash enden schon vorher von selbst
    if (c.state === 'float') { if (c.t >= FLOAT_T) { c.state = 'sink'; c.t -= FLOAT_T; } }
    else if (c.state === 'sink') { if (c.t >= SINK_T) continue; }
    else if (c.state === 'ash') { if (c.t >= ASH_T) continue; }
    if (c.state === 'fly') {
      c.px = c.x; c.py = c.y;
      if (c.z > 0 || c.vz > 0) {
        if (fall(c, dt, drag)) {
          if (c.crash !== null) { const k = c.crash; c.crash = null; crash(world, k, c.x, c.y); }
          const tt = terr[cellIndex(world, c.x, c.y)];
          if (liquid(tt)) { settle(world, c, tt); list[n++] = c; continue; }
          bounce(c);
        }
      } else {
        const tt = terr[cellIndex(world, c.x, c.y)];
        if (liquid(tt) || !slide(c, dt, fr, rb)) { settle(world, c, tt); list[n++] = c; continue; }
      }
      advance(world, c, dt);
    } else if (terr[cellIndex(world, c.x, c.y)] === WALL) {
      unstick(world, c);   // übermalt: heraus aus der Mauer
    }
    list[n++] = c;
  }
  list.length = n;
}

/* ---------- Mauerbrocken ---------- */
// { x, y, z, vx, vy, vz, rot, vrot, t, fade, rest, px, py } aus combat.hitWall. Fliegen, prallen ab und
// rutschen wie Leichen, kennen aber kein Wasser und keine Lava; sie verletzen niemanden und berühren keine
// Einheiten. Liegen DEBRIS_REST s (t zählt ab dem Liegen), verblassen dann DEBRIS_FADE s und werden
// entfernt. Über DEBRIS_CAP werden die ältesten (vorne in der Liste) sofort entfernt.
export const DEBRIS_CAP = 400;
export const DEBRIS_REST = 9;        // s
export const DEBRIS_FADE = 1;        // s

export function makeDebris(x, y, z, vx, vy, vz, rot, vrot) {
  return { x, y, z, vx, vy, vz, rot, vrot, t: 0, fade: 0, rest: false, px: x, py: y };
}

export function stepDebris(world, dt) {
  const list = world.debris;
  if (list.length === 0) return;
  const terr = world.terr;
  const drag = Math.exp(-AIR_DRAG * dt), fr = Math.exp(-C_FRICTION * dt), rb = Math.exp(-C_ROT_BRAKE * dt);
  let n = 0;
  for (let i = list.length > DEBRIS_CAP ? list.length - DEBRIS_CAP : 0; i < list.length; i++) {
    const d = list[i];
    d.t += dt;
    if (d.fade > 0) { d.fade -= dt; if (d.fade <= 0) continue; }
    else if (d.rest && d.t >= DEBRIS_REST) d.fade = DEBRIS_FADE;
    if (!d.rest) {
      d.px = d.x; d.py = d.y;
      if (d.z > 0 || d.vz > 0) { if (fall(d, dt, drag)) bounce(d); }
      else if (!slide(d, dt, fr, rb)) {
        d.vx = 0; d.vy = 0; d.vz = 0; d.vrot = 0; d.rest = true; d.t = 0;
        list[n++] = d; continue;
      }
      advance(world, d, dt);
    } else if (terr[cellIndex(world, d.x, d.y)] === WALL) {
      unstick(world, d);   // übermalt: heraus aus der Mauer
    }
    list[n++] = d;
  }
  list.length = n;
}
