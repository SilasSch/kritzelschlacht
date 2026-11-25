// Schnelle Schlacht (25.11.): ein Zufallsgegner für eine Seite im Schlacht-Modus. Der Plan ist rein (Zufall von außen),
// placeQuick stellt ihn auf. Punkte: so viele wie die andere Seite hat, sonst QUICK_DEFAULT. Nahkämpfer stehen vorn,
// Fernkämpfer hinten. Keine Bodentruppe steht in einer Mauer oder in Lava: wer dort landet, rückt auf den
// nächsten freien Platz der eigenen Hälfte (freeSpot), nur ohne Platz fällt sie weg.
import { UNITS, CELL } from './data.js';
import { placeRect } from './sim.js';
import { cellIndex } from './world.js';

export const QUICK_DEFAULT = 60;
const LAVA = 2, WALL = 4;
// Rot steht rechts; Blau bekommt die gespiegelten x-Werte
const BANDS = { front: [.57, .66], mid: [.68, .78], back: [.8, .92] };

// Zufallsplan für budget Punkte: [{ type, n, x0, y0, x1, y1 }] (Anteile von W und H), Kosten ≤ budget
export function quickPlan(budget, rand = Math.random, side = 'rot', allowed = null) {
  budget = Math.max(3, budget);
  const pool = Object.keys(UNITS).filter(k => UNITS[k].paint !== false && UNITS[k].cost <= budget * .6 && (!allowed || allowed(k)));
  if (!pool.length) return [];
  const nt = Math.min(pool.length, 1 + (rand() * 3 | 0)), types = [];
  while (types.length < nt) { const k = pool[rand() * pool.length | 0]; if (!types.includes(k)) types.push(k); }
  const w = types.map(() => .5 + rand()), ws = w.reduce((a, b) => a + b, 0);
  const out = [];
  let left = budget;
  types.forEach((type, i) => {
    const c = UNITS[type].cost;
    const share = i === types.length - 1 ? left : Math.min(left, budget * w[i] / ws);   // die letzte Art nimmt den Rest
    const n = Math.min(80, Math.floor(share / c + 1e-9));
    if (n < 1) return;
    left -= n * c;
    const T = UNITS[type], band = T.heal || T.range >= 60 ? BANDS.back : T.range >= 20 ? BANDS.mid : BANDS.front;
    const h = Math.min(.7, .12 + n * .012), y0 = .12 + rand() * (.76 - h);
    let [x0, x1] = band;
    if (side === 'blau') [x0, x1] = [1 - x1, 1 - x0];
    out.push({ type, n, x0, y0, x1, y1: y0 + h });
  });
  // Rest auffüllen: die billigste gewählte Art bekommt, was noch passt
  if (out.length) {
    const cheap = out.reduce((a, p) => (UNITS[p.type].cost < UNITS[a.type].cost ? p : a));
    const more = Math.min(80 - cheap.n, Math.floor(left / UNITS[cheap.type].cost + 1e-9));
    if (more > 0) { cheap.n += more; cheap.y1 = Math.min(.9, cheap.y0 + Math.min(.7, .12 + cheap.n * .012)); }
  }
  return out;
}

export const planCost = plan => plan.reduce((a, p) => a + p.n * UNITS[p.type].cost, 0);

// Darf u hier stehen? Mauer und Lava nur im Flug (wie beim Malen).
export function blockedAt(world, u, x, y) {
  const t = world.terr[cellIndex(world, x, y)];
  return (t === WALL || t === LAVA) && !(u.T || UNITS[u.type]).fly;
}
// Nächster freier Platz für u um (x, y) zwischen xMin und xMax (Ringe aus Zellen, höchstens R px weit), oder null
export function freeSpot(world, u, x, y, xMin = 0, xMax = world.W, R = 400) {
  const r = (u.T || UNITS[u.type]).r + 2;
  const lo = Math.max(r, xMin), hi = Math.min(world.W - r, xMax);
  const ok = (px, py) => px >= lo && px <= hi && py >= r && py <= world.H - r && !blockedAt(world, u, px, py);
  if (ok(x, y)) return { x, y };
  for (let d = CELL; d <= R; d += CELL) {
    let best = null, bd = Infinity;
    const n = Math.max(8, Math.ceil(d * 6.283 / CELL));
    for (let k = 0; k < n; k++) {
      const a = k / n * 6.283, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      // auf dem Ring den Platz nehmen, der am weitesten von Lava und Mauer weg liegt (eine Zelle Abstand), sonst den ersten
      if (!ok(px, py)) continue;
      const m = ok(px + CELL, py) && ok(px - CELL, py) && ok(px, py + CELL) && ok(px, py - CELL) ? 0 : 1;
      if (m < bd) { bd = m; best = { x: px, y: py }; if (!m) break; }
    }
    if (best) return best;
  }
  return null;
}
// Einheiten ab id first auf freie Plätze ihrer Hälfte rücken (Rot rechts, Blau links); ohne Platz fallen sie weg
export function settleUnits(world, first = 0) {
  const W = world.W;
  world.units = world.units.filter(u => {
    if (u.id < first || !u.alive || !blockedAt(world, u, u.x, u.y)) return true;
    const [a, b] = u.team === 'rot' ? [W / 2, W] : u.team === 'blau' ? [0, W / 2] : [0, W];
    const p = freeSpot(world, u, u.x, u.y, a, b);
    if (!p) return false;
    u.x = p.x; u.y = p.y; u.gx = p.x; u.gy = p.y;
    return true;
  });
}

// Plan aufstellen (team), danach Einheiten aus Mauern und Bodentruppen aus Lava auf freie Plätze rücken.
// Liefert die Zahl der gesetzten Einheiten.
export function placeQuick(world, plan, team) {
  const first = world.nextId;
  for (const p of plan) placeRect(world, p.type, p.n, p.x0, p.y0, p.x1, p.y1, team);
  settleUnits(world, first);
  return world.units.filter(u => u.id >= first).length;
}
