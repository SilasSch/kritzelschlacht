// Malregeln: Einheiten stempeln, Gelände malen, Radierer, Rückgängig. Port aus kritzelschlacht.html.
// Rein: kein DOM, kein PIXI, Zufall nur über world.rng().
// mission = null (Sandkasten) oder { budget, spent } (spent wird hier fortgeschrieben).
// phase = 'plan' | 'battle' | 'done' (nur in Missionen relevant).
import { UNITS, TERRAIN, CELL } from './data.js';
import { spawn, cellIndex, query, rebuildHash } from './world.js';

export const UNIT_CAP = 2600;
export const ZONE = 0.42;        // Missionen: gemalt wird nur bei x <= ZONE * W
export const PLAYER = 'blau';
export const MSG_BUDGET = 'Budget aufgebraucht.';
export const MSG_FULL = 'Das Schlachtfeld ist voll.';

const EPS = 1e-6;
const terrKeyById = id => Object.keys(TERRAIN).find(k => TERRAIN[k].id === id);

// Ein Pinselstrich: merkt sich alles, was rückgängig gemacht werden muss.
export function createStroke(spent = 0) {
  return { units: [], cells: new Map(), erased: [], spent, warned: false };
}

export const strokeEmpty = s => !s.units.length && !s.cells.size && !s.erased.length;

export function canPaintAt(world, x, mission, phase) {
  return !(mission && (phase !== 'plan' || x > world.W * ZONE));
}

// Warnung höchstens einmal pro Strich
function warn(stroke, msg) {
  if (stroke) { if (stroke.warned) return null; stroke.warned = true; }
  return msg;
}

// Füllt den Pinselkreis zufällig mit Einheiten vom Typ sel.
export function stamp(world, stroke, x, y, R, sel, team, mission, phase) {
  rebuildHash(world);
  const T = UNITS[sel];
  if (!T) return { placed: 0, warning: null };
  if (world.totalAlive > UNIT_CAP) return { placed: 0, warning: warn(stroke, MSG_FULL) };
  const r = T.r, minD = r * 2.05, { W, H } = world;
  const tries = Math.min(140, Math.ceil((R * R) / ((minD * .9) ** 2) * 1.4) + 1);
  let placed = 0, warning = null;
  for (let i = 0; i < tries; i++) {
    const a = world.rng() * 6.283, d = Math.sqrt(world.rng()) * R;
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    if (px < r || py < r || px > W - r || py > H - r) continue;
    if (!canPaintAt(world, px, mission, phase)) continue;
    if (!T.fly && world.terr[cellIndex(world, px, py)] === 4) continue;
    let ok = true;
    query(world, px, py, minD + 26, v => {
      if (!!v.T.fly !== !!T.fly && sel !== 'geist') return;
      const rr = Math.max(minD, (r + v.T.r) * 1.02);
      if ((v.x - px) ** 2 + (v.y - py) ** 2 < rr * rr) { ok = false; return true; }
    });
    if (!ok) continue;
    if (mission) {
      if (mission.spent + T.cost > mission.budget + EPS) { warning = warn(stroke, MSG_BUDGET); break; }
      mission.spent += T.cost;
    }
    const nu = spawn(world, sel, px, py, mission ? PLAYER : team);
    placed++;
    if (stroke) stroke.units.push(nu);
  }
  return { placed, warning };
}

// Malt Gelände (oder radiert mit 'radierer') im Kreis. cells: betroffener Gitterbereich (inkl. Rand).
export function paintTerrain(world, stroke, x, y, R, key, mission, phase) {
  const id = TERRAIN[key].id, cost = TERRAIN[key].cost;
  const { GW, GH, terr, towner, whp } = world;
  const g0x = Math.floor((x - R) / CELL), g1x = Math.floor((x + R) / CELL);
  const g0y = Math.floor((y - R) / CELL), g1y = Math.floor((y + R) / CELL);
  let changed = false, broke = false;
  for (let gy = Math.max(0, g0y); gy <= Math.min(GH - 1, g1y); gy++) for (let gx = Math.max(0, g0x); gx <= Math.min(GW - 1, g1x); gx++) {
    const cx = gx * CELL + 5, cy = gy * CELL + 5;
    if ((cx - x) ** 2 + (cy - y) ** 2 > R * R) continue;
    if (!canPaintAt(world, cx, mission, phase)) continue;
    const i = gy * GW + gx, old = terr[i];
    if (mission) {
      if (old && !towner[i]) continue;   // Gelände der Mission ist geschützt
      if (old === id) continue;
      if (old) mission.spent = Math.max(0, mission.spent - TERRAIN[terrKeyById(old)].cost);
      if (id) {
        if (mission.spent + cost > mission.budget + EPS) { broke = true; continue; }
        mission.spent += cost;
      }
    }
    if (old === id && id !== 4) continue;
    if (stroke && !stroke.cells.has(i)) stroke.cells.set(i, [old, towner[i], whp[i]]);
    terr[i] = id; towner[i] = mission && id ? 1 : 0; whp[i] = id === 4 ? 140 : 0;
    changed = true;
  }
  if (key === 'radierer') {
    query(world, x, y, R + 10, v => {
      if ((v.x - x) ** 2 + (v.y - y) ** 2 > R * R) return;
      if (mission && v.team !== PLAYER) return;
      if (mission) mission.spent = Math.max(0, mission.spent - v.T.cost);
      if (stroke) stroke.erased.push({ type: v.type, team: v.team, x: v.x, y: v.y, hp: v.hp });
      v.alive = false; world.dead = (world.dead || 0) + 1; changed = true;
    });
  }
  const cells = {
    gx0: Math.max(0, g0x - 1), gy0: Math.max(0, g0y - 1),
    gx1: Math.min(GW - 1, g1x + 1), gy1: Math.min(GH - 1, g1y + 1),
  };
  return { changed, warning: broke ? warn(stroke, MSG_BUDGET) : null, cells };
}

// Nimmt einen Strich zurück und liefert die Ausgaben vor dem Strich.
export function undo(world, stroke) {
  for (const u of stroke.units) if (u.alive) { u.alive = false; world.dead = (world.dead || 0) + 1; }
  for (const [i, [t, o, h]] of stroke.cells) {
    if (i >= world.terr.length) continue;
    world.terr[i] = t; world.towner[i] = o; world.whp[i] = h;
  }
  for (const e of stroke.erased) { const n = spawn(world, e.type, e.x, e.y, e.team); n.hp = e.hp; }
  rebuildHash(world);
  return stroke.spent;
}
