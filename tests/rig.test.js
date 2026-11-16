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
  samples(0, 1, .01, t => { seen.add(poseUnit(mk('biene'), t).frame); walk.add(poseUnit(mk('krieger', { mx: 52 }), t).frame); });
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
  assert.equal(L('heli').headgear, null);   // Hauptrotor: eigenes Boss-Teil (bossLayout)
  assert.ok(L('panzer').weapon && L('reiter').weapon && L('baer').weapon);
  assert.equal(L('wolf').weapon, null); assert.equal(L('sani').weapon, null); assert.equal(L('wolf').headgear, null);
  assert.equal(L('biene').body.frames, 2);   // Flügelschlag (Drache: eigene Flügel, bossLayout)
});

/* ---------- Boss-Sticker (Task 12c, Spez. #23): Panzer, Hubschrauber, Drache ---------- */
const P = await import('../game/js/render/pose.js');
const TAU = Math.PI * 2;
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const frac = v => v - Math.floor(v);

test('Boss: Turm schaut zur Seite des Ziels (Kuppel bleibt waagrecht), nur das Rohr hebt und senkt sich', () => {
  const E = P.TANK_ELEV_MAX;
  near(E, .35);
  // ohne Gedächtnis: Seite = Seite des Ziels, Rohrwinkel = Winkel zum Ziel (+ nach unten), begrenzt
  let p = poseUnit(mk('panzer', { tg: { x: 130, y: 110 } }), 1);
  near(p.turretFlip, 1); near(p.turretRot, Math.atan2(10, 30));
  p = poseUnit(mk('panzer', { tg: { x: 130, y: 140 } }), 1);
  near(p.turretRot, E);
  p = poseUnit(mk('panzer', { tg: { x: 20, y: 60 } }), 1);
  near(p.turretFlip, -1); near(p.turretRot, -E);
  p = poseUnit(mk('panzer', { tg: { x: 40, y: 105 }, face: 1 }), 1);
  near(p.turretFlip, -1, 1e-9); near(p.turretRot, Math.atan2(5, 60), 1e-9);   // Ziel hinter der Wanne
  // ohne Ziel: geradeaus in Blickrichtung
  near(poseUnit(mk('panzer'), 1).turretFlip, 1); near(poseUnit(mk('panzer', { face: -1 }), 1).turretFlip, -1);
  near(poseUnit(mk('panzer'), 1).turretRot, 0);
  // mit Gedächtnis: Ziel wechselt die Seite → Turm dreht sich in TURN_T (schmal werden, umklappen, breit)
  const m = P.bossMemory(), u = mk('panzer', { tg: { x: 200, y: 100 } }), o = {};
  near(poseUnit(u, 0, o, m).turretFlip, 1);
  u.tg = { x: 0, y: 100 };
  const seq = [];
  for (let k = 1; k <= 30; k++) seq.push(poseUnit(u, k / 60, o, m).turretFlip);
  assert.ok(P.TURN_T >= .1 && P.TURN_T <= .2, `Dauer ${P.TURN_T}`);
  for (let k = 1; k < seq.length; k++) assert.ok(seq[k] <= seq[k - 1] + 1e-12, 'monoton');
  assert.ok(seq.some(f => Math.abs(f) < .5), 'wird schmal');
  const done = seq.findIndex(f => f === -1);
  assert.ok(done >= 0 && (done + 1) / 60 <= P.TURN_T + 1 / 60 + 1e-9, `fertig nach ${done + 1} Bildern`);
  // Rohrwinkel weich, aber beim Schuss (fireT springt zurück) sofort am Ziel und der Turm ganz gedreht
  u.tg = { x: 200, y: 130 };
  const e1 = poseUnit(u, 31 / 60, o, m).turretRot;
  assert.ok(e1 > 0 && e1 < Math.atan2(30, 100) - .01, `weich ${e1}`);
  near(o.turretFlip, -1);   // Umdrehen beginnt (noch ganz links)
  u.fireT = 0;
  poseUnit(u, 32 / 60, o, m);
  near(o.turretRot, Math.atan2(30, 100)); near(o.turretFlip, 1);
});

