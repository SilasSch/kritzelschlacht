// Spar-Suche (25.11.): Wie billig lässt sich ein Level gewinnen? Silas: „die Level kann man oft mit einem Bruchteil der
// erlaubten Punkte machen“. Statt den Lösungsplan von Hand zu raten, sucht dieses Werkzeug je Level die billigste Armee,
// die gegen die echten (gehärteten) Gegner gewinnt, und schlägt par und Budget daraus vor.
//
// node tools/cheapwin.mjs <kapitel-id oder level-id>[,…] [seeds=4] [WxH=1600x900]
//
// Suche: jede erlaubte Einheit allein (Nahkampf vorn, Fernkampf hinten, dazu breit und ganz hinten) und jedes Paar
// halb-halb; je Aufstellung eine binäre Suche über die Punkte (Sieg = mindestens 3 von 4 Saaten). Ausgabe je Level:
// billigste Armee (Kosten, Plan), billigster Sieg je Einheit allein, und Vorschläge (gehärtet und als Rohwerte für die
// Kapiteldatei, die harden() noch mit BUDGET_SCALE kürzt). Läuft je Level in einem eigenen Prozess.
import { spawn as spawnProc } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { UNITS } from '../game/js/data.js';
import { createWorld } from '../game/js/world.js';
import { step, buildMission, missionResult } from '../game/js/sim.js';
import { CHAPTERS, levelInfo, paintableUnits, BUDGET_SCALE } from '../game/js/campaign/index.js';
import { F, B, Md, Deep } from '../game/js/campaign/areas.js';
import { placePlan } from './plans.mjs';

const DT = 1 / 60;
export const PAR_K = 1.12, BUDGET_K = 1.3;   // par = billigster Sieg × PAR_K, Budget = par × BUDGET_K
const WIDE = [.3, .12, .38, .88];
const [arg, seedsArg = '4', shapeArg = '1600x900'] = process.argv.slice(2);
const SEEDS = Math.max(2, parseInt(seedsArg, 10) || 4), NEED = Math.ceil(SEEDS * .75);
const [W, H] = shapeArg.split('x').map(Number);
if (!arg) { console.error('usage: node tools/cheapwin.mjs <kapitel|level>[,…] [seeds=4] [WxH]'); process.exit(2); }

const ids = arg.split(',').flatMap(x => { const c = CHAPTERS.find(c => c.id === x); return c ? c.levels.map(l => l.id) : [x]; });
for (const id of ids) if (!levelInfo(id)) { console.error('unbekannt: ' + id); process.exit(2); }

// Mehrere Level: je Level ein Prozess, höchstens so viele wie Kerne
if (ids.length > 1) {
  const self = fileURLToPath(import.meta.url), out = new Map();
  let next = 0;
  const work = () => new Promise(res => {
    const go = () => {
      if (next >= ids.length) { res(); return; }
      const id = ids[next++];
      const p = spawnProc(process.execPath, [self, id, String(SEEDS), shapeArg]);
      let s = ''; p.stdout.on('data', d => { s += d; }); p.stderr.on('data', d => { s += d; });
      p.on('close', () => { out.set(id, s); go(); });
    };
    go();
  });
  await Promise.all(Array.from({ length: Math.min(ids.length, os.cpus().length) }, work));
  for (const id of ids) process.stdout.write(out.get(id));
  process.exit(0);
}

const level = levelInfo(ids[0]).level;
const ranged = t => UNITS[t].range >= 20 || UNITS[t].heal;
function fight(plan, seed) {
  const w = createWorld(W, H, seed); buildMission(w, level);
  placePlan(w, plan);
  let t = 0, res = missionResult(w, t);
  while (!res) { step(w, DT); w.events.length = 0; t += DT; res = missionResult(w, t); }
  return res === 'win';
}
// Gewinnt die Armee aus parts ([typ, anteil, bereich]) mit P Punkten? (früh abbrechen, sobald klar)
const cost = plan => plan.reduce((a, [t, n]) => a + n * UNITS[t].cost, 0);
function planFor(parts, P) {
  return parts.map(([t, f, area]) => [t, Math.max(1, Math.floor(P * f / UNITS[t].cost)), ...area]);
}
function wins(plan) {
  let ok = 0;
  for (let s = 1; s <= SEEDS; s++) { if (fight(plan, 7000 + s)) ok++; if (ok >= NEED) return true; if (ok + SEEDS - s < NEED) return false; }
  return false;
}
// Billigste Punkte für diese Aufstellung (binäre Suche zwischen lo und hi), oder Infinity
function cheapest(parts, hi) {
  if (!wins(planFor(parts, hi))) return { P: Infinity };
  let lo = 0, best = planFor(parts, hi);
  for (let i = 0; i < 7 && hi - lo > 1.5; i++) {
    const mid = (lo + hi) / 2, p = planFor(parts, mid);
    if (wins(p)) { hi = mid; best = p; } else lo = mid;
  }
  return { P: cost(best), plan: best };
}

const units = paintableUnits(level);
const HI = Math.max(level.budget * 2, 60);
const solo = [], all = [];
for (const t of units) {
  const areas = ranged(t) ? [B, Deep] : [F, WIDE];
  let b = { P: Infinity };
  for (const a of areas) { const r = cheapest([[t, 1, a]], Math.min(HI, b.P)); if (r.P < b.P) b = r; }
  solo.push([t, b.P]); all.push(b);
}
for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
  const a = units[i], c = units[j];
  const ra = ranged(a), rc = ranged(c);
  const parts = [[a, .5, ra ? B : F], [c, .5, rc ? (ra ? Deep : B) : (ra ? F : Md)]];
  all.push(cheapest(parts, HI));
}
all.sort((x, y) => x.P - y.P);
const best = all[0];
const fmt = v => (Number.isFinite(v) ? (Math.round(v * 10) / 10).toString() : '—');
const par = Math.ceil(best.P * PAR_K), budget = Math.ceil(par * BUDGET_K);
console.log(`${level.id}  Budget ${level.budget} par ${level.par}  billigster Sieg ${fmt(best.P)}  (${fmt(best.P / level.budget * 100)} % des Budgets)`);
if (best.plan) console.log(`  Plan: ${JSON.stringify(best.plan.map(([t, n, ...r]) => [t, n, ...r.map(v => +v.toFixed(2))]))}`);
console.log(`  allein: ${solo.sort((a, b) => a[1] - b[1]).map(([t, p]) => `${t} ${fmt(p)}`).join(', ')}`);
if (Number.isFinite(best.P)) console.log(`  Vorschlag (gehärtet): par ${par}, Budget ${budget}  ·  in der Kapiteldatei: par ${Math.ceil(par / BUDGET_SCALE)}, budget ${Math.ceil(budget / BUDGET_SCALE)}`);
else console.log('  Vorschlag: keine Armee bis ' + HI + ' Punkte gewinnt – Gegner zu stark');
