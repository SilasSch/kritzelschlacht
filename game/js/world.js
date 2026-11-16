// Reine Welt: Einheiten, Gelände-Gitter, Spatial Hash, Zielsuche. Zufall nur über world.rng().
import { UNITS, CELL, HASH_CELL, RANGED } from './data.js';
import { createRng } from './rng.js';

const HC = HASH_CELL;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function makeHash(world) {
  world.HW = Math.ceil(world.W / HC) + 1;
  world.HH = Math.ceil(world.H / HC) + 1;
  world.hash = Array.from({ length: world.HW * world.HH }, () => []);
}

export function createWorld(W, H, seed = 1) {
  const GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL);
  const world = {
    W, H, rng: createRng(seed), time: 0, teamMode: false,
    units: [], proj: [], corpses: [], debris: [], events: [],
    GW, GH, terr: new Uint8Array(GW * GH), towner: new Uint8Array(GW * GH), whp: new Float32Array(GW * GH),
    HW: 0, HH: 0, hash: [], facCount: new Map(), totalAlive: 0, nextId: 1,
  };
  makeHash(world);
  return world;
}

export const factionOf = (world, u) => (world.teamMode ? u.team : u.type);

export const cellIndex = (world, x, y) =>
  clamp((y / CELL) | 0, 0, world.GH - 1) * world.GW + clamp((x / CELL) | 0, 0, world.GW - 1);

export function setCell(world, i, terrainId, owner = 0) {
  world.terr[i] = terrainId;
  world.towner[i] = owner;
  world.whp[i] = terrainId === 4 ? 140 : 0;
}

function hidx(world, x, y) {
  return clamp((y / HC) | 0, 0, world.HH - 1) * world.HW + clamp((x / HC) | 0, 0, world.HW - 1);
}

export function spawn(world, type, x, y, team) {
  const T = UNITS[type];
  const u = {
    id: world.nextId++, type, T, team, x, y, z: T.flyZ || 0, vx: 0, vy: 0, vz: 0, mx: 0, my: 0,
    hp: T.hp, alive: true, state: 'ok', stunT: 0, peakZ: 0, face: team === 'rot' ? -1 : 1,
    aimX: 0, aimY: 0, tg: null, cd: world.rng() * T.cd, rt: world.rng() * 0.3, kills: 0,
    hitT: 0, fireT: 1, swingT: 0, seed: world.rng() * 10, gx: x, gy: y, gn: 1, gt: 0, att: 0, st: 0,
    cvx: 0, cvy: 0, run: 0, blk: 0, bcell: -1, wall: false, blockedT: 0, lofFlip: false, lofT: -9,
  };
  world.units.push(u);   // fireT: 1 = letzter Schuss lange her (kein Rückstoß im Ruhezustand)
  if (world.hash.length) world.hash[hidx(world, x, y)].push(u);
  return u;
}

export function rebuildHash(world) {
  const { hash, units, facCount } = world;
  for (let i = 0; i < hash.length; i++) hash[i].length = 0;
  facCount.clear(); world.totalAlive = 0;
  for (const u of units) {
    if (!u.alive) continue;
    hash[hidx(world, u.x, u.y)].push(u);
    const f = factionOf(world, u);
    facCount.set(f, (facCount.get(f) || 0) + 1);
    world.totalAlive++;
  }
}

export function query(world, x, y, r, cb) {
  const { HW, HH, hash } = world;
  const gx0 = clamp((x - r) / HC | 0, 0, HW - 1), gx1 = clamp((x + r) / HC | 0, 0, HW - 1);
  const gy0 = clamp((y - r) / HC | 0, 0, HH - 1), gy1 = clamp((y + r) / HC | 0, 0, HH - 1);
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
    const cell = hash[gy * HW + gx];
    for (let i = 0; i < cell.length; i++) { const v = cell[i]; if (v.alive && cb(v) === true) return; }
  }
}

export function nearestEnemy(world, u) {
  const { HW, HH, hash } = world;
  const f = factionOf(world, u);
  if (world.totalAlive - (world.facCount.get(f) || 0) <= 0) return null;
  const cx = clamp(u.x / HC | 0, 0, HW - 1), cy = clamp(u.y / HC | 0, 0, HH - 1), maxR = Math.max(HW, HH);
  // Geister und Reiter jagen bevorzugt die hinteren Reihen; überall gilt: Ziele verteilen statt Schlange stehen
  const pref = u.type === 'geist' ? .45 : u.type === 'reiter' ? .7 : 1, sq = Math.sqrt(pref);
  let best = null, bd = Infinity;
  for (let r = 0; r <= maxR; r++) {
    if (best && (r - 1) * HC * sq > Math.sqrt(bd)) break;
    for (let gy = cy - r; gy <= cy + r; gy++) {
      if (gy < 0 || gy >= HH) continue;
      const edge = (gy === cy - r || gy === cy + r), stp = edge ? 1 : Math.max(1, 2 * r);
      for (let gx = cx - r; gx <= cx + r; gx += stp) {
        if (gx < 0 || gx >= HW) continue;
        const cell = hash[gy * HW + gx];
        for (let i = 0; i < cell.length; i++) {
          const v = cell[i];
          if (!v.alive || factionOf(world, v) === f || (v.type === 'heli' && !u.T.fly && u.T.range < 20)) continue;
          const dx = v.x - u.x, dy = v.y - u.y;
          let d = (dx * dx + dy * dy) * (1 + .12 * (v.tg === u ? 0 : (v.att || 0)));
          if (pref < 1 && (v.T.heal || RANGED.has(v.type))) d *= pref;
          if (d < bd) { bd = d; best = v; }
        }
      }
    }
  }
  return best;
}

export function resizeWorld(world, W, H) {
  const nGW = Math.ceil(W / CELL), nGH = Math.ceil(H / CELL);
  const t = new Uint8Array(nGW * nGH), o = new Uint8Array(nGW * nGH), h = new Float32Array(nGW * nGH);
  const mw = Math.min(nGW, world.GW), mh = Math.min(nGH, world.GH);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const a = y * world.GW + x, b = y * nGW + x;
    t[b] = world.terr[a]; o[b] = world.towner[a]; h[b] = world.whp[a];
  }
  world.W = W; world.H = H; world.GW = nGW; world.GH = nGH; world.terr = t; world.towner = o; world.whp = h;
  makeHash(world);
  for (const u of world.units) { u.x = clamp(u.x, 6, W - 6); u.y = clamp(u.y, 6, H - 6); }
  for (const c of world.corpses) { c.x = clamp(c.x, 6, W - 6); c.y = clamp(c.y, 6, H - 6); c.px = c.x; c.py = c.y; }
  for (const d of world.debris) { d.x = clamp(d.x, 6, W - 6); d.y = clamp(d.y, 6, H - 6); }
  rebuildHash(world);
}

// Leert alles, was zu einer Schlacht gehört (Wiederholen, Mission laden, Leeren, Zufallsschlacht).
// Gelände und Einstellungen bleiben.
export function clearBattle(world) {
  world.units = []; world.proj = []; world.corpses = []; world.debris = [];
  world.events.length = 0; world.dead = 0;
}
