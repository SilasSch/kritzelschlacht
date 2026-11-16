// Reine Effekt-Logik (Task 12): Partikelspeicher mit Deckel, Budget je Bild, Wackeln je dt,
// Rauch und Staub, Bodenlicht, Ereignisse → Partikel und Decals.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FX_CAP, FRAME_LIMITS, SMOKE, DUST, LIGHT_T, LIGHT_ALPHA, SHAKE_MAX, GLOW_KINDS, CRASH_SMOKE_MUL,
  WARM_KINDS, WARM_TINT, WARM_ALPHA, HALO_ALPHA, groundWarm,
  createParticles, createFxCore, decayShake, blastShake, puffLook, groundLight, landDust, emberCount, look,
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
  assert.ok(kinds(core).fire >= 3);
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
  const t0 = performance.now();
  core.consume(ev);
  assert.ok(performance.now() - t0 < 50);
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
  assert.deepEqual([...GLOW_KINDS].sort(), ['core', 'ember', 'fire', 'flash', 'light']);
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
  assert.deepEqual([...WARM_KINDS].sort(), ['fire', 'flash', 'light']);
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
