// Reine Effekt-Logik (Task 12): Partikelspeicher mit Deckel, Budget je Bild, Wackeln je dt,
// Rauch und Staub, Bodenlicht, Ereignisse → Partikel und Decals.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FX_CAP, FRAME_LIMITS, SMOKE, DUST, LIGHT_T, LIGHT_ALPHA, SHAKE_MAX, GLOW_KINDS, CRASH_SMOKE_MUL,
  WARM_KINDS, WARM_TINT, WARM_ALPHA, HALO_ALPHA, groundWarm,
  createParticles, createFxCore, createDecalAger, decayShake, blastShake, puffLook, groundLight, landDust, emberCount, look,
} from '../game/js/render/fxcore.js';
import { HELI_CRASH_R, DRAGON_CRASH_R } from '../game/js/combat.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const DT = 1 / 60;
const kinds = core => core.store.countByKind();
const mkCore = (opt) => {
  const calls = { decal: [], crater: [] };
  const core = createFxCore({ decal: (...a) => calls.decal.push(a), crater: (...a) => calls.crater.push(a) }, opt);
  return { core, calls };
};

/* ---------- Wackeln ---------- */
test('Wackeln: Explosion min(12, R/6), Abklingen je dt statt je Bild', () => {
  near(blastShake(60), 10); near(blastShake(120), SHAKE_MAX); near(blastShake(0), 0);
  assert.equal(SHAKE_MAX, 12);
  // wie früher ×0.85 je Bild bei 60 fps ...
  near(decayShake(10, DT), 8.5, 1e-9);
  // ... aber unabhängig von der Bildrate: zwei halbe Schritte = ein ganzer
  near(decayShake(decayShake(10, DT / 2), DT / 2), decayShake(10, DT), 1e-9);
  near(decayShake(decayShake(decayShake(10, .1), .1), .1), decayShake(10, .3), 1e-9);
  assert.equal(decayShake(10, 0), 10);
  assert.equal(decayShake(10, 5), 0, 'klingt ganz ab');
});

/* ---------- Rauch, Staub, Bodenlicht ---------- */
test('Rauch: 2,5 s, steigt 20 px/s, Wind +12 px/s, wächst; Staub kürzer', () => {
  assert.equal(SMOKE.life, 2.5); assert.equal(SMOKE.rise, 20); assert.equal(SMOKE.wind, 12);
  assert.ok(SMOKE.grow > 1 && DUST.grow > 1 && DUST.life < SMOKE.life);
  const o = {};
  puffLook(0, 2.5, SMOKE.grow, SMOKE.alpha, o); near(o.scale, 1);
  puffLook(2.5, 2.5, SMOKE.grow, SMOKE.alpha, o); near(o.scale, SMOKE.grow); near(o.alpha, 0);
  let prev = 0, peak = 0;
  for (let t = 0; t <= 2.5; t += .05) {
    puffLook(t, 2.5, SMOKE.grow, SMOKE.alpha, o);
    assert.ok(o.scale >= prev - 1e-12); prev = o.scale;
    assert.ok(o.alpha >= 0 && o.alpha <= SMOKE.alpha + 1e-12); peak = Math.max(peak, o.alpha);
  }
  assert.ok(peak > SMOKE.alpha * .8, 'gut sichtbar');
});

test('Bodenlicht: Deckkraft 0,5 → 0 in 0,25 s', () => {
  assert.equal(LIGHT_T, .25); assert.equal(LIGHT_ALPHA, .5);
  near(groundLight(0), .5); near(groundLight(.125), .25); near(groundLight(.25), 0); near(groundLight(1), 0);
});

test('Staub nach Aufprall: nichts bei sanfter Landung, mehr und größer bei hartem Aufprall, gedeckelt', () => {
  const o = {};
  assert.equal(landDust(20, o).n, 0);
  const a = { ...landDust(150, o) }, b = { ...landDust(400, o) }, c = { ...landDust(5000, o) };
  assert.ok(a.n >= 1 && b.n > a.n && b.r > a.r);
  assert.ok(c.n <= 6 && c.r <= 9);
});

