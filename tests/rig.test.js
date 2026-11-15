import test from 'node:test';
import assert from 'node:assert/strict';
import { poseUnit, RIG_PARTS } from '../game/js/render/rig.js';
import { UNITS } from '../game/js/data.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const mk = (type = 'krieger', o = {}) => ({
  id: 1, type, T: UNITS[type], x: 100, y: 100, mx: 0, my: 0, vx: 0, vy: 0, face: 1,
  hitT: 0, fireT: 1, swingT: 0, seed: 0, tg: null, ...o,
});
const samples = (t0, t1, dt, fn) => { for (let t = t0; t < t1; t += dt) fn(t); };

test('RIG_PARTS: feste Teile-Liste', () => {
  assert.deepEqual(RIG_PARTS, ['shadow', 'body', 'pupilL', 'pupilR', 'lid', 'headgear', 'weapon']);
});

test('Laufen: Squash & Stretch hält die Fläche (sx*sy≈1) und schwingt', () => {
  const u = mk('krieger', { mx: UNITS.krieger.speed });
  let lo = Infinity, hi = -Infinity;
  samples(0, 2, .001, t => {
    const p = poseUnit(u, t);
    lo = Math.min(lo, p.sy); hi = Math.max(hi, p.sy);
    near(p.sx * p.sy, 1);
    assert.ok(p.sy >= .92 - 1e-9 && p.sy <= 1.08 + 1e-9, `sy ${p.sy}`);
  });
  assert.ok(lo < .921 && hi > 1.079, `Pendelbereich ${lo}..${hi}`);
  // im Stand kein Federn
  const idle = poseUnit(mk('krieger'), .37);
  assert.equal(idle.sx, 1); assert.equal(idle.sy, 1); assert.equal(idle.bob, 0);
});

test('Neigung folgt der Laufrichtung, max 0.12 rad', () => {
  const sp = UNITS.soldat.speed;
  near(poseUnit(mk('soldat', { mx: sp }), 1).tilt, .12);
  near(poseUnit(mk('soldat', { mx: -sp, face: -1 }), 1).tilt, -.12);
  near(poseUnit(mk('soldat', { mx: sp / 2, my: sp / 2 }), 1).tilt, .06);
  near(poseUnit(mk('soldat', { mx: sp * 3 }), 1).tilt, .12);
  near(poseUnit(mk('soldat', { mx: 0, my: sp }), 1).tilt, 0);
  // Rückstoß (vx) zählt nicht als Laufen
  near(poseUnit(mk('soldat', { vx: 200 }), 1).tilt, 0);
});

test('Treffer drückt zusammen: hitT>0 → sx=1.15, sy=0.85', () => {
  for (const t of [0, .13, .5, 1.7]) {
    const p = poseUnit(mk('krieger', { hitT: .1, mx: 52 }), t);
    near(p.sx, 1.15); near(p.sy, .85);
  }
  const q = poseUnit(mk('baer', { hitT: .001 }), 3);
  near(q.sx, 1.15); near(q.sy, .85);
  const r = poseUnit(mk('krieger', { hitT: 0 }), 3);
  near(r.sx, 1); near(r.sy, 1);
});

test('Rückstoß: fireT<0.12 → recoil = 3*(1-fireT/0.12), sonst 0', () => {
  near(poseUnit(mk('soldat', { fireT: 0 }), 0).recoil, 3);
  near(poseUnit(mk('soldat', { fireT: .03 }), 0).recoil, 2.25);
  near(poseUnit(mk('soldat', { fireT: .06 }), 0).recoil, 1.5);
  near(poseUnit(mk('soldat', { fireT: .12 }), 0).recoil, 0);
  near(poseUnit(mk('soldat', { fireT: .5 }), 0).recoil, 0);
});

test('Blinzeln: blink true genau für 0.12 s je 3.2 s, Phase über u.seed versetzt', () => {
  const dt = .0005;
  for (const seed of [0, 1.7, 9.99]) {
    const u = mk('krieger', { seed });
    let on = 0, starts = 0, prev = poseUnit(u, -dt).blink;
    samples(0, 3.2 * 3, dt, t => {
      const b = poseUnit(u, t).blink;
      if (b) on += dt;
      if (b && !prev) starts++;
      prev = b;
    });
    near(on, .36, 3 * dt);
    assert.equal(starts, 3);
  }
  // gleiche Zeit, anderer Seed → andere Phase
  const a = mk('krieger', { seed: 0 }), b = mk('krieger', { seed: 1 });
  assert.equal(poseUnit(a, .05).blink, true);
  assert.equal(poseUnit(b, .05).blink, false);
  assert.equal(poseUnit(b, 2.25).blink, true);
  assert.equal(poseUnit(a, 2.25).blink, false);
});

