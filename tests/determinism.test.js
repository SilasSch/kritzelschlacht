// Ganze Simulation deterministisch und ohne Math.random: dieselbe Mission zweimal mit gleichem Seed ergibt
// denselben Zustand (Einheiten, Leichen, Brocken, Geschosse, Gelände). Math.random wirft währenddessen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../game/js/world.js';
import { step, buildMission, missionResult } from '../game/js/sim.js';
import { MISSION_PLANS, placePlan } from '../tools/plans.mjs';

const f3 = v => v.toFixed(3);
function run(i, seconds) {
  const w = createWorld(1600, 820, 77); buildMission(w, i); placePlan(w, MISSION_PLANS[i].smart);
  let t = 0, events = 0;
  while (!missionResult(w, t) && t < seconds) { step(w, 1 / 60); events += w.events.length; w.events.length = 0; t += 1 / 60; }
  let terr = 0;
  for (let k = 0; k < w.terr.length; k++) terr = (terr * 31 + w.terr[k] + Math.round(w.whp[k])) | 0;
  return [
    w.units.map(u => `${u.id}:${f3(u.x)},${f3(u.y)},${f3(u.z)},${f3(u.hp)},${u.state},${u.stance},${f3(u.burnT)}`).join('|'),
    w.corpses.map(c => `${c.kind}:${f3(c.x)},${f3(c.y)},${f3(c.z)},${c.state}`).join('|'),
    w.debris.map(d => `${f3(d.x)},${f3(d.y)},${f3(d.z)}`).join('|'),
    w.proj.map(p => `${p.kind}:${f3(p.x)},${f3(p.y)}`).join('|'),
    `terr ${terr} events ${events} t ${f3(t)} rng ${w.rng()}`,
  ];
}

test('Missionen laufen ohne Math.random und zweimal gleich (Feuer, Mauern, Bosse, Leichen)', () => {
  const orig = Math.random;
  Math.random = () => { throw new Error('Math.random in der Simulation'); };
  try {
    // M2 Bomben und Pfeile, M5 Mauern und Feuerbälle, M8 Drachenfeuer und Bienen, M9 Panzer, MG, Hubschrauber
    for (const [i, s] of [[1, 20], [4, 20], [7, 15], [8, 15]]) {
      const a = run(i, s), b = run(i, s);
      assert.ok(a[1].length > 0, `M${i + 1}: es gibt Leichen`);
      assert.deepEqual(a, b, `M${i + 1}`);
    }
  } finally {
    Math.random = orig;
  }
});
