// Feldzug (25.11.): Roguelite aus RUN.STAGES Schlachten hintereinander. Der Spieler beginnt mit wenigen Einheitentypen
// und einem kleinen Budget; nach jedem Sieg wählt er eine von drei Belohnungen (neue Einheit oder mehr Punkte). Gegner
// werden von Schlacht zu Schlacht stärker, die letzte hat Bosse. Niederlagen kosten ein Leben, ohne Leben ist der
// Feldzug vorbei. Jeder Sieg bringt RUN.GROW Punkte Budget, die Belohnung kommt dazu. Rein: kein DOM, Zufall nur aus der Saat des Laufs. Zustand in save.run.
import { UNITS } from './data.js';
import { quickPlan, placeQuick, planCost } from './quick.js';
import { MAPS, applyMap } from './rules.js';
import { seeded } from './waves.js';

export const RUN = { STAGES: 6, LIVES: 2, START_BUDGET: 40, START_UNITS: 3, BONUS: 14, GROW: 12, ENEMY: [30, 42, 56, 70, 86, 108], CHOICES: 3 };
const POOL = () => Object.keys(UNITS).filter(t => UNITS[t].paint !== false && UNITS[t].cost <= 12);
const pickN = (list, n, rand) => { const a = list.slice(), out = []; while (out.length < n && a.length) out.push(a.splice(rand() * a.length | 0, 1)[0]); return out; };

export function newRun(seed) {
  const rand = seeded(seed ^ 0xfe1d);
  // Start: drei billige Typen (bis 4 Punkte), damit jede Armee möglich ist
  const cheap = POOL().filter(t => UNITS[t].cost <= 4);
  return { seed, stage: 1, lives: RUN.LIVES, budget: RUN.START_BUDGET, units: pickN(cheap, RUN.START_UNITS, rand), done: false, won: false };
}

// Level der aktuellen Schlacht (als Mission ohne Kapitel, kind 'run')
export function runLevel(run) {
  const k = run.stage, rand = seeded(run.seed + k * 104729);
  const map = MAPS[rand() * MAPS.length | 0];
  const boss = k === RUN.STAGES;
  const plan = quickPlan(RUN.ENEMY[k - 1], rand, 'rot', t => (boss ? UNITS[t].cost >= 6 : UNITS[t].cost <= 12));
  return {
    id: `run-${run.seed}-${k}`, n: 'Feldzug', hint: '', budget: run.budget, par: run.budget, units: run.units.slice(), place: [],
    run: { stage: k, map: map.id, plan, pts: Math.round(planCost(plan) * 10) / 10, boss },
  };
}
export function placeRun(world, def) { applyMap(world, def.run.map); placeQuick(world, def.run.plan, 'rot'); }

// Drei Belohnungen nach Schlacht k: neue Einheitentypen (noch nicht im Heer) und eine Punkte-Belohnung
export function rewards(run) {
  const rand = seeded(run.seed + run.stage * 7717);
  const fresh = POOL().filter(t => !run.units.includes(t));
  const u = pickN(fresh, RUN.CHOICES - 1, rand).map(t => ({ kind: 'unit', type: t }));
  return [...u, { kind: 'budget', n: RUN.BONUS + 2 * run.stage }];
}

// Nach einem Sieg: nächste Schlacht (oder gewonnen). Nach einer Niederlage: ein Leben weniger (oder vorbei).
export function afterFight(run, win) {
  if (win) { if (run.stage >= RUN.STAGES) { run.done = true; run.won = true; } else { run.stage++; run.budget += RUN.GROW; } }   // jeder Sieg: +GROW Budget
  else if (--run.lives <= 0) run.done = true;
  return run;
}
export function applyReward(run, r) {
  if (r.kind === 'unit' && UNITS[r.type] && !run.units.includes(r.type)) run.units.push(r.type);
  else if (r.kind === 'budget') run.budget += r.n;
  return run;
}

export function cleanRun(raw) {
  if (!raw || typeof raw !== 'object' || raw.done) return null;
  const seed = Math.floor(Number(raw.seed)), stage = Math.floor(Number(raw.stage)), lives = Math.floor(Number(raw.lives)), budget = Number(raw.budget);
  if (!Number.isFinite(seed) || !(stage >= 1 && stage <= RUN.STAGES) || !(lives >= 1 && lives <= RUN.LIVES) || !(budget > 0 && budget < 1e4)) return null;
  const units = Array.isArray(raw.units) ? [...new Set(raw.units.filter(t => UNITS[t] && UNITS[t].paint !== false))] : [];
  if (!units.length) return null;
  return { seed, stage, lives, budget, units, done: false, won: false, pick: !!raw.pick };
}
