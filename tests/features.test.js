// Audit 18.11.: Kritzel-Formen, Niederlage-Hinweis, Medaillen, Teilen per Code
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyStroke, applyShape, SHAPES } from '../game/js/shapes.js';
import { defeatHint, countersOf } from '../game/js/hints.js';
import { earnedMedals, medalCount, MEDALS } from '../game/js/medals.js';
import { encode, decode, battleData, applyBattle } from '../game/js/share.js';
import { createWorld, spawn, rebuildHash } from '../game/js/world.js';
import { placeRect, tCircle, step } from '../game/js/sim.js';
import { snapshotBattle, restoreBattle } from '../game/js/battle.js';
import { hurt } from '../game/js/combat.js';
import { levelById } from '../game/js/campaign/index.js';

const line = (x0, y0, x1, y1, n = 20) => Array.from({ length: n + 1 }, (_, i) => [x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]);
const circle = (cx, cy, r, n = 40) => Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos(i / n * 2 * Math.PI) * r, cy + Math.sin(i / n * 2 * Math.PI) * r]);

test('Formen: Linie, Kreis, Keil (Spitze zum Gegner), Klecks', () => {
  assert.equal(classifyStroke(line(100, 100, 100, 500), 40), 'linie');
  assert.equal(classifyStroke(circle(300, 300, 120), 40), 'kreis');
  const wedge = [...line(100, 100, 300, 300), ...line(300, 300, 100, 500).slice(1)];
  assert.equal(classifyStroke(wedge, 40, 1), 'keil', 'Spitze rechts, Gegner rechts');
  assert.notEqual(classifyStroke(wedge, 40, -1), 'keil', 'Spitze vom Gegner weg');
  assert.equal(classifyStroke(line(100, 100, 130, 110), 40), null, 'zu kurz');
  assert.equal(classifyStroke(null, 40), null);
});

test('Formen: Wirkung auf die Einheit, und sie überstehen Schnappschuss und Wiederherstellen', () => {
  const w = createWorld(1400, 820, 1); w.teamMode = true;
  const a = spawn(w, 'krieger', 200, 200, 'blau'), b = spawn(w, 'krieger', 200, 260, 'blau'), c = spawn(w, 'krieger', 200, 320, 'blau');
  applyShape(a, 'linie'); applyShape(b, 'kreis'); applyShape(c, 'keil');
  assert.equal(a.hp, a.T.hp * SHAPES.linie.hp);
  assert.equal(b.armor, SHAPES.kreis.armor);
  assert.equal(c.spdMul, SHAPES.keil.spdMul); assert.equal(c.buffT, SHAPES.keil.buffT);
  const h0 = b.hp; hurt(w, b, 10, 'melee', null); assert.ok(Math.abs(h0 - b.hp - 10 * SHAPES.kreis.armor) < 1e-9);
  const snap = snapshotBattle(w); restoreBattle(w, snap);
  const [a2, b2, c2] = w.units;
  assert.equal(a2.hp, a.T.hp * SHAPES.linie.hp, 'Leben aus dem Schnappschuss, nicht doppelt');
  assert.equal(b2.armor, SHAPES.kreis.armor); assert.equal(c2.shape, 'keil');
});

test('Niederlage-Hinweis nennt den Hauptverursacher und erlaubte Konter', () => {
  const lvl = levelById('ga-2');
  const h = defeatHint({ killers: new Map([['schuetze', 14], ['krieger', 3]]), level: lvl });
  assert.equal(h.killer, 'schuetze');
  assert.ok(h.counters.length > 0 && h.counters.every(t => countersOf('schuetze', lvl).includes(t)));
  assert.match(h.text, /Schützen \(14 von 17\)/);
  assert.match(defeatHint({ killers: new Map(), level: lvl, timeUp: true }).text, /Zeit/);
  assert.equal(defeatHint({ killers: new Map(), level: lvl }), null);
});

test('Medaillen', () => {
  assert.equal(MEDALS.length, 3);
  assert.equal(earnedMedals({ win: false, lost: 0, deployed: 10, time: 10, types: 1 }), 0);
  assert.equal(medalCount(earnedMedals({ win: true, lost: 1, deployed: 10, time: 30, types: 2 })), 3);
  assert.equal(earnedMedals({ win: true, lost: 5, deployed: 10, time: 90, types: 4 }), 0);
});

test('Teilen: Schlacht als Code und zurück, auf anderer Weltgröße', async () => {
  const w = createWorld(1400, 820, 2); w.teamMode = true;
  tCircle(w, 'wasser', .5, .5, .1);
  placeRect(w, 'ritter', 12, .1, .3, .2, .7, 'blau'); placeRect(w, 'schuetze', 9, .8, .3, .9, .7, 'rot');
  applyShape(w.units[0], 'kreis');
  const code = await encode(battleData(w));
  assert.match(code, /^KS[01]\./);
  const d = await decode(`  ${code}\n`);
  const v = createWorld(2000, 900, 3); v.teamMode = true;
  applyBattle(v, d);
  assert.equal(v.units.filter(u => u.team === 'blau').length, 12);
  assert.equal(v.units.filter(u => u.team === 'rot').length, 9);
  assert.equal(v.units[0].armor, SHAPES.kreis.armor);
  const water = n => [...n.terr].filter(x => x === 1).length / n.terr.length;
  assert.ok(Math.abs(water(v) - water(w)) < .01, 'gleicher Anteil Wasser');
  await assert.rejects(decode('hallo'), /kein Kritzelschlacht-Code/);
  await assert.rejects(decode(code.slice(0, 20)), /beschädigt|passt nicht/);
});
