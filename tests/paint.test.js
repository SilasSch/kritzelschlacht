import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, setCell, cellIndex, rebuildHash } from '../game/js/world.js';
import { createStroke, stamp, paintTerrain, undo, UNIT_CAP, zoneX } from '../game/js/paint.js';
import { UNITS, TERRAIN } from '../game/js/data.js';

const alive = w => w.units.filter(u => u.alive);
const mkMission = (budget) => ({ budget, spent: 0 });

test('stamp: Sandkasten füllt den Pinselkreis ohne Überlappung', () => {
  const w = createWorld(1400, 800, 3);
  const s = createStroke(0);
  const r = stamp(w, s, 400, 400, 60, 'krieger', 'gruen', null, null);
  assert.ok(r.placed > 3, 'placed ' + r.placed);
  assert.equal(r.warning, null);
  assert.equal(s.units.length, r.placed);
  const us = alive(w);
  for (const u of us) { assert.equal(u.team, 'gruen'); assert.ok(Math.hypot(u.x - 400, u.y - 400) <= 60 + 1e-9); }
  const minD = UNITS.krieger.r * 2.05;
  for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++)
    assert.ok(Math.hypot(us[i].x - us[j].x, us[i].y - us[j].y) >= minD - 1e-9);
});

test('stamp: Mission stoppt am Budget und warnt nur einmal pro Strich', () => {
  const w = createWorld(1400, 800, 3);
  const m = mkMission(5);
  const s = createStroke(m.spent);
  const r1 = stamp(w, s, 200, 400, 120, 'krieger', 'gruen', m, 'plan');
  assert.equal(r1.placed, 2);
  assert.equal(m.spent, 4);
  assert.equal(r1.warning, 'Budget aufgebraucht.');
  for (const u of alive(w)) assert.equal(u.team, 'blau', 'Mission malt immer für Blau');
  const r2 = stamp(w, s, 250, 300, 120, 'krieger', 'gruen', m, 'plan');
  assert.equal(r2.placed, 0);
  assert.equal(r2.warning, null, 'zweite Warnung im selben Strich unterdrückt');
  const s2 = createStroke(m.spent);
  assert.equal(stamp(w, s2, 250, 300, 120, 'krieger', 'blau', m, 'plan').warning, 'Budget aufgebraucht.');
});

test('stamp: Mission nur links der Zone und nur in der Planphase', () => {
  const w = createWorld(1400, 800, 3);
  const m = mkMission(500);
  const right = stamp(w, createStroke(0), 1400 * .8, 400, 60, 'krieger', 'blau', m, 'plan');
  assert.equal(right.placed, 0);
  const battle = stamp(w, createStroke(0), 200, 400, 60, 'krieger', 'blau', m, 'battle');
  assert.equal(battle.placed, 0);
  const edge = stamp(w, createStroke(0), zoneX(w), 400, 80, 'krieger', 'blau', m, 'plan');
  assert.ok(edge.placed > 0);
  for (const u of alive(w)) assert.ok(u.x <= zoneX(w));
  assert.equal(m.spent, edge.placed * UNITS.krieger.cost);
});

test('stamp: keine Bodentruppen auf Mauerfeldern, Flieger schon', () => {
  const w = createWorld(400, 400, 3);
  for (let i = 0; i < w.terr.length; i++) setCell(w, i, 4, 0);
  assert.equal(stamp(w, createStroke(0), 200, 200, 80, 'krieger', 'blau', null, null).placed, 0);
  assert.ok(stamp(w, createStroke(0), 200, 200, 80, 'biene', 'blau', null, null).placed > 0);
});

test('stamp: Obergrenze von Einheiten', () => {
  const w = createWorld(1400, 800, 3);
  for (let i = 0; i <= UNIT_CAP; i++) spawn(w, 'biene', 700, 400, 'rot');
  const r = stamp(w, createStroke(0), 200, 200, 80, 'krieger', 'blau', null, null);
  assert.equal(r.placed, 0);
  assert.equal(r.warning, 'Das Schlachtfeld ist voll.');
});

test('paintTerrain: Sandkasten malt Gelände, Mauern mit 140 LP', () => {
  const w = createWorld(400, 400, 3);
  const r = paintTerrain(w, createStroke(0), 200, 200, 30, 'mauer', null, null);
  assert.ok(r.changed);
  const i = cellIndex(w, 200, 200);
  assert.equal(w.terr[i], 4); assert.equal(w.whp[i], 140); assert.equal(w.towner[i], 0);
  assert.ok(r.cells.gx0 <= 19 && r.cells.gx1 >= 20 && r.cells.gy0 <= 19 && r.cells.gy1 >= 20);
});

