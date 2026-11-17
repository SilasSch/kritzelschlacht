// Funde der Abschlussprüfung (Fähigkeiten und neue Einheiten): je ein Test pro Fund.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, rebuildHash, setCell } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { ignite } from '../game/js/combat.js';
import { curseFrog, scare, ROAR, CHEST_BEAT } from '../game/js/abilities.js';
import { TERRAIN, CELL } from '../game/js/data.js';

const DT = 1 / 60;
const mkWorld = (seed = 7) => { const w = createWorld(800, 600, seed); w.teamMode = true; return w; };

test('Fund 1: ein Froschfluch, der mitten im Schritt endet, gibt dem Sanitäter keine NaN-Wunde', () => {
  for (let trial = 0; trial < 12; trial++) {
    const w = mkWorld(1 + trial);
    const s = spawn(w, 'sani', 400, 300, 'blau');
    for (let k = 0; k < 4; k++) spawn(w, 'sani', 100, 100 + k * 20, 'blau');
    const e = spawn(w, 'krieger', 412 + trial * .2, 300, 'rot'); e.cd = 99; e.abCd = 99;
    rebuildHash(w);
    curseFrog(w, s, DT * (1 + (trial % 3)));
    s.cd = 0;
    for (let i = 0; i < 10; i++) { step(w, DT); e.cd = 99; }
    assert.equal(s.type, 'sani');
    assert.ok(Number.isFinite(e.hp), `Krieger-LP endlich (Versuch ${trial})`);
    for (const u of w.units) assert.ok(Number.isFinite(u.hp), 'keine NaN-LP');
  }
});
