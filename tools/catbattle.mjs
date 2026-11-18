// Kategorie gegen Kategorie: gleiche Punkte, je Seite zufällige Mischung der Kategorie (Siegquote Blau)
// node tools/catbattle.mjs [runs=10] [pts=80]
import { UNITS } from '../game/js/data.js';
import { createWorld, spawn } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
const runs = +process.argv[2] || 10, PTS = +process.argv[3] || 80;
const CATS = ['armee', 'tiere', 'mythisch', 'modern', 'schrott', 'urzeit'];
const pool = c => Object.keys(UNITS).filter(t => UNITS[t].cat === c && UNITS[t].paint !== false);
function army(w, c, team, rnd) {
  const P = pool(c); let left = PTS, i = 0;
  while (left > 1 && i < 200) {
    const t = P[Math.floor(rnd() * P.length)]; i++;
    if (UNITS[t].cost > left || UNITS[t].cost > PTS * .4) continue;
    left -= UNITS[t].cost;
    const x = team === 'blau' ? 150 + rnd() * 300 : 1450 - rnd() * 300, y = 120 + rnd() * 660;
    spawn(w, t, x, y, team);
  }
}
function battle(a, b, seed) {
  const w = createWorld(1600, 900, seed); w.teamMode = true;
  let s = seed * 9973; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  army(w, a, 'blau', rnd); army(w, b, 'rot', rnd);
  for (let t = 0; t < 185; t += 1 / 60) {
    let ca = 0, cb = 0; for (const u of w.units) if (u.alive) { if (u.team === 'blau') ca++; else cb++; }
    if (!ca || !cb) return ca > 0 ? 1 : 0;
    step(w, 1 / 60); w.events.length = 0;
  }
  return .5;
}
for (const a of (process.argv[4] ? process.argv[4].split(',') : ['schrott', 'urzeit'])) {
  const row = [];
  for (const b of CATS) { let s = 0; for (let k = 1; k <= runs; k++) s += (battle(a, b, k) + 1 - battle(b, a, k + 50)) / 2; row.push(`${b}:${(s / runs * 100).toFixed(0)}%`); }
  console.log(a.padEnd(8), row.join(' '));
}