test('Boss: Turm kehrt mitten im Umdrehen ohne Sprung um, Ziel genau darüber/darunter flackert nicht', () => {
  const maxStep = Math.PI / P.TURN_T / 60 + 1e-9;   // größte Breitenänderung je Bild (cos-Verlauf)
  // Umkehr bei k ≈ 0.3: die Breite läuft von der aktuellen Breite zurück, kein Sprung auf volle Breite
  const m = P.bossMemory(), u = mk('panzer', { tg: { x: 200, y: 100 } }), o = {};
  let prev = poseUnit(u, 0, o, m).turretFlip, k = 0;
  const step = () => { k++; const f = poseUnit(u, k / 60, o, m).turretFlip; assert.ok(Math.abs(f - prev) <= maxStep, `Sprung ${prev} → ${f} (Bild ${k})`); prev = f; return f; };
  u.tg = { x: 0, y: 100 };
  for (let i = 0; i < 4; i++) step();
  assert.ok(prev < 1 && prev > .3, `mitten im Umdrehen ${prev}`);
  u.tg = { x: 200, y: 100 };                  // Ziel springt zurück
  const atRev = step();
  assert.ok(atRev > 0 && atRev < 1, `läuft von der aktuellen Breite weiter ${atRev}`);
  for (let i = 0; i < 20; i++) step();
  near(prev, 1);
  // mehrfach hin und her mitten im Umdrehen: nie ein Sprung
  for (let i = 0; i < 40; i++) { u.tg = { x: i % 6 < 3 ? 0 : 200, y: 100 }; step(); }
  // Ziel genau über bzw. unter dem Panzer, dx wechselt jedes Bild das Vorzeichen: Seite bleibt
  for (let i = 0; i < 30; i++) step();
  const settled = prev;
  assert.equal(Math.abs(settled), 1);
  for (let i = 0; i < 60; i++) { u.tg = { x: 100 + (i % 2 ? 1.5 : -1.5), y: 160 }; assert.equal(step(), settled, 'kein Flackern'); }
  // erst deutlich auf der anderen Seite dreht er sich um
  u.tg = { x: 100 - settled * 40, y: 160 };
  for (let i = 0; i < 20; i++) step();
  near(prev, -settled);
  // Schuss im Totbereich: Turm sofort auf der Seite der Logik (muzzle.tankAim), damit die Mündung stimmt
  u.tg = { x: 100 + settled * 2, y: 160 }; step();
  assert.equal(prev, -settled, 'Totbereich hält die Seite');
  u.fireT = 0; k++; poseUnit(u, k / 60, o, m);
  assert.equal(o.turretFlip, settled, 'Schuss: Seite wie die Logik');
});

test('Boss: Hauptrotor und Heckrotor drehen sich gleichmäßig pro Zeit', () => {
  const u = mk('heli', { seed: 2.5 });
  assert.ok(P.ROTOR_SPEED >= 20, 'sichtbar schnell');
  for (const [t, dt] of [[0, .01], [1.3, .05], [7.77, .1]]) {
    const a = poseUnit(u, t), b = poseUnit(u, t + dt);
    assert.ok(a.rotorRot >= 0 && a.rotorRot < TAU);
    near(wrapA(b.rotorRot - a.rotorRot - P.ROTOR_SPEED * dt), 0, 1e-6);
    near(wrapA(b.tailRotor - a.tailRotor - P.TAIL_ROTOR_SPEED * dt), 0, 1e-6);
  }
  // andere haben keinen Rotor
  assert.equal(poseUnit(mk('panzer'), 1).rotorRot, 0);
  assert.equal(poseUnit(mk('krieger'), 1).rotorRot, 0);
});

