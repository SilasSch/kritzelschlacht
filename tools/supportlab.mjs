// Unterstützer-Labor: Krieger-Linie vorn, Sanitäter + Trommler dahinter, Gegner stürmen an.
// Misst, wie lange die Unterstützer bei ihren Leuten bleiben (Takt-Abdeckung, Heilung, Rückzugsweg).
// node tools/supportlab.mjs [--seeds=8] [--json=out.json]
import { createWorld, spawn, RV_DRUM } from '../game/js/world.js';
import { step } from '../game/js/sim.js';

const DT = 1 / 60;
export function runSupport(seed = 7, opts = {}) {
  const w = createWorld(1600, 900, seed); w.teamMode = true;
  const front = [];
  for (let i = 0; i < 8; i++) front.push(spawn(w, 'krieger', 600, 300 + i * 40, 'blau'));
  const sup = [spawn(w, 'sani', 520, 380, 'blau'), spawn(w, 'sani', 520, 520, 'blau'),
               spawn(w, 'trommler', 540, 330, 'blau'), spawn(w, 'trommler', 540, 570, 'blau')];
  for (let i = 0; i < (opts.red ?? 9); i++) spawn(w, 'krieger', 1000, 290 + i * 40, 'rot');
  const trace = sup.map(u => ({ type: u.type, pts: [] }));
  let healed = 0, drumS = 0, frontS = 0, fleeS = 0, contact = null;
  const hpSum = () => w.units.filter(u => u.team === 'blau' && u.alive).reduce((s, u) => s + u.hp, 0);
  for (let i = 0; i < 20 * 60; i++) {
    const before = hpSum();
    step(w, DT);
    for (const e of w.events) if (e.type === 'heal') healed++;
    w.events.length = 0;
    if (contact === null && front.some(u => u.alive && u.tg && u.tg.alive && Math.hypot(u.tg.x - u.x, u.tg.y - u.y) < 40)) contact = i;
    if (contact !== null) {
      for (const u of front) if (u.alive) { frontS += DT; if (u.rv[RV_DRUM] > w.time) drumS += DT; }
      for (const s of sup) if (s.alive && (s.fleeX || s.fleeY)) fleeS += DT / sup.length;
    }
    if (i % 6 === 0) sup.forEach((u, k) => { if (u.alive) trace[k].pts.push([Math.round(u.x), Math.round(u.y), i * DT]); });
  }
  const blueAlive = w.units.filter(u => u.team === 'blau' && u.alive && u.T.dmg >= 10).length;
  const redAlive = w.units.filter(u => u.team === 'rot' && u.alive).length;
  return { m: { seed, drumUp: +(drumS / (frontS || 1) * 100).toFixed(0), heals: healed, fleeS: +fleeS.toFixed(1),
    supAlive: sup.filter(u => u.alive).length, minX: Math.min(...sup.map(u => u.x)) | 0, blueAlive, redAlive, win: redAlive === 0 },
    trace, front: front.map(u => [u.x | 0, u.y | 0]) };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const n = +((process.argv.find(a => a.startsWith('--seeds=')) || '=8').split('=')[1]);
  const json = (process.argv.find(a => a.startsWith('--json=')) || '').slice(7);
  const all = [];
  for (let s = 1; s <= n; s++) { const r = runSupport(s); all.push(r); console.log(JSON.stringify(r.m)); }
  const avg = k => (all.reduce((a, r) => a + +r.m[k], 0) / n).toFixed(1);
  console.log('Schnitt', { drumUp: avg('drumUp'), heals: avg('heals'), fleeS: avg('fleeS'), wins: all.filter(r => r.m.win).length });
  if (json) (await import('node:fs')).writeFileSync(json, JSON.stringify(all[0]));
}
