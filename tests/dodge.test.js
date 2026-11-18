// Bomben ausweichen (Nachtrag 7, #47): Würfe je Geschoss, Wendigkeit, Hüpfer aus dem Kreis, nie in Lava.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, rebuildHash, cellIndex, touchTerrain } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { UNITS, TERRAIN, AGILITY } from '../game/js/data.js';
import { rollDodges, canDodge, DODGE, DODGE_KINDS } from '../game/js/dodge.js';
import { LAUNCH_VZ } from '../game/js/physics.js';

const DT = 1 / 60;
const mk = seed => { const w = createWorld(900, 600, seed); w.teamMode = true; return w; };
// Bogenwurf auf (x1, y1) wie combat.fire (Flugzeit dur, Splash R), vom Werfer src
const lob = (w, kind, src, x1, y1, R, dur = 1) => {
  const p = { kind, arc: true, x0: src.x, y0: src.y, x1, y1, t: 0, dur, h: 60, x: src.x, y: src.y, z: 0, tz: 0, f: src.team, src, dmg: 20, R, dg: false };
  w.proj.push(p); return p;
};
// n Einheiten type im Ring um (cx, cy) innerhalb von rmax
const ring = (w, type, n, cx, cy, rmax) => {
  const us = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, d = rmax * (.2 + .8 * ((i * .618) % 1)); us.push(spawn(w, type, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 'blau')); }
  for (const u of us) u.cd = 1e9;
  rebuildHash(w);
  return us;
};

test('Wendigkeit: jede Einheit trägt dodge, Klassen wie in der Spezifikation', () => {
  for (const k in UNITS) assert.equal(typeof UNITS[k].dodge, 'number', k);
  for (const k of ['wolf', 'biene', 'reiter', 'adler', 'einhorn', 'geist', 'vampir']) assert.equal(UNITS[k].dodge, AGILITY.flink, k);
  for (const k of ['krieger', 'soldat', 'magier', 'gorilla', 'frosch', 'roemer']) assert.equal(UNITS[k].dodge, AGILITY.normal, k);
  for (const k of ['ritter', 'troll', 'zyklop', 'elefant', 'bueffel', 'panzer']) assert.ok(UNITS[k].dodge <= .1, k);
  assert.equal(UNITS.ritter.dodge, 0);
  assert.deepEqual([...DODGE_KINDS].sort(), ['bomb', 'boulder', 'mortar']);
});

test('Wölfe weichen einer Granate zu etwa 60 % aus (feste Saat, viele Würfe)', () => {
  let rolls = 0, hops = 0;
  for (let k = 0; k < 40; k++) {
    const w = mk(100 + k), src = spawn(w, 'grenadier', 100, 300, 'rot'); src.cd = 1e9;
    ring(w, 'wolf', 8, 450, 300, 40);
    const p = lob(w, 'bomb', src, 450, 300, 42);
    rolls += rollDodges(w, p);
    hops += w.events.filter(e => e.type === 'dodge').length;
  }
  assert.equal(rolls, 320, 'jeder Wolf im Kreis würfelt');
  const q = hops / rolls;
  assert.ok(Math.abs(q - .6) < .07, `Anteil ${q.toFixed(3)}`);
});

test('Ritter (0 %) und liegende MG-Schützen weichen nie aus; Römer im Block, Flieger und Betäubte würfeln nicht', () => {
  let hops = 0, rolls = 0;
  for (let k = 0; k < 20; k++) {
    const w = mk(200 + k), src = spawn(w, 'grenadier', 100, 300, 'rot');
    ring(w, 'ritter', 6, 450, 300, 40);
    const mgs = ring(w, 'mg', 4, 450, 300, 30);
    for (const m of mgs) m.stance = 'prone';
    const p = lob(w, 'mortar', src, 450, 300, 55);
    rolls += rollDodges(w, p);
    hops += w.events.filter(e => e.type === 'dodge').length;
  }
  assert.equal(hops, 0);
  assert.equal(rolls, 120, 'nur die Ritter würfeln (mit 0 %)');
  const w = mk(3), u = spawn(w, 'roemer', 0, 0, 'blau');
  assert.equal(canDodge(u), true);
  u.formOn = true; assert.equal(canDodge(u), false, 'Römer im Block');
  u.formOn = false; u.state = 'stun'; assert.equal(canDodge(u), false, 'betäubt');
  u.state = 'air'; assert.equal(canDodge(u), false, 'in der Luft');
  assert.equal(canDodge(spawn(w, 'biene', 0, 0, 'blau')), false, 'Flieger');
  const mg = spawn(w, 'mg', 0, 0, 'blau'); mg.stance = 'down'; assert.equal(canDodge(mg), false, 'legt sich hin');
});