test('Boss: Flügelphase läuft periodisch (langsamer Takt, schneller beim Fliegen), Schweif schwingt nach', () => {
  const u = mk('drache', { seed: .7 });
  assert.ok(P.WING_HZ >= 1.2 && P.WING_HZ <= 2, `Takt ${P.WING_HZ}`);
  for (const t of [0, .4, 3.1]) {
    const a = poseUnit(u, t).wingPhase, b = poseUnit(u, t + 1 / P.WING_HZ).wingPhase;
    assert.ok(a >= 0 && a < 1);
    near(Math.min(Math.abs(a - b), 1 - Math.abs(a - b)), 0, 1e-6);
    // Schweif: Schwingen mit Phasenverzug hinter dem Flügelschlag
    near(poseUnit(u, t).tailSwing, P.TAIL_AMP * Math.sin(TAU * a - P.TAIL_LAG));
  }
  // Schläge zählen: 5 s im Stand ≈ 8, im Flug mit Gedächtnis mehr, und die Phase springt nie
  const beats = (mx, mem) => {
    const v = mk('drache', { mx, seed: .7 }), o = {};
    let n = 0, prev = poseUnit(v, 0, o, mem).wingPhase;
    for (let k = 1; k <= 300; k++) {
      const w = poseUnit(v, k / 60, o, mem).wingPhase;
      const step = frac(w - prev);
      assert.ok(step <= (P.WING_HZ + P.WING_HZ_MOVE) / 60 + 1e-9, `Sprung ${step}`);
      if (w < prev) n++; prev = w;
    }
    return n;
  };
  const idle = beats(0, P.bossMemory()), flying = beats(UNITS.drache.speed, P.bossMemory());
  assert.ok(idle >= 7 && idle <= 9, `Stand ${idle}`);
  assert.ok(flying > idle, `Flug ${flying}`);
  // Schweif mit Gedächtnis: hängt beim Losfliegen nach (Nachschwingen), bleibt begrenzt
  const m = P.bossMemory(), v = mk('drache'), o = {};
  poseUnit(v, 0, o, m);
  v.mx = UNITS.drache.speed;
  const trail = [];
  for (let k = 1; k <= 120; k++) { poseUnit(v, k / 60, o, m); trail.push(m.tail); assert.ok(Math.abs(o.tailSwing) <= P.TAIL_AMP + P.TAIL_TRAIL + 1e-9); }
  assert.ok(Math.abs(trail[2]) < Math.abs(trail[100]), 'nachziehen statt springen');
  near(trail[119], -P.TAIL_TRAIL, .02);
});

test('Boss: Panzer, Heli und Drache haben fast kein Squash (kein Hüpfen)', () => {
  for (const type of ['panzer', 'heli', 'drache']) {
    assert.ok(P.BOSS.has(type));
    const sp = UNITS[type].speed;
    samples(0, 2, .01, t => {
      for (const o of [{ mx: sp }, { mx: -sp, my: sp / 2 }, { hitT: .1 }, { hitT: .1, mx: sp }, {}]) {
        const p = poseUnit(mk(type, o), t);
        assert.ok(Math.abs(p.sx - 1) <= P.BOSS_SQUASH + 1e-9 && Math.abs(p.sy - 1) <= P.BOSS_SQUASH + 1e-9, `${type} ${p.sx} ${p.sy}`);
        if (type === 'panzer') assert.equal(p.bob, 0, 'Panzer hüpft nicht');
      }
    });
  }
  assert.ok(P.BOSS_SQUASH <= .03 && P.BOSS_SQUASH < P.WALK_SQUASH);
  assert.ok(!P.BOSS.has('krieger'));
  // normale Figuren quetschen weiter
  near(poseUnit(mk('krieger', { hitT: .1 }), 0).sy, .85);
});

test('Boss: Heli neigt sich in Flugrichtung (bis 0,25 rad), Panzerketten laufen mit dem Weg', () => {
  const sp = UNITS.heli.speed;
  near(poseUnit(mk('heli', { mx: sp }), 1).tilt, P.HELI_LEAN);
  near(poseUnit(mk('heli', { mx: -sp * 2, face: -1 }), 1).tilt, -P.HELI_LEAN);
  near(poseUnit(mk('heli'), 1).tilt, 0);
  near(P.HELI_LEAN, .25);
  // mit Gedächtnis weich
  const hm = P.bossMemory(), h = mk('heli'), ho = {};
  poseUnit(h, 0, ho, hm); h.mx = sp;
  assert.ok(poseUnit(h, 1 / 60, ho, hm).tilt < P.HELI_LEAN * .5);
  for (let k = 2; k < 200; k++) poseUnit(h, k / 60, ho, hm);
  near(ho.tilt, P.HELI_LEAN, .01);
  // Ketten: Phase = Weg / TRACK_PITCH (mit Gedächtnis), Bild 0..3 daraus, im Stand steht sie
  const m = P.bossMemory(), u = mk('panzer', { mx: UNITS.panzer.speed }), o = {};
  poseUnit(u, 0, o, m);
  const t0 = o.track, frames = new Set();
  for (let k = 1; k <= 30; k++) { poseUnit(u, k / 60, o, m); frames.add(o.frame); assert.equal(o.frame, Math.floor(o.track * P.TRACK_FRAMES) % P.TRACK_FRAMES); }
  near(frac(o.track - t0), frac(UNITS.panzer.speed * .5 / P.TRACK_PITCH), 1e-6);
  assert.equal(frames.size, P.TRACK_FRAMES, 'alle Kettenbilder');
  u.mx = 0; const st = poseUnit(u, 1, o, m).track;
  near(poseUnit(u, 1.5, o, m).track, st);
  // rückwärts laufen die Ketten rückwärts
  const m2 = P.bossMemory(), b = mk('panzer', { mx: -UNITS.panzer.speed }), bo = {};
  poseUnit(b, 0, bo, m2); const b0 = bo.track; poseUnit(b, .05, bo, m2);
  near(frac(bo.track - b0), frac(-UNITS.panzer.speed * .05 / P.TRACK_PITCH), 1e-6);
});

