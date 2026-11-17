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

test('Fund 2: ein Phönix, der an Gift zu Asche wird, handelt in diesem Schritt nicht mehr', () => {
  const w = mkWorld(5);
  const p = spawn(w, 'phoenix', 400, 300, 'blau');
  const e = spawn(w, 'krieger', 405, 300, 'rot'); e.cd = 1e9; e.hp = 1e9; e.abCd = 99;
  rebuildHash(w);
  p.cd = 0; p.hp = .001; p.poisonT = 5;
  step(w, DT);
  assert.ok(p.ashT > 0, 'Phönix ist zu Asche geworden');
  assert.equal(e.hp, 1e9, 'Asche schlägt nicht zu');
  assert.ok(p.cd <= 0, 'Asche löst keinen Angriff aus');
});

test('Fund 3: eine Fähigkeit trifft keine Asche (das Ziel wird vor stepAbility verworfen)', () => {
  const w = mkWorld(6);
  const c = spawn(w, 'krokodil', 400, 300, 'blau'); c.abCd = 0; c.cd = 1e9;
  const a = spawn(w, 'krieger', 410, 300, 'rot'); a.hp = 50; a.ashT = 1; a.cd = 1e9;
  rebuildHash(w);
  c.tg = a; c.rt = 5;
  step(w, DT);
  assert.equal(a.hp, 50, 'Biss der Fähigkeit trifft die Asche nicht');
  assert.equal(c.seenT <= 0, true, 'kein Packen (seenT bliebe sonst gesetzt)');
  assert.equal(a.state, 'ok');
});

test('Fund 4: ein versteckt verfluchtes Krokodil ist als Frosch nicht unsichtbar', () => {
  const w = mkWorld(3);
  for (let gy = 0; gy < w.GH; gy++) for (let gx = 0; gx < w.GW; gx++) if (gx * CELL < 300) setCell(w, gy * w.GW + gx, TERRAIN.wasser.id);
  const c = spawn(w, 'krokodil', 290, 300, 'rot');
  for (let k = 0; k < 4; k++) spawn(w, 'krieger', 100, 100 + k * 20, 'rot');
  const s = spawn(w, 'schuetze', 700, 300, 'blau'); s.cd = 99;
  rebuildHash(w); step(w, DT);
  assert.equal(c.hidden, true, 'Aufbau: Krokodil ist im Wasser versteckt');
  curseFrog(w, c, 5);
  assert.equal(c.hidden, false, 'Frosch ist nicht versteckt');
  c.x = 500;
  for (let i = 0; i < 30; i++) step(w, DT);
  assert.equal(c.type, 'frosch');
  assert.equal(c.hidden, false, 'Frosch außerhalb des Wassers bleibt sichtbar');
});