test('Pupillen schauen zum Ziel: |look| = 0.35, Richtung = Ziel', () => {
  const tg = { x: 130, y: 140 };
  const p = poseUnit(mk('krieger', { tg }), 0);
  near(Math.hypot(p.lookX, p.lookY), .35);
  near(p.lookX, .35 * .6); near(p.lookY, .35 * .8);
  const q = poseUnit(mk('krieger', { tg: { x: 40, y: 100 }, face: -1 }), 0);
  near(q.lookX, -.35); near(q.lookY, 0);
  // ohne Ziel: geradeaus in Blickrichtung
  const r = poseUnit(mk('krieger', { face: -1 }), 0);
  near(r.lookX, -.35); near(r.lookY, 0);
});

test('Schwung: swingT>0 → weaponRot sinkt linear von -1.1 auf 0', () => {
  near(poseUnit(mk('krieger', { swingT: .25 }), 0).weaponRot, -1.1);
  near(poseUnit(mk('krieger', { swingT: .125 }), 0).weaponRot, -.55);
  near(poseUnit(mk('krieger', { swingT: .05 }), 0).weaponRot, -.22);
  near(poseUnit(mk('krieger', { swingT: 0 }), 0).weaponRot, 0);
  let prev = -Infinity;
  for (let s = .25; s >= 0; s -= .01) {
    const w = poseUnit(mk('krieger', { swingT: s }), 0).weaponRot;
    assert.ok(w >= prev - 1e-12); prev = w;
  }
});

test('poseUnit ist rein: verändert u nicht, gleiche Eingabe gleiche Pose, out wird wiederverwendet', () => {
  const u = mk('wolf', { mx: 40, my: -20, hitT: .05, fireT: .02, swingT: .1, seed: 3.3, tg: { x: 1, y: 2 } });
  const before = JSON.stringify(u);
  const a = poseUnit(u, 4.2), b = poseUnit(u, 4.2);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(u), before);
  const out = {};
  assert.equal(poseUnit(u, 4.2, out), out);
  assert.deepEqual(out, a);
});

test('Bildwechsel: Bodentruppen im Stand Bild 0, Flieger flattern immer', () => {
  assert.equal(poseUnit(mk('krieger'), 1.234).frame, 0);
  const seen = new Set(), walk = new Set();
  samples(0, 1, .01, t => { seen.add(poseUnit(mk('drache'), t).frame); walk.add(poseUnit(mk('krieger', { mx: 52 }), t).frame); });
  assert.deepEqual([...seen].sort(), [0, 1]);
  assert.deepEqual([...walk].sort(), [0, 1]);
});

test('Rig-Aufbau: Teile pro Typ (ohne Waffe/Kopfbedeckung bleiben sie leer)', async () => {
  const { rigLayout } = await import('../game/js/render/rig.js');
  const { TINT } = await import('../game/js/data.js');
  for (const t of Object.keys(UNITS)) {
    const L = rigLayout(t);
    assert.deepEqual(Object.keys(L), RIG_PARTS, t);
    assert.ok(L.body && L.shadow, `${t}: Körper und Schatten`);
    assert.equal(L.shadow.variants, 5, `${t}: Teamring je Team`);
    assert.equal(L.body.variants, TINT.has(t) || t === 'ritter' ? 5 : 1, `${t}: Teamfarbe`);
    assert.equal(!!L.pupilL, !!L.pupilR, t);
  }
  const L = rigLayout;
  assert.equal(L('ritter').pupilL, null); assert.equal(L('ritter').lid, null);   // Visier
  assert.equal(L('biene').pupilL, null);
  assert.ok(L('geist').pupilL && L('geist').lid);
  assert.equal(L('heli').headgear.frames, 2);      // Hauptrotor
  assert.ok(L('panzer').weapon && L('reiter').weapon && L('baer').weapon);
  assert.equal(L('wolf').weapon, null); assert.equal(L('sani').weapon, null); assert.equal(L('wolf').headgear, null);
  assert.equal(L('drache').body.frames, 2); assert.equal(L('biene').body.frames, 2);   // Flügelschlag
});
