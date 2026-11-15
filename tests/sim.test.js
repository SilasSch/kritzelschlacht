import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn } from '../game/js/world.js';
import { step, buildMission, missionResult, sandboxWinner } from '../game/js/sim.js';
import { placePlan, MISSION_PLANS, COUNTERS } from '../tools/plans.mjs';

test('Mission 1: 9 Ritter gewinnen in 60 s Simulation', () => {
  const w = createWorld(1400, 820, 11); buildMission(w, 0); w.teamMode = true;
  placePlan(w, [['ritter', 9, .3, .4, .34, .6]]);           // Hilfsfunktion aus tools/plans.mjs
  let t = 0; while (t < 60 && !missionResult(w, t)) { step(w, 1/60); t += 1/60; }
  assert.equal(missionResult(w, t), 'win'); });

test('buildMission setzt Teammodus, rote Einheiten und Gelände', () => {
  const w = createWorld(1400, 820, 3); buildMission(w, 3);
  assert.equal(w.teamMode, true);
  assert.equal(w.units.length, 22 + 10 + 4);
  assert.ok(w.units.every(u => u.team === 'rot'));
  assert.ok(w.terr.some(t => t === 1));
});

test('missionResult: Blau 0 → lose, Rot 0 → win, >180 s → lose, sonst null', () => {
  const w = createWorld(1400, 820, 3); w.teamMode = true;
  assert.equal(missionResult(w, 0), 'lose');
  const b = spawn(w, 'krieger', 100, 100, 'blau');
  assert.equal(missionResult(w, 0), 'win');
  const r = spawn(w, 'krieger', 900, 100, 'rot');
  assert.equal(missionResult(w, 10), null);
  assert.equal(missionResult(w, 181), 'lose');
  b.alive = false; assert.equal(missionResult(w, 10), 'lose'); r.alive = false;
});

test('step ist deterministisch beim gleichen Seed', () => {
  const run = () => { const w = createWorld(1400, 820, 9); buildMission(w, 1);
    placePlan(w, MISSION_PLANS[1].smart);
    for (let k = 0; k < 600; k++) step(w, 1/60);
    return w.units.map(u => [u.x.toFixed(3), u.y.toFixed(3), u.hp.toFixed(3)].join()).join('|'); };
  assert.equal(run(), run());
});

test('sandboxWinner meldet die letzte Fraktion einmal', () => {
  const w = createWorld(1400, 820, 3);
  spawn(w, 'wolf', 100, 100, 'blau'); const b = spawn(w, 'baer', 600, 100, 'rot');
  step(w, 1/60); assert.equal(sandboxWinner(w), null);
  b.alive = false; w.time = 10; step(w, 1/60);
  assert.equal(sandboxWinner(w), 'wolf'); assert.equal(sandboxWinner(w), null);
});

test('Pläne: 9 Missionen mit smart/spam, COUNTERS mit Punkten', () => {
  assert.equal(MISSION_PLANS.length, 9);
  for (const p of MISSION_PLANS) { assert.ok(p.smart.length && p.spam.length); }
  assert.ok(COUNTERS.length >= 20 && COUNTERS.every(c => c.length === 3 && c[2] >= 60));
  const w = createWorld(1400, 1050, 1); w.teamMode = true;
  assert.equal(placePlan(w, [['ritter', 9, .32, .3, .38, .7]]), 9 * 4.5);
  assert.equal(w.units.length, 9); assert.ok(w.units.every(u => u.team === 'blau'));
});
