// KI-Gegner für Online (25.11.): Silas wollte KI-Spieler in drei Stufen, die man im 1 gegen 1 und in beiden 2-gegen-2-Modi
// dazunehmen kann, „alle Optionen wie echte Spieler, inklusive Formation“. Rein: kein DOM, kein Netz, Zufall nur über rand().
//
// Die KI spielt fair: gleiches Budget und gleiche Regel wie ein Mensch, sie malt verdeckt (sieht die Armee des Gegners erst,
// wenn sie im Kampf aufgedeckt wurde) und darf nur auf ihrer Hälfte bzw. in ihrem Viertel malen. Ihre Armee geht durch
// dieselbe Prüfung wie jede andere (online.unpackArmy, team.seatArmy).
//
// Stufen:
//   leicht:  ein, zwei zufällige Einheiten, gibt nicht alles aus, stellt sie irgendwo als Haufen hin, keine Formationen.
//   mittel:  sinnvolle Mischung (Nahkampf vorn, Fernkampf hinten, manchmal Heiler oder Flieger), volles Budget, malt die
//            Gruppen als Formen (Schlachtreihe vorn, Sturmkeil für Schnelle, Igel um die Fernkämpfer), meidet Lava, Mauern
//            und Wasser, stellt Fernkämpfer in den Wald.
//   schwer:  wie mittel, probiert aber viele Armeen in einer Probeschlacht gegen vermutete Gegner aus und nimmt die beste.
//            Die Vermutung kommt aus dem, was der Gegner in früheren Runden aufgedeckt hat (bei einer Revanche genau die
//            Armee von eben), dazu passende Konter (data.js COUNTERS) und zwei typische Armeen der Regel.
// Formationen (shapes.js): Jede Gruppe ab SHAPE_MIN_UNITS Einheiten kann eine Form tragen; die KI legt die Einheiten auch
// sichtbar in diese Form (Linie, Pfeil zum Gegner, Ring). Römer stellt sie dicht genug, dass sie ihren Block bilden.
import { UNITS, COUNTERS } from './data.js';
import { ruleAllows, applyMap } from './rules.js';
import { createWorld, cellIndex, spawn, rebuildHash } from './world.js';
import { step, battleWinner } from './sim.js';
import { snapshotBattle, resetFight, STEP } from './battle.js';
import { applyShape, SHAPE_MIN_UNITS } from './shapes.js';

export const BOT_LEVELS = ['leicht', 'mittel', 'schwer'];
export const BOT_LEVEL_N = { leicht: 'Leicht', mittel: 'Mittel', schwer: 'Schwer' };
export const BOT_LEVEL_D = {
  leicht: 'Malt ein paar zufällige Einheiten irgendwohin.',
  mittel: 'Mischt Nah- und Fernkampf und nutzt Formationen.',
  schwer: 'Probiert Armeen in Probeschlachten aus und kontert, was du ihm gezeigt hast.',
};
export const BOT_EMOJI = '🤖';
export const botName = lvl => `${BOT_EMOJI} KI ${BOT_LEVEL_N[lvl] || ''}`.trim();
export const isLevel = v => BOT_LEVELS.includes(v);
// Bedenkzeit beim Malen (ms): so wirkt die KI wie ein Mitspieler und ist trotzdem nie die, auf die alle warten
export const THINK_MS = { leicht: [4000, 9000], mittel: [7000, 14000], schwer: [9000, 18000] };
export const thinkMs = (lvl, rand = Math.random) => { const [a, b] = THINK_MS[lvl] || THINK_MS.mittel; return a + rand() * (b - a); };

