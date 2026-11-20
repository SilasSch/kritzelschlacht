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
