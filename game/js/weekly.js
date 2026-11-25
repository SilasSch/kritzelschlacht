// Wochenchallenge (25.11.): eine Mission je Kalenderwoche (ISO-Woche), für alle gleich: Gegnerarmee, Karte und eine
// Sonderregel für die eigenen Einheiten (rules.js) kommen aus der Saat der Woche. Ziel: mit möglichst wenig Punkten
// gewinnen. Drei Sterne bis par (80 % der Gegnerpunkte), zwei bis 1,25 × par. Rein bis auf das Aufstellen.
import { quickPlan, placeQuick, planCost } from './quick.js';
import { RULES, MAPS, applyMap } from './rules.js';
import { UNITS } from './data.js';
import { seeded } from './waves.js';

export const WEEKLY = { ENEMY: 70, BUDGET: 1.5, PAR: .8, KEEP: 8 };
// Regeln ohne Budget-Änderung und nicht „Alles erlaubt“
const POOL = RULES.filter(r => !r.bm && r.id !== 'alles');

// ISO-Woche 'YYYY-Www' eines Datums (lokale Zeit)
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear(), w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}
const hash = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// Level der Woche (ohne Gegner; die stellt placeWeekly auf)
export function weeklyLevel(key = weekKey()) {
  const rand = seeded(hash('kritzel-woche-' + key));
  const rule = POOL[rand() * POOL.length | 0], map = MAPS[rand() * MAPS.length | 0];
  const plan = quickPlan(WEEKLY.ENEMY, rand, 'rot', t => UNITS[t].cost <= 12);
  const pts = Math.round(planCost(plan) * 10) / 10;
  return {
    id: 'weekly-' + key, n: 'Wochenchallenge', hint: '', budget: Math.round(pts * WEEKLY.BUDGET), par: Math.round(pts * WEEKLY.PAR),
    cats: rule.cats || null, units: rule.units || null, place: [],
    weekly: { key, rule: rule.id, ruleN: rule.n, ruleD: rule.d, map: map.id, plan, pts },
  };
}

export function placeWeekly(world, def) {
  applyMap(world, def.weekly.map);
  placeQuick(world, def.weekly.plan, 'rot');
}

// Bestwert der Woche eintragen ({ spent, stars }, weniger Punkte ist besser). Liefert den (neuen) Bestwert.
export function recordWeekly(store, key, r) {
  const old = store[key];
  if (r.win && (!old || r.spent < old.spent)) store[key] = { spent: Math.round(r.spent * 100) / 100, stars: r.stars };
  return store[key] || null;
}

export function cleanWeekly(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const keys = Object.keys(raw).filter(k => /^\d{4}-W\d{2}$/.test(k)).sort().slice(-WEEKLY.KEEP);
  for (const k of keys) {
    const v = raw[k], spent = v && Number(v.spent), stars = v && Math.floor(Number(v.stars));
    if (spent >= 0 && Number.isFinite(spent)) out[k] = { spent, stars: Math.max(0, Math.min(3, stars || 0)) };
  }
  return out;
}