const LAVA = 2, WALL = 4, WATER = 1, FOREST = 3;
const PAINT = Object.keys(UNITS).filter(t => UNITS[t].paint !== false);
const T = t => UNITS[t];
const isHeal = t => !!T(t).heal;
const isRanged = t => T(t).range >= 60 && !T(t).heal;
const isMelee = t => T(t).range < 60 && !T(t).heal;
const isFast = t => T(t).speed >= 80;
const pickW = (items, w, rand) => {
  const s = w.reduce((a, b) => a + b, 0);
  let x = rand() * s;
  for (let i = 0; i < items.length; i++) { x -= w[i]; if (x <= 0) return items[i]; }
  return items[items.length - 1];
};
const pick = (a, rand) => a[Math.floor(rand() * a.length) % a.length];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------- Lage ---------- */
// ctx: { W, H, side: 'blau' | 'rot', zone: { x: [a, b], y: [a, b] } (Anteile, wie team.seatZone), cat (Regel-id),
//        budget (Punkte der Runde), map (Karten-id), cap (höchstens so viele Einheiten) }
export function makeCtx(o) {
  const side = o.side === 'blau' ? 'blau' : 'rot';
  const zone = o.zone || { x: side === 'blau' ? [0, .5] : [.5, 1], y: [0, 1] };
  return { W: o.W, H: o.H, side, zone, cat: o.cat, budget: o.budget, map: o.map || 'feld', cap: o.cap || 220 };
}
// Welt mit der Karte (nur Gelände), um zu prüfen, wo Bodentruppen stehen dürfen
const terrCache = new Map();
function terrainOf(ctx) {
  const k = `${ctx.map}|${ctx.W}|${ctx.H}`;
  let w = terrCache.get(k);
  if (!w) { w = createWorld(ctx.W, ctx.H, 1); applyMap(w, ctx.map); terrCache.set(k, w); if (terrCache.size > 8) terrCache.delete(terrCache.keys().next().value); }
  return w;
}
const pool = ctx => PAINT.filter(t => ruleAllows(ctx.cat, t));

/* ---------- Pläne ---------- */
// Plan = [{ type, n, layer: 'front' | 'mid' | 'back' | 'flank', shape: null | 'linie' | 'keil' | 'kreis' }]
const layerOf = t => (isHeal(t) ? 'back' : isRanged(t) ? (T(t).range >= 300 ? 'back' : 'mid') : isFast(t) || T(t).fly ? 'flank' : 'front');
export const planCost = plan => plan.reduce((a, p) => a + p.n * T(p.type).cost, 0);
export const planUnits = plan => plan.reduce((a, p) => a + p.n, 0);

// shares: [[type, Anteil]] → Plan mit vollen Einheiten, Rest auffüllen, höchstens cap Einheiten
function fill(ctx, shares, spend = 1) {
  const B = ctx.budget * spend + 1e-9, plan = [];
  const tot = shares.reduce((a, s) => a + s[1], 0) || 1;
  let left = B, units = 0;
  for (const [type, w] of shares) {
    const c = T(type).cost;
    let n = Math.floor(Math.min(left, B * w / tot) / c + 1e-9);
    n = Math.min(n, ctx.cap - units);
    if (n < 1) continue;
    const old = plan.find(p => p.type === type);
    if (old) old.n += n; else plan.push({ type, n, layer: layerOf(type), shape: null });
    left -= n * c; units += n;
  }
  // Rest: der Reihe nach, was noch passt (teuerste zuerst, damit die Obergrenze nicht drückt)
  const by = [...new Set(shares.map(s => s[0]))].sort((a, b) => T(b).cost - T(a).cost);
  for (let guard = 0; guard < 400 && units < ctx.cap; guard++) {
    const t = by.find(x => T(x).cost <= left + 1e-9);
    if (!t) break;
    const p = plan.find(q => q.type === t);
    if (p) p.n++; else plan.push({ type: t, n: 1, layer: layerOf(t), shape: null });
    left -= T(t).cost; units++;
  }
  return plan;
}
// Gewicht einer Einheit als Frontkämpfer / Fernkämpfer (grobe Kosten-Nutzen-Schätzung, der Rest ist Zufall)
const frontW = t => Math.sqrt((T(t).hp * (T(t).dmg || 5) / (T(t).cd || 1)) / T(t).cost / 40) + .2;
const rangedW = t => Math.sqrt((T(t).dmg || 5) / (T(t).cd || 1) * Math.min(T(t).range, 300) / T(t).cost / 60) + .2;
const affordable = (ctx, t, k = .6) => T(t).cost <= Math.max(ctx.budget * k, 3);

