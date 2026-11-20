// Terrain-Update 1a (Wunsch Silas 20.11.): Deckung im Wald sichtbar. Fernkampftreffer und Explosionen auf Bodeneinheiten
// im Wald lassen Blätter fliegen (fxcore 'leaf'); außerhalb des Walds, in der Luft und im Nahkampf nicht.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFxCore, look } from '../game/js/render/fxcore.js';
import { createWorld } from '../game/js/world.js';
import { tRect } from '../game/js/sim.js';

const leaves = core => core.store.countByKind().leaf || 0;
function setup() {
  const w = createWorld(1600, 900, 1); tRect(w, 'wald', .4, .3, .6, .7);
  const core = createFxCore({ decal() {}, crater() {} });
  core.update(1 / 60, w);   // die Welt (Gelände) kennt das Modul aus update
  return { w, core };
}

test('Treffer im Wald: Blätter fliegen bei Kugeln und Pfeilen, nicht bei Nahkampf', () => {
  const { w, core } = setup(), x = w.W * .5, y = w.H * .5;
  core.consume([{ type: 'hit', x, y, z: 0, flank: false, kind: 'melee' }]);
  assert.equal(leaves(core), 0, 'Nahkampf: keine Deckung');
  core.consume([{ type: 'hit', x, y, z: 0, flank: false, kind: 'bullet', a: 0 }]);
  const n = leaves(core); assert.ok(n >= 3, `Kugel: ${n} Blätter`);
  core.consume([{ type: 'hit', x, y, z: 0, flank: false, kind: 'arrow' }]);
  assert.ok(leaves(core) > n, 'Pfeil: mehr Blätter');
});

test('Keine Blätter außerhalb des Walds oder in der Luft; Explosion im Wald schon', () => {
  const { w, core } = setup();
  core.consume([{ type: 'hit', x: w.W * .1, y: w.H * .5, z: 0, kind: 'bullet', a: 0 }]);
  core.consume([{ type: 'hit', x: w.W * .5, y: w.H * .5, z: 40, kind: 'bullet', a: 0 }]);
  assert.equal(leaves(core), 0);
  core.consume([{ type: 'blast', x: w.W * .5, y: w.H * .5, R: 40, kind: 'blast' }]);
  assert.ok(leaves(core) >= 6, 'Explosion mitten im Wald');
});

test('Blatt: flache Scheibe, die trudelt und am Ende ausblendet', () => {
  const { w, core } = setup();
  core.consume([{ type: 'hit', x: w.W * .5, y: w.H * .5, z: 0, kind: 'bullet', a: 0 }]);
  const p = core.store.live.find(q => q.k === 'leaf');
  assert.ok(p && p.vrot !== 0 && p.ay > 0);
  const o = {}; look(p, o); assert.equal(o.sy, .45); assert.equal(o.alpha, 1);
  p.age = p.life * .9; look(p, o); assert.ok(o.alpha > 0 && o.alpha < 1);
});

// Terrain-Update Stufe 2 (20.11.): Geröll aus zerschlagenen Mauern, Krater aus Explosionen; beide geben Deckung ×¾.
import { TERRAIN, TERR_SPEED } from '../game/js/data.js';
import { hitWall, blast, hurt, CRATER, RUBBLE_COVER } from '../game/js/combat.js';
import { spawn } from '../game/js/world.js';
import { cellIndex } from '../game/js/world.js';

test('Zerschlagene Mauer bleibt als Geröll liegen: 70 % Tempo, nicht malbar', () => {
  const w = createWorld(1600, 900, 2); tRect(w, 'mauer', .5, .5, .51, .52);
  const i = w.terr.indexOf(TERRAIN.mauer.id); assert.ok(i >= 0);
  hitWall(w, i, 1000, 0, 0);
  assert.equal(w.terr[i], TERRAIN.geroell.id);
  assert.equal(TERR_SPEED[TERRAIN.geroell.id], .7);
  assert.equal(TERRAIN.geroell.paint, false); assert.equal(TERRAIN.krater.paint, false);
});

test('Explosion ab CRATER.MIN_R reißt freien Boden zu Krater auf, Feuer und kleine nicht', () => {
  const w = createWorld(1600, 900, 3), y = 450;
  blast(w, 400, y, CRATER.MIN_R - 1, 10, null, null, 'blast', 0);
  blast(w, 600, y, 60, 10, null, null, 'fire', 0);
  assert.equal(w.terr.indexOf(TERRAIN.krater.id), -1);
  blast(w, 800, y, 60, 10, null, null, 'blast', 0);
  assert.equal(w.terr[cellIndex(w, 800, y)], TERRAIN.krater.id);
  assert.notEqual(w.terr[cellIndex(w, 800 + 60, y)], TERRAIN.krater.id, 'nur bis R · K');
  // Wasser bleibt Wasser
  tRect(w, 'wasser', .1, .1, .2, .2); blast(w, w.W * .15, w.H * .15, 60, 10, null, null, 'blast', 0);
  assert.equal(w.terr[cellIndex(w, w.W * .15, w.H * .15)], TERRAIN.wasser.id);
});

test('Deckung: Geröll ×¾ gegen Pfeile, Krater ×¾ gegen Kugeln, Krater nicht gegen Pfeile und Explosionen', () => {
  const w = createWorld(1600, 900, 4);
  const dmg = (id, kind) => {
    const u = spawn(w, 'ritter', 300, 300, 'blau'); w.terr[cellIndex(w, 300, 300)] = id;
    const h = u.hp; hurt(w, u, 10, kind, null); const d = h - u.hp; u.alive = false; w.units.length = 0; return d;
  };
  const a0 = dmg(0, 'arrow'), b0 = dmg(0, 'bullet');
  assert.ok(Math.abs(dmg(TERRAIN.geroell.id, 'arrow') - a0 * RUBBLE_COVER) < 1e-9);
  assert.ok(Math.abs(dmg(TERRAIN.krater.id, 'bullet') - b0 * CRATER.COVER) < 1e-9);
  assert.ok(Math.abs(dmg(TERRAIN.krater.id, 'arrow') - a0) < 1e-9);
  const x0 = dmg(0, 'blast'); assert.ok(Math.abs(dmg(TERRAIN.krater.id, 'blast') - x0) < 1e-9, 'Granaten: keine Deckung im Krater');
});