test('Glut je Explosion: 14–22', () => {
  for (const R of [0, 10, 30, 50, 80, 200]) { const n = emberCount(R); assert.ok(n >= 14 && n <= 22, `${R} → ${n}`); }
  assert.ok(emberCount(80) > emberCount(20));
});

/* ---------- Partikelspeicher ---------- */
test('Partikelspeicher: Deckel, verworfene zählen, altern und verschwinden, keine neuen Objekte', () => {
  const s = createParticles(5);
  for (let i = 0; i < 8; i++) s.spawn('dot', 0, 0, 1);
  assert.equal(s.count, 5); assert.equal(s.dropped, 3);
  const old = new Set(s.live);
  s.step(.5); assert.equal(s.count, 5);
  s.step(.6); assert.equal(s.count, 0);
  const p = s.spawn('dot', 0, 0, 1);
  assert.ok(old.has(p), 'aus dem Vorrat wiederverwendet');
  assert.equal(p.age, 0); assert.equal(p.vx, 0);
  s.clear(); assert.equal(s.count, 0); assert.equal(s.dropped, 0);
});

test('Partikel: Bewegung und Dämpfung je dt (bildratenunabhängig)', () => {
  const run = (dt, T) => {
    const s = createParticles(4), p = s.spawn('dot', 0, 0, 10);
    p.vx = 100; p.drag = 6;
    for (let t = 0; t < T - 1e-9; t += dt) s.step(dt);
    return p;
  };
  const a = run(1 / 60, 1), b = run(1 / 120, 1);
  near(a.vx, b.vx, 1e-6);
  near(a.vx, 100 * Math.exp(-6), 1e-6);
  const exact = 100 / 6 * (1 - Math.exp(-6));
  assert.ok(Math.abs(a.x - exact) < 1 && Math.abs(b.x - exact) < .5, `${a.x} ${b.x} ${exact}`);
});

/* ---------- Ereignisse → Effekte ---------- */
test('blast: Bodenlicht, 14–22 Glut, 6 Rauchwolken, Krater-Decal, Wackeln', () => {
  const { core, calls } = mkCore();
  core.consume([{ type: 'blast', x: 300, y: 200, R: 60, kind: 'blast', shake: 5 }]);
  const k = kinds(core);
  assert.equal(k.light, 1);
  assert.ok(k.ember >= 14 && k.ember <= 22);
  assert.equal(k.smoke, 6);
  assert.equal(calls.crater.length, 1); near(calls.crater[0][2], 60);
  near(core.shake, 10);
  const light = core.store.live.find(p => p.k === 'light');
  near(light.r, 180); near(light.life, LIGHT_T);
  for (const p of core.store.live) if (p.k === 'smoke') near(p.life, SMOKE.life);
  // klein: Wackeln nach Stärke, nicht nach e.shake
  const b = mkCore().core; b.consume([{ type: 'blast', x: 0, y: 0, R: 12, kind: 'blast', shake: 5 }]); near(b.shake, 2);
});

test('Rauch steigt 20 px/s und verweht nach rechts', () => {
  const { core } = mkCore();
  core.consume([{ type: 'blast', x: 300, y: 200, R: 40, kind: 'blast' }]);
  for (let i = 0; i < 60; i++) core.update(DT, null);
  const sm = core.store.live.filter(p => p.k === 'smoke');
  assert.equal(sm.length, 6);
  for (const p of sm) { near(p.x - p.x0, 12, 1e-6); near(p.y - p.y0, -20, 1e-6); }
  for (let i = 0; i < 100; i++) core.update(DT, null);
  assert.equal(kinds(core).smoke, undefined, 'nach 2,5 s weg');
});