test('Ein Wurf je Einheit und Geschoss: zweiter Aufruf und weitere Schritte würfeln nicht mehr', () => {
  const w = mk(7), src = spawn(w, 'grenadier', 100, 300, 'rot'); src.cd = 1e9;
  const wolves = ring(w, 'wolf', 10, 450, 300, 40);
  const p = lob(w, 'bomb', src, 450, 300, 42, 1);
  // vor DODGE.LEAD s vor dem Einschlag: noch kein Wurf
  let rngCalls = 0;
  for (let t = 0; t < 1 - DODGE.LEAD - .05; t += DT) step(w, DT);
  assert.equal(p.dg, false);
  const rng = w.rng; w.rng = () => { rngCalls++; return rng(); };
  const per = new Map();
  for (let t = 0; t < .6; t += DT) {
    step(w, DT);
    for (const e of w.events) if (e.type === 'dodge') per.set(e.x + ',' + e.y, (per.get(e.x + ',' + e.y) || 0) + 1);
    w.events.length = 0;
  }
  assert.equal(p.dg, true);
  assert.equal(rollDodges(w, p), 0, 'zweiter Aufruf würfelt nicht');
  assert.ok(rngCalls >= 10, 'Würfe über world.rng');
  void wolves;
});

test('Hüpfer: aus dem Kreis bis zum Einschlag, ohne Abheben und ohne Betäubung', () => {
  let hopped = 0;
  for (let k = 0; k < 10; k++) {
    // Werfer im eigenen Team (Granate trifft auch Eigene): ohne Feind bleiben die Wölfe stehen
    const w = mk(300 + k), src = spawn(w, 'grenadier', 100, 300, 'blau'); src.cd = 1e9;
    const wolves = ring(w, 'wolf', 8, 450, 300, 40);
    const p = lob(w, 'bomb', src, 450, 300, 42, .9);
    const ids = new Set();
    let landed = false;
    for (let t = 0; t < 1.5 && !landed; t += DT) {
      step(w, DT);
      for (const u of wolves) if (u.hopT > 0) { ids.add(u.id); assert.equal(u.state, 'ok', 'kein Abheben'); assert.ok(u.vz === 0 && u.z === 0); }
      if (!w.proj.includes(p)) landed = true;
      // Stand im Schritt des Einschlags (vor dem Schleudern zählt der Stoß der Explosion nicht)
      if (!landed) for (const u of wolves) if (u.hopT > 0 && p.t >= p.dur - DT * 1.5) {
        assert.ok(Math.hypot(u.x - 450, u.y - 300) > 42 + u.T.r, `Wolf ${u.id} ist draußen`);
      }
      w.events.length = 0;
    }
    hopped += ids.size;
  }
  assert.ok(Math.abs(hopped / 80 - .6) < .12, `gehüpft: ${hopped}/80`);
  assert.ok(LAUNCH_VZ > 0);
});

test('Ausweichen endet nie in Lava: versperrte Richtung wird gedreht, rundum Lava: kein Hüpfer', () => {
  const lava = TERRAIN.lava.id;
  let hops = 0;
  for (let k = 0; k < 30; k++) {
    const w = mk(400 + k), src = spawn(w, 'grenadier', 100, 300, 'rot'); src.cd = 1e9;
    // Lava rechts vom Wolf (die Richtung vom Einschlag weg) und darunter
    for (let gy = 0; gy < w.GH; gy++) for (let gx = 0; gx < w.GW; gx++) {
      const x = gx * 10 + 5, y = gy * 10 + 5;
      if ((x > 465 && x < 560 && y > 220 && y < 380) || (y > 330 && y < 400 && x > 380 && x < 560)) w.terr[gy * w.GW + gx] = lava;
    }
    touchTerrain(w);
    touchTerrain(w);
  const u = spawn(w, 'wolf', 455, 300, 'blau'); u.cd = 1e9; u.T = Object.assign(Object.create(Object.getPrototypeOf(u.T)), u.T, { dodge: 1 });
    rebuildHash(w);
    const p = lob(w, 'bomb', src, 440, 300, 42);
    rollDodges(w, p);
    if (w.events.some(e => e.type === 'dodge')) hops++;
    for (let t = 0; t < 1; t += DT) { step(w, DT); w.events.length = 0; if (!u.alive) break; assert.notEqual(w.terr[cellIndex(w, u.x, u.y)], lava, 'nie auf Lava'); }
  }
  assert.ok(hops >= 25, `trotz Lava gehüpft: ${hops}`);
  // rundum Lava: kein Weg hinaus, kein Hüpfer
  const w = mk(9), src = spawn(w, 'grenadier', 100, 300, 'rot');
  for (let gy = 0; gy < w.GH; gy++) for (let gx = 0; gx < w.GW; gx++) {
    const x = gx * 10 + 5, y = gy * 10 + 5, d = Math.hypot(x - 450, y - 300);
    if (d > 25 && d < 120) w.terr[gy * w.GW + gx] = lava;
  }
  touchTerrain(w);
  const u = spawn(w, 'wolf', 455, 300, 'blau'); u.T = Object.assign(Object.create(Object.getPrototypeOf(u.T)), u.T, { dodge: 1 });
  rebuildHash(w);
  rollDodges(w, lob(w, 'bomb', src, 445, 300, 42));
  assert.equal(w.events.filter(e => e.type === 'dodge').length, 0);
  assert.equal(u.hopT, 0);
});
