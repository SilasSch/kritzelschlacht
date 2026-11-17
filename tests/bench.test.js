// Leistung (Task 13): Szenen für tools/bench.mjs und ?bench, feste Form der Einheiten.
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS } from '../game/js/data.js';
import { createWorld, spawn } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import {
  buildBench, benchMixed, BENCH_W, BENCH_H, BENCH_TEAMS, BENCH_BOSSES, CROWD_N, CROWD_R, VOLLEY_N, BLAST_EVERY, VOLLEY_AT,
  MIXED_TYPES, mixed2Types,
} from '../game/js/bench.js';

const DT = 1 / 60;

test('mixed: N Einheiten in 4 Teams, alle Typen von MIXED_TYPES, Bosse je Team, Mauern und Lava', () => {
  const w = createWorld(BENCH_W, BENCH_H, 1);
  benchMixed(w, 2000);
  assert.equal(w.units.length, 2000);
  assert.equal(w.teamMode, true);
  const byTeam = {}, types = new Set();
  for (const u of w.units) { byTeam[u.team] = (byTeam[u.team] || 0) + 1; types.add(u.type); }
  assert.deepEqual(Object.keys(byTeam).sort(), [...BENCH_TEAMS].sort());
  for (const t of BENCH_TEAMS) assert.equal(byTeam[t], 500);
  // festgehalten (Vorgabe 4): keine neuen Typen in mixed, damit die Grenze < 2,0 ms vergleichbar bleibt
  assert.deepEqual([...types].sort(), [...MIXED_TYPES].sort());
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

test('blastcrowd: 500 Bienen im Radius 80, alle BLAST_EVERY Schritte 20 Einschläge im selben Schritt, dazwischen Auffüllen', () => {
  const w = createWorld(BENCH_W, BENCH_H, 1);
  const tick = buildBench(w, 'blastcrowd');
  const bees = w.units.filter(u => u.type === 'biene');
  assert.equal(bees.length, CROWD_N);
  for (const b of bees) assert.ok(Math.hypot(b.x - w.W / 2, b.y - w.H / 2) <= CROWD_R + 1e-6);
  for (let k = 0; k < VOLLEY_AT; k++) { assert.equal(tick(k), false); step(w, DT); w.events.length = 0; }
  assert.equal(tick(VOLLEY_AT), 'volley');
  assert.equal(w.proj.filter(p => p.kind === 'mortar').length, VOLLEY_N);
  step(w, DT);
  assert.equal(w.events.filter(e => e.type === 'blast').length, VOLLEY_N);
  assert.equal(w.proj.filter(p => p.kind === 'mortar').length, 0);
  assert.ok(w.units.filter(u => u.alive && u.type === 'biene').length < CROWD_N / 2, 'Salve trifft den Schwarm');
  w.events.length = 0;
  for (let k = VOLLEY_AT + 1; k < BLAST_EVERY; k++) assert.equal(tick(k), false);
  assert.equal(tick(BLAST_EVERY), 'fill');   // füllt wieder auf 500 auf
  assert.equal(w.units.filter(u => u.alive && u.type === 'biene').length, CROWD_N);
  assert.equal(tick(BLAST_EVERY + VOLLEY_AT), 'volley');
});

test('mixed2: alle malbaren Typen (auch die neuen), nie die nicht malbaren', () => {
  const w = createWorld(BENCH_W, BENCH_H, 1);
  buildBench(w, 'mixed2', 2000);
  const types = new Set(w.units.map(u => u.type));
  assert.deepEqual([...types].sort(), mixed2Types().sort());
  assert.ok(types.has('vampir') && !types.has('ghul'));
  for (const k of Object.keys(UNITS)) assert.equal(types.has(k), UNITS[k].paint !== false, k);
  assert.ok(MIXED_TYPES.every(k => UNITS[k].paint !== false));
});

// Leistung: Felder, die erst im Spiel gesetzt werden, legt spawn schon an. So teilen alle Einheiten eine
// Form (Hidden Class) und die Zugriffe bleiben monomorph (Task 13: Schritt 6,5 → 2,4 ms bei 2000 Einheiten).
test('Einheiten behalten ihre Form: kein Feld kommt nach spawn dazu', () => {
  const keys = Object.keys(spawn(createWorld(400, 300, 1), 'krieger', 50, 50, 'blau')).join();
  const w = createWorld(BENCH_W, BENCH_H, 2); buildBench(w, 'mixed', 600);
  let blocks = 0;
  for (let k = 0; k < 240; k++) { step(w, DT); w.events.length = 0; blocks += w.formations.length; }
  const bad = w.units.filter(u => Object.keys(u).join() !== keys).map(u => u.type);
  assert.deepEqual(bad, []);
  // mit Sanitätern, Flank-Treffern, Abheben und Landen kam in 4 s alles vor
  assert.ok(w.units.some(u => u.fx !== 0) && w.units.some(u => !Number.isNaN(u.px)));
  // Römer standen im Block (formation.js setzt form, formOn, Plätze und Blickrichtung)
  assert.ok(blocks > 0 && w.units.some(u => u.type === 'roemer' && u.form > 0 && u.slotX !== 0), 'Römerblöcke');
  assert.ok(w.units.every(u => typeof u.abOn === 'boolean'), 'abOn');
  // Zahlenfelder bleiben Zahlen (V8 führt sie als Double, Schreiben legt keine HeapNumbers an)
  for (const k of ['px', 'py', 'fx', 'fy', 'x', 'y', 'mx', 'my', 'vx', 'vy', 'cd', 'rt', 'form', 'slotX', 'slotY', 'formAx', 'formAy', 'formVx', 'formVy', 'formSp', 'pilum', 'abCd', 'abT', 'abK', 'abX', 'abY', 'fearT']) assert.ok(w.units.every(u => typeof u[k] === 'number'), k);
});

// Vampir und Ghul (Spez. #32): Ghule entstehen mitten in der Schlacht über spawn, die Fledermausform tauscht nur u.T
// (data.BAT_FORM, gleiche Schlüssel): beides ändert die Form der Einheiten nicht.
test('mixed2: Ghule und Fledermausform behalten die Form der Einheiten', () => {
  const keys = Object.keys(spawn(createWorld(400, 300, 1), 'krieger', 50, 50, 'blau')).join();
  const w = createWorld(BENCH_W, BENCH_H, 2); buildBench(w, 'mixed2', 600);
  let bats = 0;
  for (let k = 0; k < 600; k++) { step(w, DT); w.events.length = 0; for (const u of w.units) if (u.alive && u.batT > 0) bats++; }
  assert.deepEqual(w.units.filter(u => Object.keys(u).join() !== keys).map(u => u.type), []);
  assert.ok(w.units.some(u => u.type === 'ghul'), 'Ghule entstanden');
  assert.ok(bats > 0, 'Fledermausform kam vor');
  assert.ok(Object.keys(UNITS.vampir).join() === Object.keys(w.units.find(u => u.type === 'vampir').T).join());
  for (const k of ['batT', 'riseT', 'ghouls']) assert.ok(w.units.every(u => typeof u[k] === 'number'), k);
});
