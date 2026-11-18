// Prüfstand: Einheit A (Umgebung A=, Vorgabe heli) gegen jede malbare Einheit bei gleichem Budget. node tools/helimatrix.mjs [pts] [runs]
import { UNITS } from '../game/js/data.js';
import { createWorld } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { placeDuel, DUEL_A, DUEL_B } from './plans.mjs';
const pts = +(process.argv[2] || 72), runs = +(process.argv[3] || 6), A = process.env.A || 'heli';
const DT = 1 / 60;
function duel(a, b, seed, swap) {
  const w = createWorld(1600, 900, seed); w.teamMode = true;
  const na = Math.max(1, Math.round(pts / UNITS[a].cost)), nb = Math.max(1, Math.round(pts / UNITS[b].cost));
  placeDuel(w, a, na, swap ? DUEL_B : DUEL_A, swap ? 'rot' : 'blau'); placeDuel(w, b, nb, swap ? DUEL_A : DUEL_B, swap ? 'blau' : 'rot');
  const ta = swap ? 'rot' : 'blau';
  let t = 0;
  for (;;) {
    let ca = 0, cb = 0, ha = 0, hb = 0;
    for (const u of w.units) if (u.alive) { if (u.team === ta) { ca++; ha += u.hp / u.T.hp; } else { cb++; hb += u.hp / u.T.hp; } }
    if (ca === 0 || cb === 0 || t >= 120) return { r: ca && !cb ? 1 : !ca && cb ? 0 : .5, t, left: ca ? ha / na : -hb / nb };
    step(w, DT); w.events.length = 0; t += DT;
  }
}
const types = Object.keys(UNITS).filter(k => UNITS[k].paint !== false && k !== A && (!process.env.ONLY || process.env.ONLY.split(',').includes(k)));
let tot = 0;
for (const b of types) {
  let s = 0, tt = 0, left = 0;
  for (let k = 1; k <= runs; k++) { const r = duel(A, b, k, k % 2 === 0); s += r.r; tt += r.t; left += r.left; }
  tot += s / runs;
  console.log(`${A} vs ${b.padEnd(12)} ${(s + '').padStart(4)}/${runs}  t~${(tt / runs).toFixed(0)}s  rest ${(left / runs * 100).toFixed(0)}%  (${UNITS[b].cat})`);
}
console.log(`Schnitt ${(tot / types.length * 100).toFixed(0)} %`);