// leicht: ein, zwei zufällige Einheiten, 60–85 % des Budgets
function planEasy(ctx, rand) {
  const P = pool(ctx).filter(t => affordable(ctx, t));
  const p = P.length ? P : pool(ctx);
  if (!p.length) return [];
  const a = pick(p, rand), b = rand() < .5 ? pick(p, rand) : null;
  const plan = fill(ctx, b && b !== a ? [[a, 1], [b, 1]] : [[a, 1]], .6 + rand() * .25);
  for (const q of plan) q.layer = pick(['front', 'mid', 'back', 'flank'], rand);
  return plan;
}
// mittel (und Kandidaten für schwer): Front + Fernkampf + manchmal Heiler, Flieger oder schnelle Flanke
export function planMid(ctx, rand, style = null) {
  const P = pool(ctx); if (!P.length) return [];
  const A = P.filter(t => affordable(ctx, t)).length ? P.filter(t => affordable(ctx, t)) : P;
  const melee = A.filter(isMelee), ranged = A.filter(isRanged), heal = A.filter(isHeal);
  style = style || pickW(['mix', 'mix', 'wall', 'guns', 'rush', 'spam'], [3, 2, 1, 1, 1, 1], rand);
  const shares = [];
  const fr = melee.length ? pickW(melee, melee.map(frontW), rand) : null;
  const rg = ranged.length ? pickW(ranged, ranged.map(rangedW), rand) : null;
  if (style === 'spam') {
    const t = pickW(A, A.map(x => (isRanged(x) ? rangedW(x) : frontW(x))), rand);
    shares.push([t, 1]);
  } else {
    const f = style === 'wall' ? .7 : style === 'guns' ? .3 : style === 'rush' ? .55 : .5;
    if (fr) shares.push([fr, f]);
    if (rg) shares.push([rg, 1 - f - (heal.length && style !== 'rush' ? .1 : 0)]);
    if (heal.length && style !== 'rush' && rg) shares.push([pick(heal, rand), .1]);
    if (style === 'rush' || rand() < .35) {
      const fl = A.filter(t => (isFast(t) || T(t).fly) && t !== fr);
      if (fl.length) shares.push([pick(fl, rand), .25]);
    }
    if (!shares.length) shares.push([pick(A, rand), 1]);
  }
  return fill(ctx, shares, 1);
}
// Formen: Schlachtreihe für die Front, Sturmkeil für Schnelle, Igel für Fernkämpfer und Heiler (ab SHAPE_MIN_UNITS)
export function addShapes(plan, rand, chance = 1) {
  for (const p of plan) {
    p.shape = null;
    if (p.n < SHAPE_MIN_UNITS || rand() > chance) continue;
    p.shape = p.layer === 'front' ? 'linie' : p.layer === 'flank' ? (T(p.type).fly ? 'kreis' : 'keil') : 'kreis';
  }
  return plan;
}

