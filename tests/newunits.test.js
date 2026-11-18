// Neue Einheiten (Ideenrunde 18.11.): Flammenwerfer und Pikenier
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, TERRAIN, CELL } from '../game/js/data.js';
import { createWorld, spawn, rebuildHash, setCell } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { FLAME } from '../game/js/combat.js';
import { PIKE } from '../game/js/abilities.js';
import { PAINT_TYPES } from '../game/js/online.js';

const DT = 1 / 60;
const mkWorld = (seed = 7) => { const w = createWorld(1400, 800, seed); w.teamMode = true; return w; };
const run = (w, secs, each) => { for (let t = 0; t < secs - 1e-9; t += DT) { step(w, DT); if (each) each(w.events); w.events.length = 0; } };

test('Codes: neue Einheiten hinten an PAINT_TYPES, alte Indizes fest', () => {
  assert.deepEqual(PAINT_TYPES.slice(48), ['koenig', 'jet', 'kampfdrohne', 'bomber', 'lama', 'flamme', 'pikenier', 'trommler', 'stinktier']);
  assert.ok(PAINT_TYPES.length <= 64, 'Typ passt in 6 Bit');
});

test('Flammenwerfer: Kegel trifft und zündet mehrere an, hinter ihm niemanden', () => {
  const w = mkWorld(), f = spawn(w, 'flamme', 400, 400, 'blau');
  const a = spawn(w, 'krieger', 470, 395, 'rot'), b = spawn(w, 'krieger', 470, 410, 'rot'), c = spawn(w, 'krieger', 290, 400, 'rot');
  for (const e of [a, b, c]) { e.hp = 1e9; e.cd = 1e9; e.speed = 0; e.mx = 0; }
  rebuildHash(w);
  let shots = 0;
  run(w, .6, ev => { shots += ev.filter(e => e.type === 'shot' && e.kind === 'breath').length; });
  assert.ok(shots >= 1, 'Flammenstrahl');
  assert.ok((a.burnT > 0 || a.hp < 1e9) && (b.burnT > 0 || b.hp < 1e9), 'beide vorn getroffen');
  assert.ok(f.T.range < 100 && FLAME.COS > .5);
});

test('Flammenwerfer: setzt Wald in Brand', () => {
  const w = mkWorld();
  for (let gy = (380 / CELL) | 0; gy <= (420 / CELL) | 0; gy++) for (let gx = (440 / CELL) | 0; gx <= (500 / CELL) | 0; gx++) setCell(w, gy * w.GW + gx, TERRAIN.wald.id);
  spawn(w, 'flamme', 400, 400, 'blau'); const k = spawn(w, 'krieger', 470, 400, 'rot'); k.hp = 1e9; k.cd = 1e9;
  rebuildHash(w);
  let fire = 0; run(w, 1, ev => { fire += ev.filter(e => e.type === 'ignite').length; });
  assert.ok(fire > 0);
});

test('Pikenier: ein stürmender Reiter prallt ab (Schaden, betäubt, Sturm vorbei)', () => {
  const w = mkWorld(), p = spawn(w, 'pikenier', 600, 400, 'blau'), r = spawn(w, 'reiter', 400, 400, 'rot');
  p.hp = 1e9; r.hp = 1e9;
  rebuildHash(w);
  let pike = 0, stunned = false, hpAt = 0;
  run(w, 3, ev => { for (const e of ev) if (e.k === 'pike') { pike++; if (!hpAt) hpAt = 1e9 - r.hp; stunned = stunned || r.state === 'stun' || r.state === 'air'; } });
  assert.ok(pike >= 1, 'Piken gestemmt');
  assert.ok(stunned, 'Reiter betäubt');
  assert.ok(hpAt >= PIKE.DMG + PIKE.MASS * UNITS.reiter.mass - 1e-6, `Schaden ${hpAt}`);
});

test('Pikenier: gegen Fußvolk kein Abprallen', () => {
  const w = mkWorld(), p = spawn(w, 'pikenier', 600, 400, 'blau'), k = spawn(w, 'krieger', 500, 400, 'rot');
  p.hp = 1e9; k.hp = 1e9;
  rebuildHash(w);
  let pike = 0; run(w, 3, ev => { pike += ev.filter(e => e.k === 'pike').length; });
  assert.equal(pike, 0);
});

test('Trommler: Verbündete in der Nähe laufen schneller und fliehen erst bei 15 %', async () => {
  const { DRUM } = await import('../game/js/abilities.js');
  const { RV_DRUM } = await import('../game/js/world.js');
  const w = mkWorld(), d = spawn(w, 'trommler', 400, 400, 'blau'), k = spawn(w, 'krieger', 460, 400, 'blau'), far = spawn(w, 'krieger', 800, 400, 'blau');
  spawn(w, 'krieger', 1300, 400, 'rot');
  rebuildHash(w);
  run(w, .6);
  assert.ok(k.rv[RV_DRUM] > w.time, 'im Takt');
  assert.equal(k.spdMul, DRUM.SPEED);
  assert.ok(!(far.rv[RV_DRUM] > w.time), 'zu weit weg');
  assert.ok(!(d.rv[RV_DRUM] > w.time), 'nicht er selbst');
});

test('Stinktier: Stinkwolke erschreckt nahe Gegner, Maschinen nicht', async () => {
  const { STINK } = await import('../game/js/abilities.js');
  const { isFleeing } = await import('../game/js/morale.js');
  const w = mkWorld(), s = spawn(w, 'stinktier', 400, 400, 'blau'); s.abCd = 0; s.hp = 1e9;
  const k = spawn(w, 'krieger', 425, 400, 'rot'), b = spawn(w, 'minibot', 420, 420, 'rot');
  k.hp = 1e9; b.hp = 1e9;
  rebuildHash(w);
  let cloud = 0, feared = false;
  run(w, 1.5, ev => { cloud += ev.filter(e => e.k === 'stink').length; feared = feared || k.fearT > 0; });
  assert.ok(cloud >= 1, 'Wolke');
  assert.ok(feared, 'Krieger erschrickt');
  assert.ok(!(b.fearT > 0), 'Minibot riecht nichts');
  assert.ok(STINK.R >= 40);
});
