// Luft gegen Nahkampf (20.11., Wunsch Silas): Luft behält den Vorteil, Nahkämpfer sind aber nicht mehr hilflos.
// Steinwurf (combat.STONE), Sturzflug des Flugsauriers (abilities.PTERA) und Wald als Deckung gegen oben (combat.FOREST).
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, TERRAIN } from '../game/js/data.js';
import { createWorld, spawn, rebuildHash, aloft, setCell, cellIndex, EAGLE_REACH_Z } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { hurt, STONE, FOREST } from '../game/js/combat.js';
import { PTERA } from '../game/js/abilities.js';

const mkWorld = (seed = 7) => { const w = createWorld(1600, 900, seed); w.teamMode = true; return w; };
const run = (w, s, each) => { for (let i = 0; i < s * 60; i++) { step(w, 1 / 60); if (each) each(); w.events.length = 0; } };

test('Steinwurf: Nahkämpfer ohne erreichbares Ziel gehen auf den Hubschrauber zu und werfen Steine', () => {
  const w = mkWorld(), h = spawn(w, 'heli', 800, 450, 'rot');
  h.cd = 1e9;   // schießt nicht zurück
  const K = [0, 1, 2, 3].map(i => spawn(w, 'krieger', 400, 400 + i * 30, 'blau'));
  rebuildHash(w);
  let rocks = 0;
  run(w, 20, () => { for (const p of w.proj) if (p.kind === 'rock' && p.t === 1 / 60) rocks++; });
  assert.ok(rocks >= 4, `Steine ${rocks}`);
  assert.ok(h.hp < UNITS.heli.hp, 'Heli getroffen');
  assert.ok(K.every(k => k.x > 450), 'Krieger sind herangekommen');
});

test('Steinwurf: schwach, Luft behält den Vorteil (ein Treffer ≤ STONE.DMG · 1,15)', () => {
  const w = mkWorld(), h = spawn(w, 'heli', 800, 450, 'rot'), k = spawn(w, 'krieger', 760, 450, 'blau');
  hurt(w, h, STONE.DMG * 1.15, 'arrow', k);
  assert.ok(UNITS.heli.hp - h.hp <= STONE.DMG * 1.15 + 1e-9);
  assert.ok(STONE.DMG < UNITS.krieger.dmg / 3);
});

test('Sturzflug: der Flugsaurier sinkt zum Abwurf unter die Reichweite der Nahkämpfer und wird dort getroffen', () => {
  const w = mkWorld(), p = spawn(w, 'ptera', 600, 450, 'rot');
  const K = [0, 1, 2, 3, 4, 5].map(i => { const k = spawn(w, 'krieger', 560 + (i % 3) * 30, 430 + (i / 3 | 0) * 40, 'blau'); k.stoneCd = 1e9; return k; });
  rebuildHash(w);
  let low = 0, highHit = false, prev = p.hp;
  run(w, 15, () => {
    if (!p.alive) return;
    if (p.z <= EAGLE_REACH_Z) low++;
    if (p.hp < prev && aloft(p)) highHit = true;   // oben erreicht ihn kein Nahkämpfer (Steine abgeschaltet)
    prev = p.hp;
  });
  assert.ok(low > 0, 'war unten');
  assert.ok(!highHit, 'oben nicht getroffen');
  assert.ok(!p.alive || p.hp < UNITS.ptera.hp, 'unten getroffen');
  assert.ok(K.some(k => k.hp < UNITS.krieger.hp), 'hat geworfen');
});

test('Sturzflug: ohne Ziel kreist der Flugsaurier oben', () => {
  const w = mkWorld(), p = spawn(w, 'ptera', 600, 450, 'rot');
  spawn(w, 'krieger', 1400, 800, 'blau').stoneCd = 1e9;
  rebuildHash(w);
  run(w, 1);
  assert.equal(p.fz, UNITS.ptera.flyZ);
  assert.ok(PTERA.LOW <= EAGLE_REACH_Z);
});

test('Wald: Angriffe aus der Luft machen auf Bodentruppen im Wald nur FOREST.AIR Schaden, Pfeile vom Boden FOREST.COVER', () => {
  const w = mkWorld(), v = spawn(w, 'krieger', 400, 400, 'blau'), h = spawn(w, 'heli', 600, 400, 'rot'), s = spawn(w, 'schuetze', 600, 450, 'rot');
  const ci = cellIndex(w, v.x, v.y);
  hurt(w, v, 10, 'bullet', h); const open = UNITS.krieger.hp - v.hp; v.hp = UNITS.krieger.hp;
  setCell(w, ci, TERRAIN.wald.id, 0);
  hurt(w, v, 10, 'bullet', h); const air = UNITS.krieger.hp - v.hp; v.hp = UNITS.krieger.hp;
  hurt(w, v, 10, 'arrow', s); const arrow = UNITS.krieger.hp - v.hp; v.hp = UNITS.krieger.hp;
  assert.ok(Math.abs(air - open * FOREST.AIR) < 1e-9, `aus der Luft ${air} von ${open}`);
  assert.ok(Math.abs(arrow - 10 * FOREST.COVER) < 1e-9, `Pfeil ${arrow}`);
  // Biss einer Biene (Nahkampf aus der Luft) wird auch gedämpft, ihr Gift (Schaden über Zeit) nicht
  const b = spawn(w, 'biene', 410, 400, 'rot');
  hurt(w, v, 10, 'melee', b); assert.ok(Math.abs(UNITS.krieger.hp - v.hp - 10 * FOREST.AIR) < 1e-9); v.hp = UNITS.krieger.hp;
  hurt(w, v, 10, 'poison', b, true); assert.equal(UNITS.krieger.hp - v.hp, 10);
});