/* ---------- Aufstellen ---------- */
// Plan → Einheiten [{ type, team, x, y, shape }] in Pixeln. Gruppen werden als Form gelegt; Bodentruppen meiden Lava,
// Mauern und (wenn es anders geht) Wasser; Fernkämpfer suchen Wald, wenn die Karte welchen hat.
export function placePlan(ctx, plan, rand, sloppy = false) {
  const { W, H, side } = ctx, w = terrainOf(ctx), dir = side === 'blau' ? 1 : -1;
  const zx0 = ctx.zone.x[0] * W + 12, zx1 = ctx.zone.x[1] * W - 12, zy0 = ctx.zone.y[0] * H + 18, zy1 = ctx.zone.y[1] * H - 18;
  const mid = W / 2, front = mid - dir * W * .07;
  const depth = { front: 0, flank: .02, mid: .075, back: .14 };
  const out = [], taken = [];
  const free = (x, y, r, fly) => {
    if (x < zx0 || x > zx1 || y < zy0 || y > zy1) return false;
    if (side === 'blau' ? x > mid - 3 : x < mid + 3) return false;
    for (const q of taken) if (q.fly === fly && (q.x - x) ** 2 + (q.y - y) ** 2 < (q.r + r) ** 2 * 1.1) return false;
    if (fly) return true;
    const t = w.terr[cellIndex(w, x, y)];
    return t !== LAVA && t !== WALL;
  };
  const wet = (x, y) => w.terr[cellIndex(w, x, y)] === WATER;
  const woods = [];
  for (let i = 0; i < w.terr.length; i++) if (w.terr[i] === FOREST) woods.push(i);
  const forestNear = () => {
    // Waldzelle auf der eigenen Seite (für Fernkämpfer), sonst null
    const mine = woods.filter(i => { const x = (i % w.GW + .5) * 10; return side === 'blau' ? x < mid - 30 && x > zx0 : x > mid + 30 && x < zx1; })
      .filter(i => { const y = (Math.floor(i / w.GW) + .5) * 10; return y > zy0 && y < zy1; });
    if (!mine.length) return null;
    const i = pick(mine, rand);
    return [(i % w.GW + .5) * 10, (Math.floor(i / w.GW) + .5) * 10];
  };
  // vertikale Lage der Gruppen: über die Höhe der Zone verteilt
  const groups = plan.filter(p => p.n > 0);
  const yc = (zy0 + zy1) / 2, yh = zy1 - zy0;
  groups.forEach((p, gi) => {
    const r = T(p.type).r * (p.type === 'roemer' ? 1.15 : 1.25) + 1, sp = r * 2 + 1;
    let cx = clamp(front - dir * depth[p.layer] * W, zx0 + r, zx1 - r), cy = yc;
    if (p.layer === 'flank' && groups.length > 1) cy = yc + (gi % 2 ? -1 : 1) * yh * .3;
    if (sloppy) { cx = zx0 + rand() * (zx1 - zx0); cy = zy0 + rand() * yh; }
    if (!sloppy && isRanged(p.type) && woods.length && rand() < .8) { const f = forestNear(); if (f) { cx = f[0]; cy = f[1]; } }
    const pts = shapePoints(p.shape, p.n, sp, dir, yh);
    let placed = 0;
    // Punkte der Form (in Reihenfolge), dann drumherum auffüllen, falls Gelände im Weg war
    const tryAt = (x, y) => {
      if (placed >= p.n) return;
      const fly = !!T(p.type).fly;
      if (!free(x, y, r, fly)) return;
      if (!fly && wet(x, y) && rand() < .85) return;
      taken.push({ x, y, r, fly }); out.push({ type: p.type, team: side, x, y, shape: p.shape });
      placed++;
    };
    for (const [dx, dy] of pts) tryAt(cx + dx, cy + dy);
    for (let ring = 1; placed < p.n && ring < 60; ring++) {
      const k = Math.max(6, ring * 6);
      for (let i = 0; i < k && placed < p.n; i++) {
        const a = i / k * 6.2832 + ring;
        tryAt(cx + Math.cos(a) * ring * sp * .9, cy + Math.sin(a) * ring * sp * .9);
      }
    }
  });
  // Formen gelten erst ab SHAPE_MIN_UNITS (Gelände kann Einheiten gekostet haben)
  const n = new Map();
  for (const u of out) if (u.shape) n.set(u.type + '|' + u.shape, (n.get(u.type + '|' + u.shape) || 0) + 1);
  for (const u of out) if (u.shape && n.get(u.type + '|' + u.shape) < SHAPE_MIN_UNITS) u.shape = null;
  return out;
}
// Versatz (dx, dy) der Einheiten einer Gruppe: linie (senkrechte Reihe, mehrere Glieder), keil (Pfeil zum Gegner),
// kreis (Ring, innen aufgefüllt), sonst ein dichter Haufen
export function shapePoints(shape, n, sp, dir, yh) {
  const out = [];
  if (shape === 'linie') {
    const per = Math.max(4, Math.min(n, Math.floor(yh * .8 / sp))), rows = Math.ceil(n / per);
    for (let k = 0; k < n; k++) { const row = Math.floor(k / per), i = k % per, m = Math.min(per, n - row * per); out.push([-dir * row * sp, (i - (m - 1) / 2) * sp]); }
  } else if (shape === 'keil') {
    // Spitze vorn, zwei Schenkel nach hinten; ab der dritten Lage dahinter aufgefüllt
    out.push([0, 0]);
    for (let k = 1; out.length < n; k++) {
      out.push([-dir * k * sp * .8, -k * sp * .6]);
      if (out.length < n) out.push([-dir * k * sp * .8, k * sp * .6]);
      for (let j = 1; j < k - 1 && out.length < n; j++) { out.push([-dir * k * sp * .8, (j - (k - 1) / 2) * sp * .9]); }
    }
  } else if (shape === 'kreis') {
    const R = Math.max(sp * 1.2, sp * Math.min(n, 18) / 6.2832);
    const ringN = Math.min(n, Math.max(SHAPE_MIN_UNITS, Math.floor(6.2832 * R / sp)));
    for (let k = 0; k < ringN; k++) { const a = k / ringN * 6.2832; out.push([Math.cos(a) * R, Math.sin(a) * R]); }
    for (let k = ringN; k < n; k++) { const a = k * 2.39996, d = Math.sqrt((k - ringN + .5) / Math.max(1, n - ringN)) * (R - sp); out.push([Math.cos(a) * d, Math.sin(a) * d]); }
  } else {
    const cols = Math.max(1, Math.round(Math.sqrt(n * .8)));
    for (let k = 0; k < n; k++) out.push([-dir * Math.floor(k / cols) * sp, ((k % cols) - (cols - 1) / 2) * sp]);
  }
  return out;
}

