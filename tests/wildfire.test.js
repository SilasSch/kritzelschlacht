// Waldbrand (wildfire.js): Feuer entzündet Wald, breitet sich aus, lässt Asche ohne Deckung zurück
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, cellIndex, clearBattle } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { blast, hurt, ignite } from '../game/js/combat.js';
import { TERRAIN, CELL } from '../game/js/data.js';
import { WILDFIRE, igniteArea, stepWildfire } from '../game/js/wildfire.js';
import { terrainAllowed } from '../game/js/campaign/index.js';

const DT = 1 / 60, WALD = TERRAIN.wald.id, ASH = TERRAIN.asche.id;
const mk = (seed = 5) => createWorld(1400, 800, seed);
function forest(w, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y += CELL) for (let x = x0; x <= x1; x += CELL) w.terr[cellIndex(w, x, y)] = WALD;
}
const count = (w, id) => w.terr.reduce((n, t) => n + (t === id ? 1 : 0), 0);
const run = (w, secs) => { for (let t = 0; t < secs - 1e-9; t += DT) { step(w, DT); w.events.length = 0; } };

test('Feuer-Explosion entzündet Wald, normale Explosion nicht', () => {
  const w = mk(); forest(w, 300, 300, 400, 400);
  blast(w, 350, 350, 30, 10, null, null, 'blast', 0);
  assert.equal(w.blaze?.length ?? 0, 0, 'Bombe: kein Brand');
  blast(w, 350, 350, 30, 10, null, null, 'fire', 0, 0);
  assert.ok(w.blaze.length > 0, 'Feuerball: Brand');
});

test('Brand breitet sich aus und hinterlässt Asche; Asche gibt keine Deckung', () => {
  const w = mk(); forest(w, 300, 300, 500, 400);
  const before = count(w, WALD);
  igniteArea(w, 300, 350, 12);
  run(w, 60);
  const ash = count(w, ASH);
  assert.ok(ash > 10, `Asche ${ash}`);
  assert.ok(count(w, WALD) < before - 10, 'Wald verbrannt');
  assert.equal(w.blaze.length, 0, 'nach 60 s ausgebrannt');
  // Deckung: Pfeil im Wald halb, auf Asche voll
  const u = spawn(w, 'krieger', 300, 350, 'blau');
  const i = cellIndex(w, u.x, u.y);
  assert.equal(w.terr[i], ASH);
  const hp = u.hp; hurt(w, u, 10, 'arrow', null);
  assert.ok(Math.abs(hp - u.hp - 10) < 1e-9, 'volle Wirkung auf Asche');
});

test('Bodentruppen auf brennendem Wald fangen Feuer, Flieger nicht', () => {
  const w = mk(); forest(w, 300, 300, 360, 360);
  const g = spawn(w, 'krieger', 330, 330, 'blau'); g.state = 'stun'; g.stunT = 1e9; g.hp = 1e6;
  const b = spawn(w, 'biene', 330, 330, 'blau'); b.hp = 1e6; b.state = 'stun'; b.stunT = 1e9; b.z = 14;
  igniteArea(w, 330, 330, 40);
  run(w, 1.2);
  assert.ok(g.burnT > 0, 'Krieger brennt');
  assert.equal(b.burnT, 0, 'Biene fliegt drüber');
});

test('Brennende Einheit im Wald entzündet ihn', () => {
  const w = mk(); forest(w, 300, 300, 360, 360);
  const g = spawn(w, 'krieger', 330, 330, 'blau'); g.hp = 1e6; g.state = 'stun'; g.stunT = 1e9;
  ignite(w, g, 0, null);
  run(w, .2);
  assert.ok(w.blaze.length > 0);
});

test('Asche ist nicht malbar; neue Schlacht löscht den Brand', () => {
  assert.equal(terrainAllowed(null, 'asche'), false);
  assert.equal(terrainAllowed(null, 'wald'), true);
  const w = mk(); forest(w, 300, 300, 400, 400);
  igniteArea(w, 350, 350, 30);
  clearBattle(w);
  assert.equal(w.blaze.length, 0);
  stepWildfire(w, DT);
});

test('deterministisch', () => {
  const play = () => { const w = mk(9); forest(w, 200, 200, 600, 500); igniteArea(w, 400, 350, 20); run(w, 8); return Array.from(w.terr).join(''); };
  assert.equal(play(), play());
});

test('übermaltes Wasser wird nicht zu Asche und Asche erhöht terrainVersion (#88)', () => {
  const w = mk(); forest(w, 300, 300, 340, 340);
  igniteArea(w, 320, 320, 25);
  const wi = cellIndex(w, 320, 320);
  w.terr[wi] = TERRAIN.wasser.id;
  const v0 = w.terrainVersion;
  run(w, 20);
  assert.equal(w.terr[wi], TERRAIN.wasser.id, 'Wasser bleibt Wasser');
  assert.ok(w.terrainVersion > v0, 'terrainVersion bei Asche erhöht');
});