test('Boss: Panzerrohr mit kurzem Stoß und langem Rücklauf, Drachenkopf zielt zum Ziel', () => {
  // im Schuss-Moment liegt das Rohr noch vorn (Mündung = Startpunkt der Granate), dann Stoß und Rücklauf
  near(poseUnit(mk('panzer', { fireT: 0 }), 0).recoil, 0);
  near(poseUnit(mk('panzer', { fireT: P.KICK * P.TANK_RECOIL_T }), 0).recoil, P.TANK_RECOIL);
  let prev = Infinity;
  for (let f = P.KICK * P.TANK_RECOIL_T; f <= P.TANK_RECOIL_T + 1e-9; f += .01) {
    const r = poseUnit(mk('panzer', { fireT: f }), 0).recoil;
    assert.ok(r <= prev + 1e-12 && r >= 0); prev = r;
  }
  near(poseUnit(mk('panzer', { fireT: P.TANK_RECOIL_T }), 0).recoil, 0);
  assert.ok(P.TANK_RECOIL > P.RECOIL && P.TANK_RECOIL_T > P.RECOIL_T);
  // Wanne wippt erst nach dem Schuss
  near(poseUnit(mk('panzer', { fireT: 0 }), 0).tilt, 0);
  assert.ok(poseUnit(mk('panzer', { fireT: .1 }), 0).tilt < 0, 'wippt zurück');
  // Kopf: lokaler Winkel zum Ziel, begrenzt auf ±HEAD_MAX, gespiegelt gleich
  near(poseUnit(mk('drache', { tg: { x: 200, y: 100 } }), 0).headRot, 0);
  near(poseUnit(mk('drache', { tg: { x: 200, y: 130 } }), 0).headRot, Math.min(P.HEAD_MAX, Math.atan2(30, 100)));
  near(poseUnit(mk('drache', { face: -1, tg: { x: 0, y: 130 } }), 0).headRot, Math.min(P.HEAD_MAX, Math.atan2(30, 100)));
  near(poseUnit(mk('drache', { tg: { x: 100, y: 300 } }), 0).headRot, P.HEAD_MAX);
  // beim Feuerspeien: Kopf ungeglättet, kein Auf und Ab
  const m = P.bossMemory(), d = mk('drache', { tg: { x: 200, y: 100 } }), o = {};
  poseUnit(d, 0, o, m); d.tg = { x: 200, y: 140 };
  assert.ok(poseUnit(d, 1 / 60, o, m).headRot < Math.atan2(40, 100) - .05, 'sonst weich');
  d.fireT = 0; poseUnit(d, 2 / 60, o, m);
  near(o.headRot, Math.atan2(40, 100)); near(o.bob, 0);
  d.fireT = 1; assert.notEqual(poseUnit(d, 2.2, o, m).bob, 0);
});

test('Boss: eigene Teile im Atlas (rigLayout bleibt, bossLayout zeigt die Zusatzteile)', async () => {
  const { bossLayout, rigLayout } = await import('../game/js/render/rig.js');
  const pz = bossLayout('panzer'), he = bossLayout('heli'), dr = bossLayout('drache');
  assert.ok(pz.body && pz.turret && pz.weapon && pz.treads, 'Wanne, Turm, Rohr, Ketten');
  assert.equal(pz.treads.frames, P.TRACK_FRAMES); assert.equal(pz.treads.variants, 1);
  assert.equal(pz.body.variants, 5); assert.equal(pz.turret.variants, 5);
  assert.ok(he.body && he.rotorBlades && he.rotorDisc && he.tailRotor && he.weapon, 'Rumpf, Rotor, Heckrotor');
  assert.equal(he.rotorBlades.variants, 1);
  assert.ok(dr.body && dr.neck && dr.head && dr.wing && dr.tail && dr.corpse, 'Rumpf, Hals, Kopf, Flügel, Schweif');
  assert.equal(dr.body.variants, 1);
  assert.equal(bossLayout('krieger'), null);
  // Leichenteile: der Turm fliegt mit Rohr davon, der Rotor als Rotor
  assert.ok(pz.turretWreck);
  assert.equal(rigLayout('heli').headgear, null);
});
