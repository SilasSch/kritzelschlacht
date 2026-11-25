// Hubschrauber-Overhaul und Lufteinheiten (18.11.): Heli-Panzerung und Abstand, Jet, Drohne, Bomber (air.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS } from '../game/js/data.js';
import { createWorld, spawn, rebuildHash, outOfMelee, nearestEnemy } from '../game/js/world.js';
import { step, placeRect } from '../game/js/sim.js';
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

test('Drohnenschwarm zwischen zwei gleichen Zielen: Hälften fliegen zum näheren statt über Kreuz (Aufzeichnung 23.11.)', () => {
  // vorher: ab ~500 Drohnen teilte die Zielwahl nach Reihenfolge, die Hälften blockierten sich in der Mitte, beide Spulen lebten ewig
  const w = mkWorld(3), a = spawn(w, 'tesla', 800, 108, 'blau'), b = spawn(w, 'tesla', 800, 792, 'blau');
  placeRect(w, 'kampfdrohne', 600, .45, .3, .55, .7, 'rot');
  rebuildHash(w); run(w, 6);
  assert.ok(!a.alive && !b.alive, `Spulen ${a.hp | 0} / ${b.hp | 0}`);
});

test('Bomber: wirft einen Teppich auf Bodentruppen, trifft sich selbst nicht', () => {
  const w = mkWorld(), b = spawn(w, 'bomber', 300, 450, 'blau');
  for (let i = 0; i < 6; i++) { const k = spawn(w, 'ritter', 800 + (i % 3) * 18, 430 + (i / 3 | 0) * 22, 'rot'); k.T = { ...k.T, speed: 0 }; k.stoneCd = 1e9; }   // ohne Steinwurf (20.11.)
  rebuildHash(w);
  let bombs = 0;
  for (let i = 0; i < 25 * 60; i++) { step(w, 1 / 60); for (const p of w.proj) if (p.kind === 'airbomb' && p.t === 1 / 60) bombs++; w.events.length = 0; }
  assert.ok(bombs >= 6, `Bomben ${bombs}`);
  assert.equal(b.hp, UNITS.bomber.hp);
  assert.ok(w.units.some(u => u.type === 'ritter' && u.hp < UNITS.ritter.hp), 'Ritter getroffen');
});

test('Jet: Luft-Luft-Raketen lenken nach und treffen einen Heli', () => {
  const w = mkWorld(), j = spawn(w, 'jet', 300, 450, 'blau'), h = spawn(w, 'heli', 700, 450, 'rot');
  j.T = { ...j.T, dmg: 0 }; h.T = { ...h.T, speed: 0, range: 0 };
  rebuildHash(w);
  let fired = 0, hits = 0;
  for (let i = 0; i < 4 * 60; i++) {
    step(w, 1 / 60);
    for (const p of w.proj) if (p.kind === 'aam' && p.t === 1 / 60) fired++;
    w.events.length = 0;
  }
  hits = UNITS.heli.hp - h.hp;
  assert.ok(fired >= 2, `Raketen ${fired}`);
  assert.ok(hits >= 40, `Schaden ${hits | 0}`);
});

test('Jet: keine Luft-Luft-Raketen auf Bodentruppen', () => {
  const w = mkWorld(), j = spawn(w, 'jet', 300, 450, 'blau'), p = spawn(w, 'panzer', 700, 450, 'rot');
  p.T = { ...p.T, speed: 0, range: 0 };
  rebuildHash(w);
  let fired = 0;
  for (let i = 0; i < 5 * 60; i++) { step(w, 1 / 60); fired += w.proj.filter(q => q.kind === 'aam').length; w.events.length = 0; }
  assert.equal(fired, 0);
});

// Jet-Rework (25.11.): Tiefflug-Garbe, Überschallknall, Fassrolle und Täuschkörper (air.js STRAFE, BOOM, EVADE)
test('Jet-Rework: Tiefflug-Garbe trifft eine Bodengruppe, Knall wirft sie um', async () => {
  const { STRAFE } = await import('../game/js/air.js');
  const w = mkWorld(), j = spawn(w, 'jet', 300, 450, 'blau');
  j.hx = 1; j.hy = 0;
  const ks = [];
  for (let i = 0; i < 12; i++) { const k = spawn(w, 'krieger', 700 + (i % 4) * 18, 420 + ((i / 4) | 0) * 22, 'rot'); k.T = { ...k.T, speed: 0 }; ks.push(k); }
  rebuildHash(w);
  let minZ = 1e9, stunned = 0, boom = 0;
  for (let i = 0; i < 3 * 60; i++) {
    step(w, 1 / 60);
    for (const e of w.events) if (e.type === 'jetfx' && e.k === 'boom') boom++;
    w.events.length = 0; minZ = Math.min(minZ, j.z);
    stunned = Math.max(stunned, ks.filter(k => k.alive && k.state === 'stun').length);
  }
  assert.ok(minZ <= STRAFE.LOW + 2, `tief geflogen (${minZ | 0})`);
  assert.equal(boom, 1, 'genau ein Überschallknall');
  assert.ok(stunned >= 3, `umgeworfen: ${stunned}`);
  const dmg = ks.reduce((s, k) => s + (UNITS.krieger.hp - Math.max(0, k.hp)), 0);
  assert.ok(dmg >= 80, `Garbe-Schaden ${dmg | 0}`);
});

test('Jet-Rework: oben weicht er Kugeln aus, unten nicht; Täuschkörper lassen Lenkraketen los', async () => {
  const { jetEvades, EVADE, STRAFE } = await import('../game/js/air.js');
  const w = mkWorld(), j = spawn(w, 'jet', 400, 400, 'blau');
  j.z = UNITS.jet.flyZ;
  let n = 0; for (let i = 0; i < 2000; i++) if (jetEvades(w, j, { kind: 'bullet' })) n++;
  assert.ok(Math.abs(n / 2000 - EVADE.BULLET) < .05, `Ausweichquote ${n / 2000}`);
  j.z = STRAFE.LOW;
  assert.equal(jetEvades(w, j, { kind: 'bullet' }), false);
  // Lenkrakete eines feindlichen Jets auf ihn: Täuschkörper, Rakete verliert das Ziel
  j.z = UNITS.jet.flyZ; j.fz = UNITS.jet.flyZ;
  const e = spawn(w, 'jet', 900, 400, 'rot');
  rebuildHash(w);
  w.proj.push({ kind: 'aam', arc: false, homing: true, x: 500, y: 400, z: 70, vx: -430, vy: 0, t: 0, life: 2.4, tg: j, src: e, f: null, dmg: 40, R: 0 });
  step(w, 1 / 60);
  assert.ok(j.flareT > 0, 'Täuschkörper geworfen');
  assert.equal(w.proj.filter(p => p.kind === 'aam' && p.tg === j).length, 0);
});

test('Jet trifft einzelne Bodenziele, auch laufende (Silas 25.11.: „trifft einzelne Units einfach nie“)', () => {
  for (const moving of [false, true]) {
    const w = mkWorld(3), j = spawn(w, 'jet', 200, 450, 'blau'), k = spawn(w, 'krieger', 1100, 400, 'rot');
    j.hp = 1e6;
    if (moving) { const d = spawn(w, 'sani', 100, 100, 'blau'); d.T = { ...d.T, speed: 0 }; d.hp = 1e9; }
    else k.T = { ...k.T, speed: 0 };
    rebuildHash(w); run(w, 8);
    assert.equal(k.alive, false, moving ? 'laufender Krieger' : 'stehender Krieger');
  }
});