test('crash: wie blast, Rauch doppelt so lang; Heli-Absturz mit eigenem blast zählt nur einmal', () => {
  const { core, calls } = mkCore();
  core.consume([{ type: 'crash', kind: 'heli', x: 400, y: 300 },
    { type: 'blast', x: 400, y: 300, R: HELI_CRASH_R, kind: 'blast', shake: 5 }]);
  const k = kinds(core);
  assert.equal(k.light, 1); assert.equal(k.smoke, 6); assert.equal(calls.crater.length, 1);
  for (const p of core.store.live) if (p.k === 'smoke') near(p.life, SMOKE.life * CRASH_SMOKE_MUL);
  assert.equal(CRASH_SMOKE_MUL, 2);
  near(core.shake, blastShake(HELI_CRASH_R));
  const d = mkCore(); d.core.consume([{ type: 'crash', kind: 'drache', x: 100, y: 100 }]);
  assert.equal(kinds(d.core).light, 1); near(d.core.store.live.find(p => p.k === 'light').r, 3 * DRAGON_CRASH_R);
  // ein anderer blast im selben Bild bleibt eigenständig
  const e = mkCore(); e.core.consume([{ type: 'crash', kind: 'heli', x: 400, y: 300 }, { type: 'blast', x: 100, y: 100, R: 40, kind: 'blast' }]);
  assert.equal(kinds(e.core).light, 2);
});

test('shot: Mündungsblitz 0,07 s bei bullet/shell/rocket, shell mit Rauchstoß; breath speit Feuer', () => {
  for (const kind of ['bullet', 'shell', 'rocket']) {
    const { core } = mkCore();
    core.consume([{ type: 'shot', kind, x: 10, y: 10, face: 1 }]);
    const k = kinds(core);
    assert.equal(k.flash, 1, kind);
    near(core.store.live.find(p => p.k === 'flash').life, .07);
    assert.equal(!!k.smoke, kind === 'shell', kind);
  }
  const { core } = mkCore();
  core.consume([{ type: 'shot', kind: 'bomb', x: 10, y: 10, face: 1 }]);
  assert.equal(core.store.count, 0);
  core.consume([{ type: 'shot', kind: 'breath', x: 10, y: 10, face: 1, nx: 1, ny: 0 }]);
  assert.ok(kinds(core).jet >= 16, 'Flammenstrahl (Spez. #21), nicht mehr 4 Punkte');
});

test('land: Staubwolke nach impact; splash: 10 Tropfen und ein Ring; Asche und Tod als Decal', () => {
  const { core, calls } = mkCore();
  core.consume([{ type: 'land', x: 0, y: 0, impact: 10 }]);
  assert.equal(core.store.count, 0);
  core.consume([{ type: 'land', x: 0, y: 0, impact: 400 }]);
  assert.equal(kinds(core).dust, landDust(400, {}).n);
  core.clear();
  core.consume([{ type: 'splash', x: 0, y: 0 }]);
  assert.equal(kinds(core).drop, 10); assert.equal(kinds(core).ring, 1);
  core.consume([{ type: 'terrain', kind: 'ash', x: 5, y: 5, gx0: 0, gy0: 0, gx1: 1, gy1: 1 }, { type: 'terrain', gx0: 0, gy0: 0, gx1: 1, gy1: 1 }]);
  assert.equal(calls.decal.length, 1);
  core.consume([{ type: 'heal', x: 0, y: 0 }, { type: 'death', x: 0, y: 0, z: 0, unitType: 'krieger' }]);
  assert.equal(kinds(core).plus, 1); assert.equal(kinds(core).soul, 1); assert.equal(calls.decal.length, 2);
});

test('Gedeckelt: 500 land-Ereignisse in einem Bild bleiben begrenzt', () => {
  const { core } = mkCore();
  const ev = [];
  for (let i = 0; i < 500; i++) ev.push({ type: 'land', x: i, y: 0, impact: 5000 });
  core.consume(ev);
  assert.ok(core.store.count <= FRAME_LIMITS.land * 6, `${core.store.count}`);
  assert.equal(core.stats().skipped.land, 500 - FRAME_LIMITS.land);
  // im nächsten Bild gibt es wieder Budget
  core.consume(ev.slice(0, 3));
  assert.equal(core.stats().skipped.land, 500 - FRAME_LIMITS.land);
});