/* ---------- Probeschlacht (schwer) ---------- */
// Kampf ohne Zeichnen, höchstens maxT Sekunden. Wertung aus Sicht von side: Sieg +1, Niederlage −1, dazu die Differenz
// der übrigen Punkte (nach LP gewichtet) im Verhältnis zum Budget.
export function trialRun(list, map, seed, W, H, side, budget, maxT = 40) {
  const w = createWorld(W, H, 1);
  w.teamMode = true;
  applyMap(w, map);
  for (const u of list) {
    if (!T(u.type).fly && w.terr[cellIndex(w, u.x, u.y)] === WALL) continue;
    const n = spawn(w, u.type, u.x, u.y, u.team);
    if (u.shape) applyShape(n, u.shape, true);
  }
  rebuildHash(w);
  const snap = snapshotBattle(w);
  resetFight(w, snap, seed);
  const c = { done: false, score: 0, t: 0 };
  const value = () => {
    let me = 0, them = 0;
    for (const u of w.units) if (u.alive && (u.team === 'blau' || u.team === 'rot')) {
      const v = T(u.type) ? T(u.type).cost * Math.min(1, u.hp / (u.T.hp || 1)) : 0;
      if (u.team === side) me += v; else them += v;
    }
    return [me, them];
  };
  let k60 = 0;
  c.pump = (ms = Infinity, now = () => globalThis.performance.now()) => {
    const end = now() + ms;
    while (!c.done) {
      for (let k = 0; k < 30 && !c.done; k++) {
        step(w, STEP); w.events.length = 0; c.t += STEP;
        let r = battleWinner(w, c.t);
        // jede Sekunde: Ist es klar (eine Seite hat viermal so viel übrig), gilt das als Sieg; spart Rechenzeit
        if (!r && ++k60 >= 60 && c.t > 6) {
          k60 = 0;
          const [me, them] = value();
          if (me > 4 * them + 2) r = side; else if (them > 4 * me + 2) r = side === 'blau' ? 'rot' : 'blau';
        }
        if (r || c.t >= maxT) {
          const [me, them] = value();
          const win = r === side ? 1 : r && r !== 'draw' ? -1 : 0;
          c.score = (r ? win : 0) + .6 * (me - them) / Math.max(1, budget);
          c.done = true;
        }
      }
      if (now() >= end) break;
    }
    return c.done;
  };
  return c;
}

// Vermutete Gegner-Armeen. known: Armeen, die der Gegner früher aufgedeckt hat ([[{ type, x, y, shape }]], neueste zuerst),
// octx: Lage des Gegners (Seite, Zone, seine Regel und sein Budget).
export function guessOpponents(octx, known, rand, same = false) {
  const out = [];
  const P = new Set(pool(octx));
  for (const arm of (known || []).slice(0, 2)) {
    if (!arm || !arm.length) continue;
    // Revanche (gleiche Regel und Karte): genau diese Armee, gespiegelt in die Lage des Gegners
    if (same && out.length === 0) { out.push(arm.map(u => ({ ...u, team: octx.side }))); continue; }
    // sonst die Anteile seiner Einheiten in der neuen Regel nachbauen (was nicht erlaubt ist, fällt weg)
    const by = new Map();
    for (const u of arm) if (P.has(u.type)) by.set(u.type, (by.get(u.type) || 0) + T(u.type).cost);
    if (!by.size) continue;
    const plan = addShapes(fill(octx, [...by.entries()], 1), rand, .7);
    out.push(placePlan(octx, plan, rand));
  }
  for (const st of ['mix', rand() < .5 ? 'wall' : 'guns']) {
    if (out.length >= 3) break;
    out.push(placePlan(octx, addShapes(planMid(octx, rand, st), rand, .7), rand));
  }
  return out.filter(a => a.length);
}
// Kandidaten für die eigene Armee: Mischungen in allen Stilen, Konter auf die Haupteinheit der Vermutung, reine Massen
function candidates(ctx, opps, rand, n) {
  const P = pool(ctx), out = [];
  const styles = ['mix', 'mix', 'wall', 'guns', 'rush', 'spam', 'mix', 'spam'];
  for (let i = 0; i < n - 2; i++) out.push(addShapes(planMid(ctx, rand, styles[i % styles.length]), rand, 1));
  // Konter: wer schlägt die teuerste Einheit der wahrscheinlichsten Gegner-Armee?
  const first = opps[0];
  if (first && first.length) {
    const by = new Map();
    for (const u of first) by.set(u.type, (by.get(u.type) || 0) + T(u.type).cost);
    const main = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0]);
    for (const m of main) {
      const ks = COUNTERS.filter(c => c[1] === m && P.includes(c[0]) && affordable(ctx, c[0], .8)).map(c => c[0]);
      if (!ks.length) continue;
      const k = pick(ks, rand), rest = planMid(ctx, rand, 'mix').filter(p => p.type !== k);
      const shares = [[k, .6], ...rest.map(p => [p.type, .4 * p.n * T(p.type).cost / Math.max(1, planCost(rest))])];
      out.push(addShapes(fill(ctx, shares, 1), rand, 1));
    }
  }
  while (out.length < n) out.push(addShapes(planMid(ctx, rand), rand, 1));
  return out.slice(0, n);
}

