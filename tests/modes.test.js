// Wellenmodus, Wochenchallenge, Erfolge und Wetter (25.11.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS } from '../game/js/data.js';
import { createWorld, rebuildHash, spawn } from '../game/js/world.js';
import { placeRect, step } from '../game/js/sim.js';
import { wavesLevel, spawnWave, waveResult, wavePoints, waveGain, cleanWaves, WAVES } from '../game/js/waves.js';
import { weeklyLevel, weekKey, placeWeekly, recordWeekly, cleanWeekly } from '../game/js/weekly.js';
import { emptyAch, cleanAch, bump, addType, addForm, unlocked, ACHIEVEMENTS } from '../game/js/achievements.js';
import { rangeAt, WEATHER } from '../game/js/combat.js';
import { igniteCell } from '../game/js/wildfire.js';
import { snapshotBattle, restoreBattle } from '../game/js/battle.js';
import { TERRAIN } from '../game/js/data.js';
import { parseSave, serializeSave } from '../game/js/save.js';

const armyPts = (w, team) => w.units.filter(u => u.alive && u.team === team).reduce((a, u) => a + UNITS[u.type].cost, 0);

test('Wellen: gleiche Saat gibt gleiche Wellen, die Gegner werden stärker, bis Welle 4 keine Bosse', () => {
  const def = wavesLevel(1234);
  const a = createWorld(1600, 900, 1), b = createWorld(1600, 900, 2);
  spawnWave(a, def, 3); spawnWave(b, def, 3);
  assert.deepEqual(a.units.map(u => u.type), b.units.map(u => u.type));
  for (let k = 1; k < 12; k++) assert.ok(wavePoints(k + 1) > wavePoints(k));
  for (let s = 0; s < 30; s++) {
    const w = createWorld(1600, 900, 1), d = wavesLevel(s);
    spawnWave(w, d, 4);
    assert.ok(w.units.every(u => u.T.cost <= 12 && u.x > 800));
    assert.ok(armyPts(w, 'rot') <= wavePoints(4) + 1e-9);
  }
  assert.ok(waveGain(2) > waveGain(1));
  assert.deepEqual(cleanWaves({ best: '7', runs: -3 }), { best: 7, runs: 0 });
});

test('Wellen: Ergebnis einer Welle', () => {
  const w = createWorld(1600, 900, 1);
  spawn(w, 'krieger', 100, 100, 'blau'); spawn(w, 'krieger', 1500, 100, 'rot');
  assert.equal(waveResult(w, 1), null);
  assert.equal(waveResult(w, WAVES.TIME + 1), 'clear');
  w.units[1].alive = false; assert.equal(waveResult(w, 1), 'clear');
  w.units[0].alive = false; assert.equal(waveResult(w, 1), 'lose');
});

test('Wochenchallenge: fest je Woche, Budget über den Gegnerpunkten, Bestwert = weniger Punkte', () => {
  assert.equal(weekKey(new Date(2026, 10, 25)), '2026-W48');
  assert.equal(weekKey(new Date(2027, 0, 1)), '2026-W53');
  assert.equal(weekKey(new Date(2027, 0, 4)), '2027-W01');
  const l = weeklyLevel('2026-W48'), l2 = weeklyLevel('2026-W48');
  assert.deepEqual(l, l2);
  assert.ok(l.budget > l.weekly.pts && l.par < l.weekly.pts);
  assert.ok(l.cats || l.units);
  const w = createWorld(1600, 900, 1); placeWeekly(w, l);
  assert.ok(w.units.length > 0 && w.units.every(u => u.team === 'rot'));
  const store = {};
  recordWeekly(store, l.weekly.key, { win: true, spent: 40, stars: 2 });
  recordWeekly(store, l.weekly.key, { win: true, spent: 50, stars: 1 });
  recordWeekly(store, l.weekly.key, { win: false, spent: 10, stars: 0 });
  assert.deepEqual(store[l.weekly.key], { spent: 40, stars: 2 });
  assert.deepEqual(Object.keys(cleanWeekly({ x: 1, '2026-W01': { spent: 3, stars: 9 } })), ['2026-W01']);
});

test('Erfolge: Fortschritt, Freischalten nur einmal, Spielstand', () => {
  const a = emptyAch();
  assert.deepEqual(unlocked(a, '2026-11-25'), []);
  bump(a, 'wins'); bump(a, 'painted', 999);
  assert.deepEqual(unlocked(a, '2026-11-25').map(x => x.id), ['sieg1']);
  bump(a, 'painted'); for (const f of ['keil', 'kreis', 'linie', 'keil']) addForm(a, f);
  assert.deepEqual(unlocked(a, '2026-11-26').map(x => x.id).sort(), ['formen', 'maler']);
  assert.deepEqual(unlocked(a, '2026-11-27'), []);
  for (const t of Object.keys(UNITS)) addType(a, t);
  assert.ok(unlocked(a, '2026-11-27').some(x => x.id === 'sammler'));
  const s = parseSave(null); s.ach = a;
  const back = parseSave(serializeSave(s)).ach;
  assert.deepEqual(back.got, a.got);
  assert.deepEqual(cleanAch({ n: { x: -1, y: 'a' }, got: { nope: '2026-01-01' } }), emptyAch());
  assert.ok(ACHIEVEMENTS.length >= 15);
});

test('Wetter: Nebel kürzt Fernkampf, Regen verhindert Waldbrand, Schnappschuss trägt das Wetter', () => {
  const w = createWorld(1600, 900, 1);
  const s = spawn(w, 'schuetze', 100, 100, 'blau'), k = spawn(w, 'krieger', 140, 100, 'blau');
  const r0 = rangeAt(w, s);
  w.weather = 'nebel';
  assert.equal(rangeAt(w, s), r0 * WEATHER.FOG);
  assert.equal(rangeAt(w, k), k.T.range);
  w.weather = 'regen';
  w.terr[0] = TERRAIN.wald.id;
  assert.equal(igniteCell(w, 0), false);
  w.weather = null;
  assert.equal(igniteCell(w, 0), true);
  w.weather = 'nebel';
  const snap = snapshotBattle(w), w2 = createWorld(1600, 900, 2);
  restoreBattle(w2, snap);
  assert.equal(w2.weather, 'nebel');
});
