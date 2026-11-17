// Reine Darstellungs-Mathematik der Physik (Task 11): Drehen in der Luft, Taumeln, Schatten nach Höhe,
// Aussehen der Leichen, Bildschirmlage der Geschosse, Geräusche zu Ereignissen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { poseUnit, shadowParams, corpseLook, projScreen, STUN_WOBBLE, AIR_LEAN, FLIP_V, REST_SY, REST_TINT, ASH_TINT } from '../game/js/render/pose.js';
import { UNITS } from '../game/js/data.js';
import { createWorld, spawn, rebuildHash } from '../game/js/world.js';
import { fire, stepProjectiles, MUZZLE_Z } from '../game/js/combat.js';
import { GRAVITY, makeCorpse, CORPSE_FADE, SINK_T, ASH_T } from '../game/js/physics.js';
import { eventSound, IMPACT_SOUND_V } from '../game/js/audio.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const TAU = Math.PI * 2;
const mk = (type = 'krieger', o = {}) => ({
  id: 1, type, T: UNITS[type], x: 100, y: 100, z: 0, mx: 0, my: 0, vx: 0, vy: 0, vz: 0, face: 1,
  state: 'ok', stunT: 0, hitT: 0, fireT: 1, swingT: 0, seed: 0, tg: null, ...o,
});

/* ---------- Pose: Luft und Betäubung ---------- */
test('Am Boden: kein Drehen, nicht in der Luft, nicht benommen', () => {
  const p = poseUnit(mk('krieger', { mx: 52 }), 1.3);
  assert.equal(p.spin, 0); assert.equal(p.air, false); assert.equal(p.dizzy, false);
  const q = poseUnit(mk('heli'), 2);
  assert.equal(q.spin, 0); assert.equal(q.air, false);
});

test('In der Luft: ein voller Überschlag je Flug, Richtung nach vx', () => {
  const v0 = 300, apex = v0 * v0 / (2 * GRAVITY);
  near(poseUnit(mk('krieger', { state: 'air', vz: v0, vx: 100 }), 0).spin, 0);
  near(poseUnit(mk('krieger', { state: 'air', vz: 0, z: apex, vx: 100 }), 0).spin, Math.PI);
  near(poseUnit(mk('krieger', { state: 'air', vz: -v0, z: 0, vx: 100 }), 0).spin, TAU);
  near(poseUnit(mk('krieger', { state: 'air', vz: 0, z: apex, vx: -100 }), 0).spin, -Math.PI);
  // stetig und monoton über einen echten Flug
  const u = mk('krieger', { state: 'air', vz: v0, vx: 80 });
  let prev = 0;
  for (let k = 0; k < 200 && !(u.z <= 0 && u.vz < 0); k++) {
    const s = poseUnit(u, 0).spin;
    assert.ok(s >= prev - 1e-9 && s - prev < .2, `Sprung ${prev} → ${s}`); prev = s;
    u.vz -= GRAVITY / 60; u.z += u.vz / 60;
  }
  assert.ok(prev > TAU * .9, `fast ganz herum (${prev})`);
  const p = poseUnit(mk('krieger', { state: 'air', vz: 10, z: 30 }), 0);
  assert.equal(p.air, true); assert.equal(p.sx, 1); assert.equal(p.sy, 1);
});

test('Kleiner Hüpfer (unter FLIP_V): nur Kippen hin und zurück', () => {
  const v0 = FLIP_V * .5, apex = v0 * v0 / (2 * GRAVITY);
  near(poseUnit(mk('krieger', { state: 'air', vz: v0, vx: 50 }), 0).spin, 0);
  near(poseUnit(mk('krieger', { state: 'air', vz: 0, z: apex, vx: 50 }), 0).spin, AIR_LEAN);
  near(poseUnit(mk('krieger', { state: 'air', vz: -v0, z: 0, vx: -50 }), 0).spin, 0);
  near(poseUnit(mk('krieger', { state: 'air', vz: 0, z: apex, vx: -50 }), 0).spin, -AIR_LEAN);
});

test('Betäubt: leichtes Wackeln, benommen, Pupillen kreisen', () => {
  let lo = Infinity, hi = -Infinity;
  for (let t = 0; t < 2; t += .01) {
    const p = poseUnit(mk('krieger', { state: 'stun', stunT: .5, tg: { x: 200, y: 100 } }), t);
    assert.equal(p.dizzy, true); assert.equal(p.air, false);
    assert.ok(Math.abs(p.spin) <= STUN_WOBBLE + 1e-9);
    near(Math.hypot(p.lookX, p.lookY), .35);
    lo = Math.min(lo, p.spin); hi = Math.max(hi, p.spin);
  }
  assert.ok(hi - lo > STUN_WOBBLE, 'wackelt');
});

