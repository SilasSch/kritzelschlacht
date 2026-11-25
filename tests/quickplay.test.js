// Schnelle Schlacht, Armee-Vorlagen und Gegner-Vorstellung (25.11.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS } from '../game/js/data.js';
import { createWorld, rebuildHash } from '../game/js/world.js';
import { placeRect } from '../game/js/sim.js';
import { quickPlan, placeQuick, planCost } from '../game/js/quick.js';
import { makeTemplate, cleanTemplates, applyTemplate, TEMPLATE_MAX } from '../game/js/templates.js';
import { introCam, armySummary, armyCenter, INTRO } from '../game/js/intro.js';
import { createCamera } from '../game/js/camera.js';
import { parseSave, serializeSave } from '../game/js/save.js';

const seeded = s => () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);

test('quickPlan: hält das Budget, nur malbare Einheiten, Rot rechts und Blau links', () => {
  for (let i = 0; i < 200; i++) {
    const budget = 10 + i * 3, rand = seeded(i + 1);
    const p = quickPlan(budget, rand);
    assert.ok(p.length >= 1);
    assert.ok(planCost(p) <= budget + 1e-9, `${planCost(p)} > ${budget}`);
    for (const e of p) { assert.notEqual(UNITS[e.type].paint, false); assert.ok(e.x0 >= .5 && e.x1 <= 1 && e.y1 <= 1); }
    for (const e of quickPlan(budget, seeded(i + 1), 'blau')) assert.ok(e.x1 <= .5);
  }
});

test('quickPlan nutzt das Budget weitgehend aus', () => {
  let sum = 0;
  for (let i = 0; i < 100; i++) sum += planCost(quickPlan(60, seeded(i + 7))) / 60;
  assert.ok(sum / 100 > .85, `nur ${sum}%`);
});

test('placeQuick: keine Bodentruppen auf Lava oder Mauer', () => {
  const w = createWorld(1600, 900, 3);
  w.terr.fill(2);
  placeQuick(w, [{ type: 'krieger', n: 10, x0: .6, y0: .2, x1: .7, y1: .5 }, { type: 'biene', n: 5, x0: .6, y0: .2, x1: .7, y1: .5 }], 'rot');
  assert.equal(w.units.filter(u => u.type === 'krieger').length, 0);
  assert.equal(w.units.filter(u => u.type === 'biene').length, 5);
});

test('Vorlagen: speichern, säubern, im Budget und nur erlaubte Einheiten laden', () => {
  const w = createWorld(1600, 900, 1);
  placeRect(w, 'ritter', 10, .05, .2, .2, .6, 'blau');
  placeRect(w, 'krieger', 10, .05, .6, .2, .8, 'blau');
  placeRect(w, 'krieger', 10, .7, .2, .8, .6, 'rot');
  const t = makeTemplate(w.units, 'blau', 800, 900, 'Test');
  assert.equal(t.u.length, 20);
  assert.equal(t.pts, 10 * UNITS.ritter.cost + 10 * UNITS.krieger.cost);
  const w2 = createWorld(1600, 900, 2);
  const r = applyTemplate(w2, t, { team: 'blau', xMax: 600, budget: 20, allowed: k => k === 'krieger' });
  assert.equal(r.skipped.type, 10);
  assert.equal(r.placed, 10);
  assert.ok(r.spent <= 20);
  assert.ok(w2.units.every(u => u.x <= 600));
  const junk = cleanTemplates([null, { u: [['nope', .1, .1]] }, { n: 'x', u: [['krieger', 2, .1], ['krieger', .1, .1]] }, ...Array(20).fill(t)]);
  assert.equal(junk.length, TEMPLATE_MAX);
  assert.equal(junk[0].u.length, 1);
});

test('Vorlagen überleben Speichern und Laden des Spielstands', () => {
  const w = createWorld(1600, 900, 1);
  placeRect(w, 'schuetze', 4, .05, .2, .2, .6, 'blau');
  const s = parseSave(null);
  s.armies = [makeTemplate(w.units, 'blau', 800, 900, 'A')];
  const back = parseSave(serializeSave(s));
  assert.equal(back.armies.length, 1);
  assert.equal(back.armies[0].u.length, 4);
  assert.equal(parseSave(serializeSave(parseSave(null))).armies.length, 0);
});

test('Gegner vorstellen: Kamera fährt heran und endet auf dem ganzen Feld', () => {
  const w = createWorld(1600, 900, 1);
  placeRect(w, 'krieger', 6, .8, .2, .9, .4, 'rot');
  rebuildHash(w);
  const c = armyCenter(w.units, 'rot');
  assert.ok(c.x > 1200);
  const cam = createCamera(1280, 720, 1600, 900);
  assert.equal(introCam(cam, c, 0), true);
  assert.ok(cam.zoom > cam.fit * 1.5);
  assert.equal(introCam(cam, c, INTRO.HOLD + INTRO.OUT + .1), false);
  assert.ok(Math.abs(cam.zoom - cam.fit) < 1e-9);
  assert.deepEqual(armySummary(w.units, 'rot'), [['krieger', 6]]);
});
