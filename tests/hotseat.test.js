// Hotseat-Versus (Audit 18.11.): game/js/hotseat.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../game/js/world.js';
import { UNITS } from '../game/js/data.js';
import { createStroke } from '../game/js/paint.js';
import { createHot, painter, hiddenTeam, hotPaint, finishSide, clearSide, HOT_DEFAULT, MSG_OTHER_SIDE } from '../game/js/hotseat.js';

const pts = (w, side) => w.units.filter(u => u.alive && u.team === side).reduce((a, u) => a + UNITS[u.type].cost, 0);

test('Hotseat: Budget 100/150/250, Standard 150', () => {
  assert.equal(createHot().budget, HOT_DEFAULT);
  assert.equal(createHot(250).budget, 250);
  assert.equal(createHot(999).budget, 150);
});

test('Hotseat: Blau malt links mit Budget, die rechte Hälfte ist gesperrt; dann Rot rechts, Blau versteckt', () => {
  const w = createWorld(1400, 875, 7); w.teamMode = true;
  const h = createHot(100);
  assert.equal(painter(h), 'blau'); assert.equal(hiddenTeam(h), null);
  // rechts: gesperrt mit Meldung
  const no = hotPaint(w, h, createStroke(0), 1000, 400, 60, 'krieger', true);
  assert.equal(no.blocked, true); assert.equal(no.warning, MSG_OTHER_SIDE('blau'));
  assert.equal(w.units.length, 0);
  // links: Krieger bis zum Budget (100 / 2 = 50)
  const s = createStroke(0);
  for (let k = 0; k < 30; k++) hotPaint(w, h, s, 200 + (k % 5) * 80, 150 + Math.floor(k / 5) * 100, 70, 'krieger', k === 0);
  assert.ok(h.spent.blau <= 100 + 1e-9 && h.spent.blau > 80, `spent ${h.spent.blau}`);
  assert.ok(Math.abs(pts(w, 'blau') - h.spent.blau) < 1e-9);
  assert.ok(w.units.every(u => u.team === 'blau' && u.x <= 700));
  // ein Strich, der links beginnt, malt nicht über die Mitte
  hotPaint(w, h, createStroke(h.spent.blau), 690, 700, 80, 'wolf', true);
  assert.ok(w.units.every(u => u.x <= 700));
  // Gelände kostet mit und bleibt auf der eigenen Hälfte
  const before = h.spent.blau;
  clearSide(w, h); assert.equal(h.spent.blau, 0); assert.equal(w.units.length, 0);
  hotPaint(w, h, createStroke(0), 690, 400, 40, 'mauer', true);
  assert.ok(h.spent.blau > 0 && h.spent.blau < before);
  for (let i = 0; i < w.terr.length; i++) if (w.terr[i]) assert.ok((i % w.GW) * 10 + 5 <= 700);
  hotPaint(w, h, createStroke(h.spent.blau), 200, 400, 50, 'ritter', true);
  // fertig: Deckkarte, dann Rot
  assert.equal(finishSide(w, h), null);
  assert.equal(h.step, 'coverRot'); assert.equal(painter(h), null); assert.equal(hiddenTeam(h), 'blau');
  assert.equal(hotPaint(w, h, createStroke(0), 1000, 400, 60, 'krieger', true).blocked, true, 'hinter der Deckkarte malt niemand');
  h.step = 'rot';
  assert.equal(painter(h), 'rot'); assert.equal(hiddenTeam(h), 'blau');
  assert.equal(hotPaint(w, h, createStroke(0), 300, 400, 60, 'krieger', true).blocked, true);
  assert.match(finishSide(w, h), /Rot/, 'ohne Armee nicht fertig');
  hotPaint(w, h, createStroke(0), 1000, 400, 60, 'schuetze', true);
  assert.ok(w.units.some(u => u.team === 'rot') && w.units.filter(u => u.team === 'rot').every(u => u.x >= 700));
  assert.ok(Math.abs(pts(w, 'rot') - h.spent.rot) < 1e-9);
  // Rot radiert nicht auf Blaus Seite und keine blauen Einheiten
  const blue = w.units.filter(u => u.alive && u.team === 'blau').length;
  hotPaint(w, h, createStroke(h.spent.rot), 720, 400, 150, 'radierer', true);
  assert.equal(w.units.filter(u => u.alive && u.team === 'blau').length, blue);
  assert.equal(finishSide(w, h), null);
  assert.equal(h.step, 'coverGo'); assert.equal(hiddenTeam(h), null);
});
