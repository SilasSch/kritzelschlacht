// Schrottplatz/Urzeit: jede neue Einheit gegen Bezugseinheiten bei gleichen Punkten (Siegquote, Blau = neue Einheit)
// node tools/eramatrix.mjs [runs=4] [pts=60] [types=a,b]
import { UNITS } from '../game/js/data.js';
import { createWorld } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { DUEL_A, DUEL_B, placeDuel } from './plans.mjs';
const runs = +process.argv[2] || 4, PTS = +process.argv[3] || 60;
const NEW = process.argv[4] ? process.argv[4].split(',') : ['minibot', 'laserbot', 'drohne', 'kuppel', 'spinne', 'schweisser', 'magnet', 'tesla', 'mega', 'hoehle', 'speer', 'schamane', 'raptor', 'ptera', 'anky', 'trike', 'rex', 'mammut'];
const REF = ['krieger', 'schuetze', 'ritter', 'reiter', 'grenadier', 'wolf', 'baer', 'soldat', 'mg', 'panzer', 'magier', 'troll', 'drache', 'heli', 'elefant', 'biene'];
function duel(a, b, seed) {
  const w = createWorld(1600, 900, seed); w.teamMode = true;
  const na = Math.max(1, Math.round(PTS / UNITS[a].cost)), nb = Math.max(1, Math.round(PTS / UNITS[b].cost));
  placeDuel(w, a, na, DUEL_A, 'blau'); placeDuel(w, b, nb, DUEL_B, 'rot');
  for (let t = 0; t < 185; t += 1 / 60) {
    let ca = 0, cb = 0; for (const u of w.units) if (u.alive) { if (u.team === 'blau') ca++; else cb++; }
    if (!ca || !cb) return ca > 0 ? 1 : 0;
    step(w, 1 / 60); w.events.length = 0;
  }
  return .5;
}
for (const a of NEW) {
  let tot = 0; const row = [];
  for (const b of REF) { let s = 0; for (let k = 1; k <= runs; k++) s += duel(a, b, 700 + k); tot += s; row.push(`${b}:${s}`); }
  console.log(`${a.padEnd(11)} ${(tot / (runs * REF.length) * 100).toFixed(0).padStart(3)}%  ${row.join(' ')}`);
}