test('Gedeckelt: 5000 Explosionen → höchstens FX_CAP Partikel und FRAME_LIMITS.decal Krater', () => {
  assert.equal(FX_CAP, 3000);
  const { core, calls } = mkCore();
  const ev = [];
  for (let i = 0; i < 5000; i++) ev.push({ type: 'blast', x: i % 900, y: 100, R: 60, kind: 'blast' });
  core.consume(ev);
  assert.ok(core.store.count <= FX_CAP);
  assert.ok(calls.crater.length <= FRAME_LIMITS.decal);
  assert.ok(kinds(core).light <= FRAME_LIMITS.blast);
  near(core.shake, 10);
  for (let i = 0; i < 4; i++) core.consume(ev);
  assert.ok(core.store.count <= FX_CAP);
});

test('Flugspuren: Rakete raucht (normal), Feuerball glüht', () => {
  const { core } = mkCore({ rand: () => .01 });   // jedes Bild eine Spur
  const world = { proj: [
    { kind: 'rocket', arc: false, x: 0, y: 0, x0: 0, y0: 0, sx: 0, sy: 0, z: 6, z0: 6, zt: 6, el: 1, nx: 1, ny: 0 },
    { kind: 'fire', arc: false, x: 50, y: 0, x0: 50, y0: 0, sx: 50, sy: 0, z: 6, z0: 6, zt: 6, el: 1, nx: 1, ny: 0 },
  ] };
  for (let i = 0; i < 60; i++) core.update(DT, world);
  const k = kinds(core);
  assert.ok(k.smoke > 40, `smoke ${k.smoke}`); assert.ok(k.fire >= 10, `fire ${k.fire}`);
});

test('Aussehen: Glühen (additiv) nur bei Feuer, Explosion, Mündungsblitz und Bodenlicht; Rauch grau und normal', () => {
  // Spez. #21: Flammenstrahl (jet, spark) und brennende Einheiten (flame) sind Feuer
  assert.deepEqual([...GLOW_KINDS].sort(), ['core', 'ember', 'fire', 'flame', 'flash', 'jet', 'light', 'spark']);
  const { core } = mkCore();
  core.consume([
    { type: 'blast', x: 0, y: 0, R: 40, kind: 'blast' }, { type: 'blast', x: 0, y: 0, R: 40, kind: 'fire' },
    { type: 'shot', kind: 'shell', x: 0, y: 0, face: 1 }, { type: 'splash', x: 0, y: 0 }, { type: 'land', x: 0, y: 0, impact: 400 },
    { type: 'heal', x: 0, y: 0 }, { type: 'death', x: 0, y: 0, unitType: 'krieger' }, { type: 'charge', x: 0, y: 0 },
    { type: 'miss', kind: 'arrow', x: 0, y: 0, a: 1 }, { type: 'hit', x: 0, y: 0, flank: true },
  ]);
  core.update(.02, null);
  const o = {};
  const seen = new Set();
  for (const p of core.store.live) {
    look(p, o); seen.add(p.k);
    if (o.gAlpha > 0) assert.ok(GLOW_KINDS.has(p.k), `${p.k} glüht`);
    if (p.k === 'smoke') {
      assert.ok(o.alpha > 0); assert.equal(o.gAlpha, 0);
      const r = o.tint >> 16, g = o.tint >> 8 & 255, b = o.tint & 255;
      assert.ok(Math.abs(r - g) < 24 && Math.abs(g - b) < 24 && r < 200, 'grau');
    }
    if (p.k === 'light') { assert.equal(o.alpha, 0); assert.ok(o.gLight); }
  }
  for (const k of ['light', 'ember', 'fire', 'smoke', 'flash', 'core', 'drop', 'ring', 'dust', 'plus', 'soul', 'arrow', 'dot']) assert.ok(seen.has(k), k);
});

