// Schöneres Wasser (Nachtrag 7, #48): Fontäne statt Staub, Ringe der Watenden, treibende Leichen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFxCore, WADE } from '../game/js/render/fxcore.js';
import { createWorld, spawn, rebuildHash, touchTerrain } from '../game/js/world.js';
import { blast, hurt } from '../game/js/combat.js';
import { stepCorpses, CURRENT, FLOAT_T, SINK_T } from '../game/js/physics.js';

const lake = (w, x0, y0, x1, y1) => {
  for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) w.terr[gy * w.GW + gx] = 1;
  touchTerrain(w);
};
const kinds = core => core.store.countByKind();

test('Explosion im Wasser: Fontäne (Tropfen, Gischt, Ringe) statt Krater, Glut und Rauch', () => {
  const craters = [];
  const core = createFxCore({ crater: (...a) => craters.push(a) }, { rand: () => .5 });
  core.consume([{ type: 'blast', x: 100, y: 100, R: 42, kind: 'blast', water: true }]);
  const k = kinds(core);
  assert.equal(craters.length, 0, 'kein Krater im Wasser');
  assert.ok(k.drop >= 10 && k.spray >= 1 && k.wade === 2, JSON.stringify(k));
  assert.ok(!k.smoke && !k.ember, 'kein Rauch, keine Glut');
  const core2 = createFxCore({ crater: (...a) => craters.push(a) }, { rand: () => .5 });
  core2.consume([{ type: 'blast', x: 100, y: 100, R: 42, kind: 'blast' }]);
  assert.equal(craters.length, 1);
  assert.ok(kinds(core2).smoke > 0 && !kinds(core2).wade);
  // Felsbrocken im Wasser
  const core3 = createFxCore({ crater: (...a) => craters.push(a) }, { rand: () => .5 });
  core3.consume([{ type: 'creature', k: 'boulder', x: 100, y: 100, R: 34, water: true }]);
  assert.equal(craters.length, 1, 'auch der Felsbrocken macht im Wasser keinen Krater');
  assert.ok(kinds(core3).drop > 0 && !kinds(core3).dust);
});

test('combat.blast meldet, ob es im Wasser einschlägt', () => {
  const w = createWorld(600, 400, 1);
  lake(w, 0, 0, 20, 39);
  blast(w, 100, 100, 30, 10, null, null, 'blast', 0);
  blast(w, 400, 100, 30, 10, null, null, 'blast', 0);
  const b = w.events.filter(e => e.type === 'blast');
  assert.deepEqual(b.map(e => e.water), [true, false]);
});

test('Waten: Ring je Einheit alle WADE.T s, Bugwelle nur in Bewegung, an Land nichts', () => {
  const w = createWorld(600, 400, 1);
  lake(w, 0, 0, 29, 39);
  const a = spawn(w, 'krieger', 100, 100, 'blau'), b = spawn(w, 'krieger', 500, 100, 'blau');
  rebuildHash(w);
  const core = createFxCore({}, { rand: () => .5 });
  let rings = 0, bows = 0;
  const dt = 1 / 60;
  for (let t = 0; t < 3 * WADE.T - 1e-9; t += dt) {
    const before = kinds(core);
    core.update(dt, w);
    const k = kinds(core);
    rings += Math.max(0, (k.wade || 0) - (before.wade || 0));
    bows += Math.max(0, (k.bow || 0) - (before.bow || 0));
  }
  assert.ok(rings >= 2 && rings <= 4, `Ringe ${rings}`);
  assert.equal(bows, 0, 'steht still: keine Bugwelle');
  a.mx = 40;
  for (let t = 0; t < 1; t += dt) core.update(dt, w);
  assert.ok((kinds(core).bow || 0) > 0, 'Bugwelle in Bewegung');
  void b;
});

test('Leichen treiben mit der Strömung, bleiben am Ufer hängen, Zeiten bleiben', () => {
  const w = createWorld(600, 400, 1);
  lake(w, 5, 5, 25, 30);   // Wasser x/y 50–260 bzw. 50–310
  const u = spawn(w, 'krieger', 150, 150, 'blau');
  hurt(w, u, 1e9, 'melee', null);
  const c = w.corpses.find(k => k.kind === 'body');
  c.vx = c.vy = c.vz = 0; c.z = 0;
  const dt = 1 / 60;
  let t = 0;
  while (c.state === 'fly' && t < 2) { stepCorpses(w, dt); w.time += dt; t += dt; }
  assert.equal(c.state, 'float');
  const x0 = c.x, y0 = c.y;
  for (let i = 0; i < 60; i++) { stepCorpses(w, dt); w.time += dt; }
  const dx = c.x - x0, dy = c.y - y0;
  assert.ok(Math.abs(dx - CURRENT.x) < 3 && dy > 0, `1 s Strömung: ${dx.toFixed(2)}, ${dy.toFixed(2)}`);
  // am Ufer: rechts endet das Wasser bei x = 260
  c.x = 255; c.px = 255;
  for (let i = 0; i < 60; i++) { stepCorpses(w, dt); w.time += dt; }
  assert.ok(c.x < 260, 'bleibt im Wasser');
  // Zeitplan unverändert: nach FLOAT_T + SINK_T ist sie weg
  for (let i = 0; i < (FLOAT_T + SINK_T) * 60; i++) { stepCorpses(w, dt); w.time += dt; }
  assert.ok(!w.corpses.includes(c));
});