test('paintTerrain: Mission kostet, erstattet und schützt Feindgelände', () => {
  const w = createWorld(1400, 800, 3);
  const enemy = cellIndex(w, 205, 205);
  setCell(w, enemy, 1, 0); // Wasser der Mission
  const m = mkMission(100);
  const s = createStroke(0);
  paintTerrain(w, s, 200, 200, 30, 'lava', m, 'plan');
  assert.equal(w.terr[enemy], 1, 'Gelände der Mission bleibt');
  const own = cellIndex(w, 185, 200);
  assert.equal(w.terr[own], 2); assert.equal(w.towner[own], 1);
  const n = [...w.terr].filter(t => t === 2).length;
  assert.ok(Math.abs(m.spent - n * TERRAIN.lava.cost) < 1e-9);
  paintTerrain(w, s, 200, 200, 30, 'wald', m, 'plan');
  const nw = [...w.terr].filter(t => t === 3).length;
  assert.equal(nw, n);
  assert.ok(Math.abs(m.spent - nw * TERRAIN.wald.cost) < 1e-9, 'Lava erstattet, Wald bezahlt');
  // Budget für Gelände
  const m2 = mkMission(0.5);
  const r = paintTerrain(w, createStroke(0), 400, 300, 40, 'mauer', m2, 'plan');
  assert.equal(r.warning, 'Budget aufgebraucht.');
  assert.ok(m2.spent <= 0.5 + 1e-9);
});

test('Radierer: entfernt Einheiten, in Missionen nur eigene mit Erstattung', () => {
  const w = createWorld(1400, 800, 3);
  const m = mkMission(100);
  stamp(w, createStroke(0), 200, 400, 50, 'krieger', 'blau', m, 'plan');
  const mine = alive(w).length;
  assert.ok(mine > 0);
  const red = spawn(w, 'krieger', 210, 400, 'rot');
  const r = paintTerrain(w, createStroke(m.spent), 200, 400, 70, 'radierer', m, 'plan');
  assert.ok(r.changed);
  assert.ok(red.alive, 'Gegner bleibt');
  assert.equal(alive(w).filter(u => u.team === 'blau').length, 0);
  assert.ok(Math.abs(m.spent) < 1e-9, 'Kosten erstattet: ' + m.spent);
  // Sandkasten: alles weg
  const w2 = createWorld(800, 800, 3);
  spawn(w2, 'krieger', 300, 300, 'rot'); spawn(w2, 'wolf', 310, 300, 'blau'); spawn(w2, 'wolf', 600, 600, 'blau');
  paintTerrain(w2, createStroke(0), 300, 300, 40, 'radierer', null, null);
  assert.equal(alive(w2).length, 1);
});

test('undo: stellt Einheiten, Felder und Ausgaben wieder her', () => {
  const w = createWorld(1400, 800, 3);
  const m = mkMission(200);
  const before = spawn(w, 'ritter', 150, 150, 'blau'); m.spent = 4.5;
  const c0 = cellIndex(w, 150, 300); setCell(w, c0, 4, 1); w.whp[c0] = 33;
  rebuildHash(w);
  const s = createStroke(m.spent);
  stamp(w, s, 250, 450, 50, 'krieger', 'blau', m, 'plan');
  paintTerrain(w, s, 150, 300, 25, 'wasser', m, 'plan');
  paintTerrain(w, s, 150, 150, 20, 'radierer', m, 'plan');
  assert.ok(!before.alive);
  assert.equal(w.terr[c0], 1);
  assert.ok(s.units.length > 0);
  const spent = undo(w, s);
  assert.equal(spent, 4.5);
  for (const u of s.units) assert.ok(!u.alive);
  assert.equal(w.terr[c0], 4); assert.equal(w.towner[c0], 1); assert.equal(w.whp[c0], 33);
  assert.equal([...w.terr].filter(t => t === 1).length, 0);
  const back = alive(w);
  assert.equal(back.length, 1);
  assert.equal(back[0].type, 'ritter'); assert.equal(back[0].x, 150); assert.equal(back[0].team, 'blau');
});

test('paintTerrain: eigenes Gelände ersetzen am Budgetlimit erstattet nicht doppelt', () => {
  const run = (budget) => {
    const w = createWorld(400, 400, 3);
    const cells = [cellIndex(w, 105, 105), cellIndex(w, 115, 105), cellIndex(w, 105, 115), cellIndex(w, 115, 115)];
    for (const i of cells) setCell(w, i, 1, 1); // 4 eigene Wasserfelder
    const m = { budget, spent: 4 * TERRAIN.wasser.cost };
    const s = createStroke(m.spent);
    for (let k = 0; k < 5; k++) paintTerrain(w, s, 110, 110, 12, 'mauer', m, 'plan');
    const walls = cells.filter(i => w.terr[i] === 4).length, water = cells.filter(i => w.terr[i] === 1).length;
    assert.equal(walls + water, 4);
    assert.ok(Math.abs(m.spent - (walls * TERRAIN.mauer.cost + water * TERRAIN.wasser.cost)) < 1e-9, `spent ${m.spent} walls ${walls}`);
    assert.ok(m.spent <= budget + 1e-6);
    return { walls, water, spent: m.spent };
  };
  const a = run(0.16);
  assert.equal(a.walls, 0); assert.ok(Math.abs(a.spent - 0.16) < 1e-9);
  const b = run(0.22);
  assert.equal(b.walls, 1); assert.equal(b.water, 3);
});
