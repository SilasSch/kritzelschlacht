// Teslaspule gegen jede malbare Einheit bei gleichen Punkten (25.11., Nerf-Wunsch Silas).
// node tools/teslalab.mjs [runs=4] [pts=84] [gegner=a,b] [angreifer=tesla]
// Ausgabe je Gegner: Siege der Tesla von runs und wie viel Punkte (in %) beim Sieger übrig sind (+ = Tesla, − = Gegner).
import { UNITS } from '../game/js/data.js';
import { createWorld } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { DUEL_A, DUEL_B, placeDuel } from './plans.mjs';
import { TESLA } from '../game/js/abilities.js';
// Probewerte ohne Codeänderung: SET="JUMPS=3,FALL=.7,dmg=12,cd=2.4" (Großbuchstaben → TESLA, sonst UNITS.tesla)
for (const kv of (process.env.SET || '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('='); (k === k.toUpperCase() ? TESLA : UNITS.tesla)[k] = +v;
}
const runs = +process.argv[2] || 4, PTS = +process.argv[3] || 84, ME = process.argv[5] || 'tesla';
const ALL = Object.keys(UNITS).filter(t => UNITS[t].paint !== false && t !== ME && !UNITS[t].boss);
const OPP = process.argv[4] ? process.argv[4].split(',') : ALL;
function duel(a, b, seed) {
  const w = createWorld(1600, 900, seed); w.teamMode = true;
  const na = Math.max(1, Math.round(PTS / UNITS[a].cost)), nb = Math.max(1, Math.round(PTS / UNITS[b].cost));
  placeDuel(w, a, na, DUEL_A, 'blau'); placeDuel(w, b, nb, DUEL_B, 'rot');
  const left = tm => w.units.filter(u => u.alive && u.team === tm).reduce((s, u) => s + (UNITS[u.type] ? UNITS[u.type].cost * u.hp / u.T.hp : 0), 0);
  for (let t = 0; t < 185; t += 1 / 60) {
    let ca = 0, cb = 0; for (const u of w.units) if (u.alive) { if (u.team === 'blau') ca++; else cb++; }
    if (!ca || !cb) return ca > 0 ? { win: 1, m: left('blau') / (na * UNITS[a].cost) } : { win: 0, m: -left('rot') / (nb * UNITS[b].cost) };
    step(w, 1 / 60); w.events.length = 0;
  }
  return { win: .5, m: 0 };
}
const out = [];
let tot = 0;
for (const b of OPP) {
  let s = 0, m = 0;
  for (let k = 1; k <= runs; k++) { const r = duel(ME, b, 700 + k); s += r.win; m += r.m; }
  tot += s; out.push({ b, s, m: m / runs });
  console.log(`${b.padEnd(12)} ${String(s).padStart(4)}/${runs}  ${(m / runs * 100 >= 0 ? '+' : '') + (m / runs * 100).toFixed(0)}%`);
}
console.log(`${ME} gesamt: ${(tot / (runs * OPP.length) * 100).toFixed(0)}% Siege (${PTS} Punkte)`);
if (process.env.JSON) console.log('JSON' + JSON.stringify(out));
