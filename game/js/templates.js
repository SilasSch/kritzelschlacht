// Armee-Vorlagen (25.11.): die eigene Aufstellung speichern und in einer anderen Mission oder Schlacht wieder laden.
// Rein (kein DOM). Gespeichert wird je Einheit [typ, rx, ry, form]: rx ist der Anteil an der Breite der eigenen Zone
// (links von xMax), ry der Anteil der Höhe. So passt eine Vorlage in jede Mission (Mallinie) und auf die blaue
// Hälfte der Schlacht. Gelände gehört nicht dazu.
import { UNITS } from './data.js';
import { spawn, cellIndex } from './world.js';
import { applyShape } from './shapes.js';

export const TEMPLATE_MAX = 8, TEMPLATE_UNITS = 400;
const LAVA = 2, WALL = 4, EPS = 1e-6;
const r3 = v => Math.round(v * 1000) / 1000;

// Aus den Einheiten (team, links von xMax) eine Vorlage { n, u: [[typ, rx, ry, form?]], pts }; null ohne Einheiten
export function makeTemplate(units, team, xMax, H, name) {
  const u = [];
  let pts = 0;
  for (const e of units) {
    if (!e.alive || e.team !== team || !UNITS[e.type] || UNITS[e.type].paint === false || u.length >= TEMPLATE_UNITS) continue;
    u.push(e.shape ? [e.type, r3(e.x / xMax), r3(e.y / H), e.shape] : [e.type, r3(e.x / xMax), r3(e.y / H)]);
    pts += UNITS[e.type].cost;
  }
  return u.length ? { n: String(name).slice(0, 40), u, pts: Math.round(pts * 10) / 10 } : null;
}

// Gespeicherte Liste säubern: nur bekannte, malbare Typen, Werte in 0..1, höchstens TEMPLATE_MAX
export function cleanTemplates(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const t of raw) {
    if (out.length >= TEMPLATE_MAX) break;
    if (!t || typeof t !== 'object' || !Array.isArray(t.u)) continue;
    const u = t.u.filter(e => Array.isArray(e) && UNITS[e[0]] && UNITS[e[0]].paint !== false
      && e[1] >= 0 && e[1] <= 1 && e[2] >= 0 && e[2] <= 1).slice(0, TEMPLATE_UNITS)
      .map(e => (typeof e[3] === 'string' ? [e[0], +e[1], +e[2], e[3]] : [e[0], +e[1], +e[2]]));
    if (!u.length) continue;
    out.push({ n: String(t.n || '').slice(0, 40), u, pts: Math.round(u.reduce((a, e) => a + UNITS[e[0]].cost, 0) * 10) / 10 });
  }
  return out;
}

// Vorlage aufstellen. opts: { team, xMax, budget (Infinity ohne Grenze), spent, allowed(typ) }.
// Liefert { placed, spent, skipped: { type, budget, terrain } } (skipped zählt, was nicht passte).
export function applyTemplate(world, tpl, { team, xMax, budget = Infinity, spent = 0, allowed = () => true }) {
  const skipped = { type: 0, budget: 0, terrain: 0 };
  let placed = 0;
  for (const [type, rx, ry, shape] of tpl.u) {
    if (!allowed(type)) { skipped.type++; continue; }
    const T = UNITS[type];
    if (spent + T.cost > budget + EPS) { skipped.budget++; continue; }
    const x = Math.min(xMax - 2, Math.max(6, rx * xMax)), y = Math.min(world.H - 6, Math.max(6, ry * world.H));
    const t = world.terr[cellIndex(world, x, y)];
    if (!T.fly && (t === LAVA || t === WALL)) { skipped.terrain++; continue; }
    const n = spawn(world, type, x, y, team);
    if (shape) applyShape(n, shape);
    spent += T.cost; placed++;
  }
  return { placed, spent, skipped };
}