// Suche (schwer) in Häppchen: pump(ms) rechnet höchstens etwa ms Millisekunden, liefert true, wenn fertig; dann result.
// Für leicht und mittel ist sie sofort fertig.
//   opts: { known (frühere Armeen des Gegners), octx (Lage des Gegners, Standard: gespiegelt), same (Revanche),
//           seed, n (Kandidaten), maxT (Sekunden je Probeschlacht) }
export function createBotArmy(ctx, level, rand = Math.random, opts = {}) {
  const lvl = isLevel(level) ? level : 'mittel';
  const s = { done: false, result: null, level: lvl, tried: 0, scores: [] };
  s.finish = () => s.result;
  if (lvl === 'leicht') { s.result = placePlan(ctx, planEasy(ctx, rand), rand, true); s.done = true; s.pump = () => true; return s; }
  if (lvl === 'mittel') {
    const plan = addShapes(planMid(ctx, rand), rand, .75);
    s.result = placePlan(ctx, plan, rand); s.done = true; s.pump = () => true; return s;
  }
  // schwer
  const octx = opts.octx || makeCtx({ ...ctx, side: ctx.side === 'blau' ? 'rot' : 'blau', zone: { x: ctx.side === 'blau' ? [.5, 1] : [0, .5], y: [0, 1] } });
  const opps = guessOpponents(octx, opts.known, rand, !!opts.same).slice(0, 3);
  const cands = candidates(ctx, opps, rand, opts.n || 8).map(p => placePlan(ctx, p, rand)).filter(a => a.length);
  if (!cands.length || !opps.length) { s.result = cands[0] || placePlan(ctx, addShapes(planMid(ctx, rand), rand, 1), rand); s.done = true; s.pump = () => true; return s; }
  const seed = opts.seed || ((rand() * 2 ** 31) | 0), maxT = opts.maxT || 40;
  // Reihenfolge: erst alle Kandidaten gegen die wahrscheinlichste Vermutung, dann gegen die nächste. So hat finish()
  // jederzeit einen fairen Vergleich (alle bisher gleich oft geprüft).
  const jobs = [];
  opps.forEach((o, oi) => cands.forEach((a, ci) => jobs.push({ ci, oi })));
  const sum = cands.map(() => 0), cnt = cands.map(() => 0);
  let j = 0, run = null;
  const done = () => {
    let best = -1;
    for (let i = 0; i < sum.length; i++) if (cnt[i] && (best < 0 || sum[i] / cnt[i] > sum[best] / cnt[best])) best = i;
    s.scores = sum.map((x, i) => (cnt[i] ? x / cnt[i] : null)); s.result = cands[Math.max(0, best)]; s.done = true; run = null;
  };
  // Zeit um (Mensch ist fertig, Malzeit läuft ab): mit dem bisher Besten weiter
  s.finish = () => { if (!s.done) done(); return s.result; };
  s.pump = (ms = Infinity, now = () => globalThis.performance.now()) => {
    const end = now() + ms;
    while (!s.done) {
      if (!run) {
        const jb = jobs[j], list = [...cands[jb.ci], ...opps[jb.oi]];
        run = trialRun(list, ctx.map, seed + jb.oi, ctx.W, ctx.H, ctx.side, ctx.budget, maxT);
      }
      const left = end - now();
      if (left <= 0) break;
      if (run.pump(left, now)) {
        const jb = jobs[j];
        sum[jb.ci] += run.score * (jb.oi === 0 && opts.known && opts.known.length ? 1.5 : 1); cnt[jb.ci] += jb.oi === 0 && opts.known && opts.known.length ? 1.5 : 1;
        s.tried++; run = null; j++;
        if (j >= jobs.length) done();
      }
    }
    return s.done;
  };
  return s;
}

