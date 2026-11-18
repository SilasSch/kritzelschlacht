// Hubschrauber-Overhaul und Lufteinheiten (18.11.): Heli-Panzerung und Abstand, Jet, Drohne, Bomber (air.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS } from '../game/js/data.js';
import { createWorld, spawn, rebuildHash, outOfMelee, nearestEnemy } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { hurt, HELI } from '../game/js/combat.js';
import { JET } from '../game/js/air.js';

const mkWorld = (seed = 7) => { const w = createWorld(1600, 900, seed); w.teamMode = true; return w; };
const run = (w, s) => { for (let i = 0; i < s * 60; i++) { step(w, 1 / 60); w.events.length = 0; } };

test('Heli: Kugeln ×0,75, Pfeile voll, Raketen ×1,4', () => {
  const w = mkWorld(), h = spawn(w, 'heli', 400, 400, 'rot');
  for (const [kind, m] of [['bullet', HELI.BULLET], ['arrow', 1], ['rocket', HELI.ROCKET]]) {
    h.hp = 300; hurt(w, h, 10, kind, null);
    assert.ok(Math.abs(300 - h.hp - 10 * m) < 1e-9, kind);
  }
});

test('Heli hält Abstand statt zu kreisen: bleibt nah an HOLD × Reichweite', () => {
  const w = mkWorld(), h = spawn(w, 'heli', 500, 450, 'rot'), s = spawn(w, 'sani', 1000, 450, 'blau');
  s.T = { ...s.T, speed: 0 };
  rebuildHash(w); run(w, 8);
  const d = Math.hypot(h.x - s.x, h.y - s.y), want = (UNITS.heli.range + UNITS.heli.r + UNITS.sani.r) * HELI.HOLD;
  assert.ok(Math.abs(d - want) < 60, `Abstand ${d | 0}, Soll ${want | 0}`);
});

test('Hohe Flieger: Nahkämpfer am Boden erreichen Heli, Jet, Drohne und Bomber nicht', () => {
  const w = mkWorld(), k = spawn(w, 'krieger', 300, 300, 'blau');
  for (const t of ['heli', 'jet', 'kampfdrohne', 'bomber']) {
    assert.ok(UNITS[t].high && UNITS[t].fly, t);
    assert.ok(outOfMelee(k, spawn(w, t, 320, 300, 'rot')), t);
  }
  rebuildHash(w);
  assert.equal(nearestEnemy(w, k), null);
});

test('Jet: fliegt nie still und trifft Flieger dreifach', () => {
  const w = mkWorld(), j = spawn(w, 'jet', 300, 450, 'blau'), h = spawn(w, 'heli', 900, 450, 'rot');
  rebuildHash(w);
  let still = 0;
  for (let i = 0; i < 6 * 60; i++) { step(w, 1 / 60); w.events.length = 0; if (Math.hypot(j.mx, j.my) < UNITS.jet.speed * .9) still++; }
  assert.equal(still, 0);
  assert.ok(h.hp < UNITS.heli.hp - UNITS.jet.dmg * JET.AIR, `Heli getroffen (${h.hp | 0})`);
});

test('Drohne: explodiert am Ziel, trifft keine Eigenen und stirbt dabei', () => {
  const w = mkWorld(), d = spawn(w, 'kampfdrohne', 400, 450, 'blau'), mate = spawn(w, 'kampfdrohne', 400, 470, 'blau');
  const p = spawn(w, 'panzer', 600, 450, 'rot'); p.T = { ...p.T, speed: 0, range: 0 };
  mate.T = { ...mate.T, speed: 0 };
  rebuildHash(w); run(w, 3);
  assert.equal(d.alive, false);
  assert.ok(p.hp < UNITS.panzer.hp - 50, `Panzer ${p.hp | 0}`);
  assert.equal(mate.hp, UNITS.kampfdrohne.hp, 'eigene Kampfdrohne unversehrt');
});

test('Bomber: wirft einen Teppich auf Bodentruppen, trifft sich selbst nicht', () => {
  const w = mkWorld(), b = spawn(w, 'bomber', 300, 450, 'blau');
  for (let i = 0; i < 6; i++) { const k = spawn(w, 'ritter', 800 + (i % 3) * 18, 430 + (i / 3 | 0) * 22, 'rot'); k.T = { ...k.T, speed: 0 }; }
  rebuildHash(w);
  let bombs = 0;
  for (let i = 0; i < 25 * 60; i++) { step(w, 1 / 60); for (const p of w.proj) if (p.kind === 'airbomb' && p.t === 1 / 60) bombs++; w.events.length = 0; }
  assert.ok(bombs >= 6, `Bomben ${bombs}`);
  assert.equal(b.hp, UNITS.bomber.hp);
  assert.ok(w.units.some(u => u.type === 'ritter' && u.hp < UNITS.ritter.hp), 'Ritter getroffen');
});
