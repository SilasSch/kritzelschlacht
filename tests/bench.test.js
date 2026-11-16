// Leistung (Task 13): Szenen für tools/bench.mjs und ?bench, feste Form der Einheiten.
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS } from '../game/js/data.js';
import { createWorld, spawn } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import {
  buildBench, benchMixed, BENCH_W, BENCH_H, BENCH_TEAMS, BENCH_BOSSES, CROWD_N, CROWD_R, VOLLEY_N, BLAST_EVERY,
} from '../game/js/bench.js';

const DT = 1 / 60;

test('mixed: N Einheiten in 4 Teams, alle Typen, Bosse je Team, Mauern und Lava', () => {
  const w = createWorld(BENCH_W, BENCH_H, 1);
  benchMixed(w, 2000);
  assert.equal(w.units.length, 2000);
  assert.equal(w.teamMode, true);
  const byTeam = {}, types = new Set();
  for (const u of w.units) { byTeam[u.team] = (byTeam[u.team] || 0) + 1; types.add(u.type); }
  assert.deepEqual(Object.keys(byTeam).sort(), [...BENCH_TEAMS].sort());
  for (const t of BENCH_TEAMS) assert.equal(byTeam[t], 500);
  assert.deepEqual([...types].sort(), Object.keys(UNITS).sort());
  for (const t of BENCH_TEAMS) for (const k in BENCH_BOSSES)
    assert.equal(w.units.filter(u => u.team === t && u.type === k).length, BENCH_BOSSES[k], `${t} ${k}`);
  assert.ok(w.units.filter(u => u.type === 'moerser').length >= 100 && w.units.filter(u => u.type === 'grenadier').length >= 100);
  assert.ok(w.terr.some(v => v === 4), 'Mauern'); assert.ok(w.terr.some(v => v === 2), 'Lava');
  // ungerade Anzahl: der Rest landet im letzten Team
  const w2 = createWorld(BENCH_W, BENCH_H, 1); benchMixed(w2, 1003);
  assert.equal(w2.units.length, 1003);
});

test('mixed: gleiche Saat, gleicher Aufbau und gleicher Verlauf', () => {
  const run = () => {
    const w = createWorld(BENCH_W, BENCH_H, 5); buildBench(w, 'mixed', 400);
    for (let k = 0; k < 120; k++) { step(w, DT); w.events.length = 0; }
    return w.units.map(u => `${u.type}${u.x.toFixed(3)},${u.y.toFixed(3)},${u.hp.toFixed(2)}`).join('|');
  };
  assert.equal(run(), run());
});

test('blastcrowd: 500 Bienen im Radius 80, alle BLAST_EVERY Schritte 20 Einschläge im selben Schritt', () => {
  const w = createWorld(BENCH_W, BENCH_H, 1);
  const tick = buildBench(w, 'blastcrowd');
  const bees = w.units.filter(u => u.type === 'biene');
  assert.equal(bees.length, CROWD_N);
  for (const b of bees) assert.ok(Math.hypot(b.x - w.W / 2, b.y - w.H / 2) <= CROWD_R + 1e-6);
  assert.equal(tick(0), true);
  assert.equal(w.proj.filter(p => p.kind === 'mortar').length, VOLLEY_N);
  step(w, DT);
  assert.equal(w.events.filter(e => e.type === 'blast').length, VOLLEY_N);
  assert.equal(w.proj.filter(p => p.kind === 'mortar').length, 0);
  assert.ok(w.units.filter(u => u.alive && u.type === 'biene').length < CROWD_N / 2, 'Salve trifft den Schwarm');
  w.events.length = 0;
  for (let k = 1; k < BLAST_EVERY; k++) assert.equal(tick(k), false);
  assert.equal(tick(BLAST_EVERY), true);   // füllt wieder auf 500 auf
  assert.equal(w.units.filter(u => u.alive && u.type === 'biene').length, CROWD_N);
});

// Leistung: Felder, die erst im Spiel gesetzt werden, legt spawn schon an. So teilen alle Einheiten eine
// Form (Hidden Class) und die Zugriffe bleiben monomorph (Task 13: Schritt 6,5 → 2,4 ms bei 2000 Einheiten).
test('Einheiten behalten ihre Form: kein Feld kommt nach spawn dazu', () => {
  const keys = Object.keys(spawn(createWorld(400, 300, 1), 'krieger', 50, 50, 'blau')).join();
  const w = createWorld(BENCH_W, BENCH_H, 2); buildBench(w, 'mixed', 600);
  for (let k = 0; k < 240; k++) { step(w, DT); w.events.length = 0; }
  const bad = w.units.filter(u => Object.keys(u).join() !== keys).map(u => u.type);
  assert.deepEqual(bad, []);
  // mit Sanitätern, Flank-Treffern, Abheben und Landen kam in 4 s alles vor
  assert.ok(w.units.some(u => u.fx !== undefined) && w.units.some(u => u.px !== undefined));
});