test('poseUnit bleibt rein mit Luftzustand', () => {
  const u = mk('soldat', { state: 'air', vz: 120, z: 20, vx: -40 });
  const before = JSON.stringify(u);
  assert.deepEqual(poseUnit(u, 1.1), poseUnit(u, 1.1));
  assert.equal(JSON.stringify(u), before);
});

/* ---------- Schatten ---------- */
// R13 (Spez. #14): Schatten wachsen mit der Höhe und werden weicher und blasser
test('Schatten: Größe 1 + min(z/200, .6), Deckkraft .13 · (1 − .5 · min(z/200, 1)), 3 Stufen nach z', () => {
  const s = {};
  shadowParams(0, s); near(s.scale, 1); near(s.alpha, .13); assert.equal(s.level, 0);
  shadowParams(100, s); near(s.scale, 1.5); near(s.alpha, .0975); assert.equal(s.level, 2);
  shadowParams(200, s); near(s.scale, 1.6); near(s.alpha, .065);
  shadowParams(1000, s); near(s.scale, 1.6); near(s.alpha, .065);
  shadowParams(-5, s); near(s.scale, 1); near(s.alpha, .13); assert.equal(s.level, 0);
  let grow = 0;
  for (let z = 0; z < 300; z += 1) { const k = shadowParams(z, s).scale; assert.ok(k >= grow - 1e-12, 'wächst'); grow = k; }
  // Stufen: Bienen/Geister weich, Heli/Drache sehr weich
  assert.equal(shadowParams(UNITS.biene.flyZ, s).level, 1);
  assert.equal(shadowParams(UNITS.geist.flyZ, s).level, 1);
  assert.equal(shadowParams(UNITS.heli.flyZ, s).level, 2);
  assert.equal(shadowParams(UNITS.drache.flyZ, s).level, 2);
  assert.equal(shadowParams(3, s).level, 0);
  let prev = 2;
  for (let z = 0; z < 300; z += 1) { const a = shadowParams(z, s).alpha; assert.ok(a <= prev + 1e-12); prev = a; }
});

/* ---------- Leichen ---------- */
const corpse = (o = {}) => Object.assign(makeCorpse('body', null, 'krieger', 'blau', 1, 100, 100, 0, 0, 0, 0, .4, 0), o);

test('Leiche fliegt: volle Größe, keine Tönung, dreht mit rot', () => {
  const L = corpseLook(corpse({ state: 'fly', z: 20, rot: 1.2 }), 0, {});
  near(L.sy, 1); assert.equal(L.tint, 0xffffff); near(L.alpha, 1); near(L.rot, 1.2); near(L.dy, 0);
});

test('Ruhende Leiche: flach gedrückt auf .55, grau getönt, kurze Quetschung beim Liegenbleiben', () => {
  assert.equal(REST_SY, .55); assert.equal(REST_TINT, 0xbfbfc4);
  const a = corpseLook(corpse({ state: 'rest', t: 0 }), 0, {});
  near(a.sy, 1); assert.equal(a.tint, REST_TINT);
  const b = corpseLook(corpse({ state: 'rest', t: 5 }), 0, {});
  near(b.sy, .55); near(b.alpha, 1); near(b.rot, .4);
  let prev = 2;
  for (let t = 0; t < .5; t += .01) { const s = corpseLook(corpse({ state: 'rest', t }), 0, {}).sy; assert.ok(s <= prev + 1e-12 && s >= .55 - 1e-12); prev = s; }
});

test('fade wird zur Deckkraft', () => {
  near(corpseLook(corpse({ state: 'rest', t: 9, fade: CORPSE_FADE / 2 }), 0, {}).alpha, .5);
  near(corpseLook(corpse({ state: 'rest', t: 9, fade: CORPSE_FADE }), 0, {}).alpha, 1);
});