// Ruling: das Bodenlicht muss auch auf Weiß sichtbar sein: warme Scheibe (normal) unter dem additiven Licht
test('Warmes Bodenlicht (normal): #ffb347, Deckkraft 0,35 → 0 in 0,25 s, Radius 3·R; danach nichts', () => {
  assert.equal(WARM_TINT, 0xffb347); assert.equal(WARM_ALPHA, .35);
  near(groundWarm(0), .35); near(groundWarm(.125), .175); near(groundWarm(LIGHT_T), 0); near(groundWarm(3), 0);
  let prev = 1;
  for (let t = 0; t <= .3; t += .01) { const a = groundWarm(t); assert.ok(a <= prev + 1e-12 && a >= 0); prev = a; }
  const { core } = mkCore();
  core.consume([{ type: 'blast', x: 0, y: 0, R: 50, kind: 'blast' }]);
  const o = {}, l = core.store.live.find(p => p.k === 'light');
  look(l, o);
  assert.ok(o.wGround); assert.equal(o.wTint, WARM_TINT); near(o.wR, 150); near(o.wAlpha, .35);
  l.age = LIGHT_T * .999; look(l, o); assert.ok(o.wAlpha < .01, 'klingt ganz ab');
});

test('Warmer Halo (normal) nur bei Mündungsblitz und Feuer: 2–3× so groß, Deckkraft ≤ 0,25, kurz', () => {
  assert.deepEqual([...WARM_KINDS].sort(), ['fire', 'flame', 'flash', 'jet', 'light']);
  assert.equal(HALO_ALPHA, .25);
  const { core } = mkCore();
  core.consume([{ type: 'shot', kind: 'bullet', x: 0, y: 0, face: 1 }, { type: 'burn', x: 0, y: 0 },
    { type: 'blast', x: 0, y: 0, R: 40, kind: 'blast' }, { type: 'splash', x: 0, y: 0 }, { type: 'death', x: 0, y: 0, unitType: 'krieger' }]);
  const o = {};
  for (const p of core.store.live) {
    look(p, o);
    if (!WARM_KINDS.has(p.k)) { assert.equal(o.wAlpha, 0, p.k); continue; }
    if (p.k === 'light') continue;
    assert.ok(!o.wGround);
    const core0 = p.k === 'flash' ? p.r : o.r;
    assert.ok(o.wR >= 2 * core0 - 1e-9 && o.wR <= 3 * p.r + 1e-9, `${p.k} ${o.wR}`);
    assert.ok(o.wAlpha > 0 && o.wAlpha <= HALO_ALPHA + 1e-12);
    p.age = p.life; look(p, o); near(o.wAlpha, 0);
  }
});

test('clear setzt alles zurück', () => {
  const { core } = mkCore();
  core.consume([{ type: 'blast', x: 0, y: 0, R: 60, kind: 'blast' }]);
  core.clear();
  assert.equal(core.store.count, 0); assert.equal(core.shake, 0);
});

