// Lama (Ideenrunde 18.11.): Spucke trifft Boden und Luft, bremst 2 s
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { SPIT, KITE } from '../game/js/combat.js';
import { UNITS, RANGED, COUNTERS } from '../game/js/data.js';
import { rigLayout } from '../game/js/render/rig.js';

const DT = 1 / 60;
const run = (w, secs, each) => { for (let t = 0; t < secs - 1e-9; t += DT) { step(w, DT); if (each) each(w.events); w.events.length = 0; } };

test('Daten: Lama ist ein Fernkämpfer der Tiere mit Kartentext, Konter und Teamfarbe', () => {
  const T = UNITS.lama;
  assert.equal(T.cat, 'tiere'); assert.ok(T.range > 100); assert.ok(RANGED.has('lama')); assert.ok(KITE.has('lama'));
  assert.ok(T.abil.some(a => a.n === 'Spucke'));
  assert.ok(COUNTERS.some(c => c[0] === 'lama') && COUNTERS.some(c => c[1] === 'lama'));
  assert.equal(rigLayout('lama').body.variants, 5);
});

test('Spucke trifft einen Hubschrauber in der Luft und bremst ihn', () => {
  const w = createWorld(1400, 800, 4); w.teamMode = true;
  const l = spawn(w, 'lama', 300, 400, 'blau');
  const h = spawn(w, 'heli', 440, 400, 'rot'); h.cd = 1e9; h.abCd = 1e9; h.hp = 1e6;
  let hit = false;
  run(w, 3, ev => { if (ev.some(e => e.type === 'spit')) hit = true; });
  assert.ok(hit, 'Spucke getroffen');
  assert.ok(h.hp < 1e6, 'Schaden');
  assert.ok(h.slowT > 0 && h.slowT <= SPIT.T, 'gebremst');
  void l;
});

test('Gebremst läuft eine Einheit langsamer', () => {
  const speed = slow => {
    const w = createWorld(1400, 800, 4); w.teamMode = true;
    const u = spawn(w, 'krieger', 300, 400, 'blau'); spawn(w, 'krieger', 1200, 400, 'rot').cd = 1e9;
    run(w, .5); if (slow) u.slowT = 1e9;
    const x0 = u.x; run(w, 1); return u.x - x0;
  };
  const a = speed(false), b = speed(true);
  assert.ok(b < a * .75 && b > a * .45, `${b.toFixed(1)} vs ${a.toFixed(1)}`);
});