/* ---------- Abstimmung, Revanche, Emotes ---------- */
// Regel und Karte aus dem Angebot. schwer meidet Karten mit Lava/Mauer nicht, alle wählen eher etwas, das ihnen liegt:
// leicht zufällig, mittel und schwer bevorzugen Regeln mit großer Auswahl (mehr Möglichkeiten zum Kontern).
export function botVote(opts, level, rand = Math.random) {
  const rules = opts.rules || [], maps = opts.maps || [];
  if (level === 'leicht' || !rules.length) return { rule: pick(rules, rand), map: pick(maps, rand) };
  const w = rules.map(id => Math.sqrt(PAINT.filter(t => ruleAllows(id, t)).length) + rand() * 2);
  let bi = 0; for (let i = 1; i < w.length; i++) if (w[i] > w[bi]) bi = i;
  return { rule: rules[bi], map: pick(maps, rand) };
}
// Emote nach dem Kampf (Index in online.EMOTES = ['😂', '🔥', '😱', '👏', '🙈', '😎']) oder null
export function botEmote(event, level, rand = Math.random) {
  const p = level === 'leicht' ? .8 : level === 'mittel' ? .55 : .35;
  if (rand() > p) return null;
  if (event === 'win') return pick([0, 5, 1], rand);
  if (event === 'lose') return pick([2, 3, 4], rand);
  if (event === 'reveal') return rand() < .5 ? 1 : null;
  return null;
}

/* ---------- Kurzform der Armee (2v2: die KI-Armeen reisen in der presence des Hosts) ---------- */
// 3 Bytes je Einheit: Typ (6 Bit) + Form (2 Bit), x in 256 Stufen über die eigene Hälfte, y in 256 Stufen über die Höhe (je ~3 px).
// So passen drei KI-Armeen neben die eigene in die 4 KiB presence. types: Typ-Reihenfolge (online.PAINT_TYPES).
const SH = [null, 'keil', 'kreis', 'linie'];
const b64 = s => (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = t => { t = t.replace(/-/g, '+').replace(/_/g, '/'); return typeof atob === 'function' ? atob(t + '==='.slice((t.length + 3) % 4)) : Buffer.from(t, 'base64').toString('binary'); };
export function packBot(units, side, W, H, types) {
  let s = '';
  for (const u of units) {
    const ti = types.indexOf(u.type); if (ti < 0) continue;
    const hx = side === 'blau' ? u.x : u.x - W / 2;
    s += String.fromCharCode((ti & 63) | (Math.max(0, SH.indexOf(u.shape || null)) << 6), clamp(Math.floor(hx / (W / 2) * 256), 0, 255), clamp(Math.floor(u.y / H * 256), 0, 255));
  }
  return b64(s);
}
export function unpackBot(text, side, W, H, types) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text) || text.length > 1200) throw new Error('Armee unlesbar');
  const s = unb64(text), out = [];
  if (s.length % 3) throw new Error('Armee unvollständig');
  for (let o = 0; o < s.length; o += 3) {
    const a = s.charCodeAt(o), type = types[a & 63];
    if (!type) throw new Error('Unbekannte Einheit');
    // Mitte der Stufe: so landet das Wiederverpacken (online.packUnits, 65535 Stufen) nie genau zwischen zwei Werten,
    // und Geräte mit verschiedener Feldgröße bekommen dieselbe Armee
    const hx = (s.charCodeAt(o + 1) + .5) / 256 * (W / 2);
    out.push({ type, team: side, x: side === 'blau' ? hx : W / 2 + hx, y: (s.charCodeAt(o + 2) + .5) / 256 * H, shape: SH[a >> 6] || null });
  }
  return out;
}
export const BOT_CAP_2V2 = 100;   // Einheiten je KI-Armee im 2v2 (100 · 3 Bytes → 400 Zeichen)