/* ---------- Boss-Effekte (Task 12c): Abgas beim Anfahren, Rotorwind, Flügelböen ---------- */
test('Boss-Effekte: Panzer stößt nur beim Anfahren Abgas aus, Heli wirft Rotorwind-Staub, gedeckelt je Bild', async () => {
  const F = await import('../game/js/render/fxcore.js');
  const { UNITS } = await import('../game/js/data.js');
  const unit = (type, o = {}) => ({ type, T: UNITS[type], alive: true, state: 'ok', x: 300, y: 300, z: 0, mx: 0, my: 0, vx: 0, vy: 0, face: 1, burnT: 0, ...o });
  const run = (core, world, n) => { for (let i = 0; i < n; i++) core.update(DT, world); };
  // fester Zufall: das Ergebnis hängt nicht vom Glück ab
  const seeded = (seed = 7) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const mkC = () => mkCore({ rand: seeded() });
  // steht → fährt an: Abgaswölkchen am Heck (hinter dem Panzer), nach EXHAUST_T keine neuen mehr
  const { core } = mkC();
  const tank = unit('panzer'), world = { proj: [], units: [tank] };
  run(core, world, 30);
  assert.equal(kinds(core).exhaust, undefined, 'im Stand kein Abgas');
  tank.mx = UNITS.panzer.speed;
  run(core, world, Math.round(F.EXHAUST_T / DT));
  const ex = core.store.live.filter(p => p.k === 'exhaust');
  assert.ok(ex.length >= 3, `Abgas ${ex.length}`);
  for (const p of ex) assert.ok(p.x0 < tank.x - UNITS.panzer.r, 'am Heck');
  run(core, world, 20);
  assert.equal(core.store.live.filter(p => p.k === 'exhaust' && p.age < 20 * DT - 1e-9).length, 0, 'nur beim Anfahren');
  // anhalten und wieder anfahren: wieder ein Stoß
  tank.mx = 0; run(core, world, 5); tank.mx = -UNITS.panzer.speed; tank.face = -1; run(core, world, 10);
  const ex2 = core.store.live.filter(p => p.k === 'exhaust' && p.age < 10 * DT + 1e-6);
  assert.ok(ex2.length >= 1, 'erneut');
  for (const p of ex2) assert.ok(p.x0 > tank.x + UNITS.panzer.r, 'Heck rechts bei Blick nach links');
  // gleich nach dem Aufstellen losfahren (zuerst gesehen schon fahrend) pufft auch: Abgas genau EXHAUST_T lang
  const c2 = mkC().core, t2 = unit('panzer', { mx: 30 });
  run(c2, { proj: [], units: [t2] }, 40);
  const ages = c2.store.live.filter(p => p.k === 'exhaust').map(p => p.age);
  assert.ok(ages.length >= 3 && Math.min(...ages) >= 40 * DT - F.EXHAUST_T - DT - 1e-6, `nur am Anfang ${ages.length}`);
  // Heli: Staubring am Boden unter ihm (nicht in Flughöhe), zart
  const c3 = mkC().core, h = unit('heli', { z: UNITS.heli.flyZ });
  run(c3, { proj: [], units: [h] }, 60);
  const wash = c3.store.live.filter(p => p.k === 'wash');
  assert.ok(wash.length >= 3, `Rotorwind ${wash.length}`);
  for (const p of wash) assert.ok(p.y0 > h.y, 'am Boden');
  const o = {};
  for (const p of wash) { look(p, o); assert.ok(o.alpha <= F.WASH.alpha + 1e-9); }
  // Budget: höchstens BOSS_FX_UNITS Bosse je Bild, reihum
  const c4 = mkC().core, many = [];
  for (let i = 0; i < F.BOSS_FX_UNITS * 3; i++) many.push(unit('heli', { z: 46, x: 10 * i }));
  c4.update(DT, { proj: [], units: many });
  assert.equal(c4.stats().bosses, F.BOSS_FX_UNITS); assert.equal(c4.stats().bossesAll, F.BOSS_FX_UNITS * 3);
  // Drache: gelegentliche Flügelböen am Boden
  const c5 = mkC().core, d = unit('drache', { z: UNITS.drache.flyZ });
  let gusts = 0;
  for (let i = 0; i < 240; i++) { c5.update(DT, { proj: [], units: [d] }); gusts = Math.max(gusts, kinds(c5).wash || 0); }
  assert.ok(gusts >= 1, 'Flügelböen');
});

test('Decal-Generationen', () => {
  const a = createDecalAger(30);
  assert.equal(a.tick(29), false);
  assert.equal(a.tick(2), true); assert.equal(a.oldAlpha(), 1);
  assert.equal(a.tick(15), false); near(a.oldAlpha(), .5);
  assert.equal(a.tick(15), true); assert.equal(a.oldAlpha(), 1);
  a.tick(10); a.reset();
  assert.equal(a.oldAlpha(), 0); assert.equal(a.tick(29), false); assert.equal(a.tick(2), true);
});