test('Wasser: float wippt, sink verblasst und sinkt; Lava: ash dunkel und verblasst', () => {
  const ys = new Set();
  for (let t = 0; t < 2; t += .1) {
    const L = corpseLook(corpse({ state: 'float', t: 1 }), t, {});
    near(L.sy, .55); near(L.alpha, 1); ys.add(L.dy.toFixed(3));
  }
  assert.ok(ys.size > 5, 'wippt');
  near(corpseLook(corpse({ state: 'sink', t: 0 }), 0, {}).alpha, 1, 1e-9);
  near(corpseLook(corpse({ state: 'sink', t: SINK_T / 2 }), 0, {}).alpha, .5, 1e-9);
  near(corpseLook(corpse({ state: 'sink', t: SINK_T }), 0, {}).alpha, 0, 1e-9);
  assert.ok(corpseLook(corpse({ state: 'sink', t: SINK_T * .9 }), 0, {}).dy > corpseLook(corpse({ state: 'sink', t: 0 }), 0, {}).dy);
  const ash = corpseLook(corpse({ state: 'ash', t: ASH_T / 4 }), 0, {});
  assert.equal(ash.tint, ASH_TINT); near(ash.alpha, .75);
  near(corpseLook(corpse({ state: 'ash', t: ASH_T }), 0, {}).alpha, 0);
});

/* ---------- Geschosse ---------- */
const DT = 1 / 60;
test('Bögen: Bildschirm-y = y − z (Pfeil auf Flieger steigt zur Zielhöhe), Winkel folgt der Bahn', () => {
  const w = createWorld(1400, 800, 3); w.teamMode = true;
  const s = spawn(w, 'grenadier', 300, 300, 'blau'), t = spawn(w, 'krieger', 450, 300, 'rot');
  rebuildHash(w); fire(w, s, t, 'bomb');
  const p = w.proj[0], o = {};
  for (let k = 0; k < 30; k++) stepProjectiles(w, DT);
  projScreen(p, o); near(o.x, p.x); near(o.y, p.y - p.z);
  assert.ok(p.z > 0);
  const w2 = createWorld(1400, 800, 3); w2.teamMode = true;
  const a = spawn(w2, 'schuetze', 300, 300, 'blau'), h = spawn(w2, 'heli', 450, 300, 'rot');
  rebuildHash(w2); fire(w2, a, h, 'arrow');
  const q = w2.proj[0];
  q.t = q.dur; projScreen(q, o);
  near(o.y, q.y1 - h.z, 1e-6);   // am Ende in Zielhöhe
  q.t = 0; projScreen(q, o); near(o.y, q.y0);
  assert.ok(Math.sin(o.a) < 0, 'steigt am Anfang');
  q.t = q.dur * .999; projScreen(q, o);
  assert.ok(Math.cos(o.a) > 0);
});

test('Gerade Schüsse: am Boden wie bisher (Mündung), vom Flieger aus seiner Höhe schräg nach unten', () => {
  const w = createWorld(1400, 800, 3); w.teamMode = true;
  const s = spawn(w, 'soldat', 300, 300, 'blau'), t = spawn(w, 'krieger', 480, 300, 'rot');
  rebuildHash(w); fire(w, s, t, 'bullet', 480, 300);
  const p = w.proj[0], o = {};
  stepProjectiles(w, DT); stepProjectiles(w, DT);
  const q = p.t / p.dur;
  projScreen(p, o);
  near(o.x, p.x0 + (p.x1 - p.x0) * q, 1e-6); near(o.y, p.y0 + (p.y1 - p.y0) * q, 1e-6);
  near(o.a, 0, 1e-9);
  const w2 = createWorld(1400, 800, 3); w2.teamMode = true;
  const h = spawn(w2, 'heli', 300, 300, 'blau'), g = spawn(w2, 'krieger', 500, 300, 'rot');
  rebuildHash(w2); fire(w2, h, g, 'bullet', 500, 300);
  const b = w2.proj[0];
  projScreen(b, o);
  near(o.y, b.y0 - (h.z - MUZZLE_Z), 1e-6);   // Mündung in Flughöhe
  assert.ok(Math.sin(o.a) > 0, 'zeigt nach unten');
});

/* ---------- Geräusche ---------- */
test('eventSound: land/impact nach Aufprall, splash, crash; sonst nichts', () => {
  assert.equal(eventSound({ type: 'land', impact: 100 }), 'land');
  assert.equal(eventSound({ type: 'land', impact: IMPACT_SOUND_V + 1 }), 'impact');
  assert.equal(eventSound({ type: 'splash' }), 'splash');
  assert.equal(eventSound({ type: 'crash', kind: 'heli' }), 'crash');
  assert.equal(eventSound({ type: 'crash', kind: 'drache' }), 'crash');
  assert.equal(eventSound({ type: 'sound', k: 'boom' }), 'boom');
  assert.equal(eventSound({ type: 'blast' }), null);
  assert.equal(eventSound({ type: 'death' }), null);
  // Schildblock: der Ton kommt als sound-Ereignis 'clink' aus combat.shieldHit, nicht doppelt über block
  assert.equal(eventSound({ type: 'block', kind: 'arrow', a: 0 }), null);
});
