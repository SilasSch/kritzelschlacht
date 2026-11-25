// Terrain-Update Stufe 2 (24.11.): Hügel. Fernkämpfer am Boden, die darauf stehen, schießen HILL.RANGE-mal so weit;
// Nahkämpfer, Flieger und Magier nicht. Bergauf Tempo 80 %.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, cellIndex } from '../game/js/world.js';
import { step, tRect } from '../game/js/sim.js';
import { TERRAIN, TERR_SPEED } from '../game/js/data.js';
import { rangeAt, HILL } from '../game/js/combat.js';

test('Hügel: id 9, malbar, Tempo 80 %', () => {
  assert.equal(TERRAIN.huegel.id, 9);
  assert.notEqual(TERRAIN.huegel.paint, false);
  assert.equal(TERR_SPEED[9], .8);
});

test('rangeAt: nur Fernkämpfer am Boden auf dem Hügel', () => {
  const w = createWorld(1600, 900, 1);
  tRect(w, 'huegel', .1, .1, .3, .9);
  const x = w.W * .2, y = w.H * .5;
  const s = spawn(w, 'schuetze', x, y, 'blau'), k = spawn(w, 'krieger', x, y, 'blau'),
    m = spawn(w, 'magier', x, y, 'blau'), a = spawn(w, 'adler', x, y, 'blau'), f = spawn(w, 'schuetze', w.W * .7, y, 'blau');
  assert.equal(w.terr[cellIndex(w, x, y)], 9);
  assert.equal(rangeAt(w, s), s.T.range * HILL.RANGE);
  assert.equal(rangeAt(w, k), k.T.range);
  assert.equal(rangeAt(w, m), m.T.range);
  assert.equal(rangeAt(w, a), a.T.range);
  assert.equal(rangeAt(w, f), f.T.range, 'ohne Hügel');
});

// Abstand beim ersten Pfeil des Schützen links (der rechte läuft heran, bis er selbst in Reichweite ist)
function firstShotGap(hill) {
  const w = createWorld(1600, 900, 1); w.teamMode = true;
  const y = w.H * .5, x0 = w.W * .3;
  if (hill) tRect(w, 'huegel', (x0 - 40) / w.W, .4, (x0 + 40) / w.W, .6);
  const a = spawn(w, 'schuetze', x0, y, 'blau'), b = spawn(w, 'schuetze', x0 + 270, y, 'rot');
  for (let i = 0; i < 180; i++) {
    step(w, 1 / 60); w.events.length = 0;
    if (w.proj.some(p => p.src === a)) return b.x - a.x;
  }
  return 0;
}

test('Schütze auf dem Hügel schießt schon über seine normale Reichweite hinaus', () => {
  const reach = 210 + 9 + 9, up = firstShotGap(true), flat = firstShotGap(false);
  assert.ok(up > reach + 2, `Hügel: erster Pfeil bei ${up | 0} px`);
  assert.ok(flat > 0 && flat <= reach, `eben: erster Pfeil bei ${flat | 0} px`);
});