/* ---------- Römer (Spez. #25, Task 4) ---------- */
test('block erzeugt Funken innerhalb des misc-Budgets', async () => {
  const { BLOCK_FX, F } = await import('../game/js/render/fxcore.js');
  const { core } = mkCore();
  const a = .7;
  core.consume([{ type: 'block', x: 10, y: 20, kind: 'arrow', a }]);
  const k = kinds(core);
  assert.equal(k.spark, BLOCK_FX.sparks, 'kleiner Funke');
  assert.equal(k.glint, 1, 'Querstrich am Schild');
  assert.equal(k.shard, 1, 'Splitter');
  const live = core.store.live, o = {};
  const g = live.find(p => p.k === 'glint'), s = live.find(p => p.k === 'shard');
  near(g.x, 10); near(g.y, 20);
  near(g.rot, a + Math.PI / 2);   // quer zur Abprallrichtung
  // Splitter fliegt in Richtung a (dazu ein kleiner Hüpfer nach oben)
  const sp = s.vx / Math.cos(a);
  assert.ok(sp > 0, 'in Richtung a');
  near(s.vy + BLOCK_FX.shardUp, sp * Math.sin(a), 1e-6);
  // Funke glüht wie Funken sonst; Querstrich und Splitter sind normal gemischt und sichtbar
  look(g, o); assert.equal(o.frame, F.streak); assert.equal(o.gAlpha, 0); assert.ok(o.alpha > 0);
  look(s, o); assert.equal(o.frame, F.streak); assert.equal(o.gAlpha, 0);
  // Kugeln geben graue Splitter, Pfeil und Speer Holz
  core.clear();
  core.consume([{ type: 'block', x: 0, y: 0, kind: 'bullet', a: 0 }, { type: 'block', x: 0, y: 0, kind: 'pilum', a: 0 }]);
  const cols = core.store.live.filter(p => p.k === 'shard').map(p => p.col);
  assert.equal(cols.length, 2); assert.notEqual(cols[0], cols[1]);
  // Budget misc: 500 Blocks in einem Bild
  core.clear();
  const ev = [];
  for (let i = 0; i < 500; i++) ev.push({ type: 'block', x: i, y: 0, kind: 'arrow', a: 0 });
  core.consume(ev);
  assert.equal(core.stats().skipped.misc, 500 - FRAME_LIMITS.misc);
  assert.equal(kinds(core).glint, FRAME_LIMITS.misc);
  assert.ok(core.store.count <= FRAME_LIMITS.misc * (BLOCK_FX.sparks + 2));
});

test('Speer: steckt nach dem Fehlwurf als eigener Speer im Boden (nicht als Pfeil)', async () => {
  const { F, FRAME_R } = await import('../game/js/render/fxcore.js');
  const { core } = mkCore();
  core.consume([{ type: 'miss', kind: 'pilum', x: 5, y: 6, a: 0 }, { type: 'miss', kind: 'arrow', x: 5, y: 6, a: 0 }]);
  const k = kinds(core);
  assert.equal(k.pilum, 1); assert.equal(k.arrow, 1);
  const p = core.store.live.find(q => q.k === 'pilum'), o = {};
  look(p, o);
  assert.equal(o.frame, F.pilum); assert.equal(o.ax, 1, 'Spitze am Landepunkt');
  assert.ok(o.rot > 0 && o.rot < Math.PI / 2, `steckt schräg im Boden ${o.rot}`);
  // gezeichnete Länge (Maßstab r / FRAME_R, beide Bilder füllen ihr Feld fast ganz): deutlich länger als der Pfeil
  const ar = look(core.store.live.find(q => q.k === 'arrow'), {});
  assert.ok(o.r / FRAME_R[F.pilum] > 1.6 * ar.r / FRAME_R[F.arrow], 'länger als der Pfeil');
  assert.equal(FRAME_R.length, Object.keys(F).length);
});
