// MG und Scharfschütze legen sich hin (Spez. #22, Task 12b): Haltung stand → down (0,6 s) → prone,
// zurück über up (0,8 s), wenn ein Nahkämpfer näher als 140 px kommt. Liegend: halber Schaden durch
// Kugel, Pfeil, Rakete und Explosion, fremde gerade Schüsse treffen nur zu 50 %, Streuung ×0,4,
// Reichweite ×1,15, keine Bewegung. Dazu die liegende Pose (pose.poseUnit: prone, lie, weaponLie).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, rebuildHash } from '../game/js/world.js';
import {
  think, hurt, fire, stepProjectiles, PRONE, PRONE_DOWN_T, PRONE_UP_T, PRONE_MELEE_R, PRONE_BLOCK_T,
  PRONE_DMG, PRONE_DODGE, PRONE_SPREAD, PRONE_RANGE, MELEE_RECHECK,
} from '../game/js/combat.js';
import { step } from '../game/js/sim.js';
import { poseUnit, PRONE_SX, PRONE_SY, PRONE_TILT } from '../game/js/render/pose.js';
import { UNITS } from '../game/js/data.js';

const DT = 1 / 60;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const mkWorld = (seed = 7) => { const w = createWorld(1400, 800, seed); w.teamMode = true; return w; };
// Nur die Denkschritte der Einheit u (andere stehen still), Hash einmal aufgebaut
const thinkFor = (w, u, secs, each) => { for (let t = 0; t < secs - 1e-9; t += DT) { w.time += DT; think(w, u, DT); if (each) each(); } };
const lie = u => { u.stance = 'prone'; u.stanceT = 0; };
const bullets = w => w.proj.filter(p => p.kind === 'bullet').length;

/* ---------- Werte ---------- */
test('Liegen: Werte laut Spez. #22 (0,6 s / 0,8 s, 140 px, ×0,5 Schaden, 50 %, Streuung ×0,4, Reichweite ×1,15)', () => {
  assert.deepEqual([...PRONE].sort(), ['mg', 'sniper']);
  assert.equal(PRONE_DOWN_T, .6); assert.equal(PRONE_UP_T, .8); assert.equal(PRONE_MELEE_R, 140);
  assert.equal(PRONE_BLOCK_T, 2); assert.equal(PRONE_DMG, .5); assert.equal(PRONE_DODGE, .5);
  assert.equal(PRONE_SPREAD, .4); assert.equal(PRONE_RANGE, 1.15);
});

test('spawn: jede Einheit beginnt stehend (stance stand, stanceT 0)', () => {
  const w = mkWorld();
  for (const t of ['mg', 'sniper', 'krieger']) { const u = spawn(w, t, 100, 100, 'blau'); assert.equal(u.stance, 'stand'); assert.equal(u.stanceT, 0); }
});

/* ---------- Hinlegen ---------- */
for (const type of ['mg', 'sniper']) {
  test(`${type}: legt sich ohne Nahkämpfer hin, wenn ein Ziel in Reichweite ist (down 0,6 s, dann prone)`, () => {
    const w = mkWorld(), u = spawn(w, type, 300, 400, 'blau');
    const a = spawn(w, 'schuetze', 300 + UNITS[type].range - 20, 400, 'rot'); a.hp = 1e9;
    step(w, DT);
    assert.equal(u.stance, 'down'); near(u.stanceT, PRONE_DOWN_T);
    let shots = 0;
    for (let t = 0; t < .55; t += DT) { step(w, DT); shots += w.events.filter(e => e.type === 'shot' && e.kind === 'bullet').length; w.events.length = 0; }
    assert.equal(u.stance, 'down', 'noch im Hinlegen');
    assert.equal(shots, 0, 'beim Hinlegen kein Schuss');
    for (let t = 0; t < .1; t += DT) step(w, DT);
    assert.equal(u.stance, 'prone');
  });
}

test('legt sich nicht hin, solange ein Nahkämpfer (Reichweite < 20) näher als 140 px ist', () => {
  const w = mkWorld(), u = spawn(w, 'mg', 300, 400, 'blau');
  spawn(w, 'schuetze', 450, 400, 'rot').hp = 1e9;
  const k = spawn(w, 'krieger', 300, 400 - 130, 'rot'); k.hp = 1e9;
  rebuildHash(w);
  thinkFor(w, u, 1);
  assert.equal(u.stance, 'stand');
  // Fernkämpfer in der Nähe zählen nicht
  const w2 = mkWorld(), u2 = spawn(w2, 'mg', 300, 400, 'blau');
  spawn(w2, 'soldat', 300, 300, 'rot').hp = 1e9;
  rebuildHash(w2);
  thinkFor(w2, u2, .1);
  assert.equal(u2.stance, 'down');
});

test('legt sich nicht hin, wenn kein Ziel in (normaler) Reichweite ist, und läuft hin', () => {
  const w = mkWorld(), u = spawn(w, 'mg', 300, 400, 'blau');
  spawn(w, 'schuetze', 300 + UNITS.mg.range * 1.1 + 19, 400, 'rot');
  rebuildHash(w);
  thinkFor(w, u, .5);
  assert.equal(u.stance, 'stand');
  assert.ok(u.mx > 0, 'läuft aufs Ziel zu');
});

/* ---------- Schaden ---------- */
test('liegend: Kugel, Pfeil, Rakete und Explosion ×0,5; Nahkampf und Feuer voll; stehend und beim Hinlegen voll', () => {
  const w = mkWorld();
  for (const kind of ['bullet', 'arrow', 'rocket', 'blast']) {
    const p = spawn(w, 'mg', 300, 400, 'blau'); lie(p);
    near(hurt(w, p, 10, kind, null), 5);
    const s = spawn(w, 'mg', 300, 400, 'blau');
    near(hurt(w, s, 10, kind, null), 10);
    const d = spawn(w, 'mg', 300, 400, 'blau'); d.stance = 'down'; d.stanceT = .3;
    near(hurt(w, d, 10, kind, null), 10);
  }
  for (const kind of ['melee', 'fire']) { const p = spawn(w, 'sniper', 300, 400, 'blau'); lie(p); near(hurt(w, p, 10, kind, null), 10); }
});

/* ---------- Reichweite und Zielen ---------- */
test('liegend: Reichweite +15 % (schießt auf 1,1 · Reichweite), stehend nicht', () => {
  for (const type of ['mg', 'sniper']) {
    const T = UNITS[type], D = T.range * 1.1 + T.r + 9;
    const w = mkWorld(), u = spawn(w, type, 200, 400, 'blau'); lie(u);
    const a = spawn(w, 'schuetze', 200 + D, 400, 'rot'); a.hp = 1e9;
    rebuildHash(w); u.cd = 0; think(w, u, DT);
    assert.equal(bullets(w), 1, `${type} liegend schießt auf ${D.toFixed(0)} px`);
    assert.equal(u.stance, 'prone');
    // über 1,15 · Reichweite hinaus: steht auf, um näher heranzugehen
    const w3 = mkWorld(), u3 = spawn(w3, type, 200, 400, 'blau'); lie(u3);
    spawn(w3, 'schuetze', 200 + T.range * 1.2 + T.r + 9, 400, 'rot');
    rebuildHash(w3); u3.cd = 0; think(w3, u3, DT);
    assert.equal(bullets(w3), 0); assert.equal(u3.stance, 'up');
    // stehend auf dieselbe Distanz: kein Schuss, läuft hin
    const w2 = mkWorld(), s = spawn(w2, type, 200, 400, 'blau');
    spawn(w2, 'schuetze', 200 + D, 400, 'rot').hp = 1e9;
    rebuildHash(w2); s.cd = 0; think(w2, s, DT);
    assert.equal(bullets(w2), 0); assert.ok(s.mx > 0);
  }
});

test('liegend: Streuung ×0,4 (Zielpunkt höchstens 2 px statt 5 px neben dem stehenden Ziel)', () => {
  let maxP = 0, maxS = 0;
  for (const prone of [true, false]) {
    const w = mkWorld(3), u = spawn(w, 'mg', 200, 400, 'blau'); if (prone) lie(u);
    const a = spawn(w, 'schuetze', 300, 400, 'rot'); a.hp = 1e9;
    // stehend: ein Krieger knapp innerhalb von 140 px (weiter weg als das Ziel) hält das MG auf den Beinen
    if (!prone) spawn(w, 'krieger', 100, 400 - 90, 'rot').hp = 1e9;
    rebuildHash(w);
    for (let i = 0; i < 300; i++) {
      u.cd = 0; w.events.length = 0; think(w, u, DT);
      const e = w.events.find(q => q.type === 'shot');
      assert.ok(e, 'Schuss');
      const dev = Math.max(Math.abs(e.tx - a.x), Math.abs(e.ty - a.y));
      if (prone) maxP = Math.max(maxP, dev); else maxS = Math.max(maxS, dev);
    }
    w.proj.length = 0;
  }
  assert.ok(maxP <= 2 + 1e-9, `liegend ${maxP}`);
  assert.ok(maxP > 1.5, `liegend streut noch (${maxP})`);
  assert.ok(maxS > 4, `stehend ${maxS}`);
});

/* ---------- Übergänge ---------- */
test('während down und up: kein Schuss, keine Bewegung', () => {
  for (const st of ['down', 'up']) {
    const w = mkWorld(), u = spawn(w, 'mg', 300, 400, 'blau');
    const a = spawn(w, 'schuetze', 420, 400, 'rot'); a.hp = 1e9;
    // für up: ein Krieger in der Nähe hält die Einheit im Aufstehen (statt sie wieder hinzulegen)
    if (st === 'up') spawn(w, 'krieger', 300, 280, 'rot').hp = 1e9;
    u.stance = st; u.stanceT = st === 'down' ? PRONE_DOWN_T : PRONE_UP_T;
    rebuildHash(w);
    const T = st === 'down' ? PRONE_DOWN_T : PRONE_UP_T;
    thinkFor(w, u, T - .05, () => { u.cd = 0; assert.equal(u.mx, 0); assert.equal(u.my, 0); });
    assert.equal(bullets(w), 0, st);
    assert.equal(u.stance, st);
  }
});

test('steht auf, wenn ein Krieger näher als 140 px kommt: up 0,8 s ohne Schuss, dann stand und schießt', () => {
  const w = mkWorld(), u = spawn(w, 'mg', 300, 400, 'blau'); lie(u);
  const k = spawn(w, 'krieger', 300 + 150, 400, 'rot'); k.hp = 1e9;
  rebuildHash(w);
  thinkFor(w, u, .2, () => { u.cd = 0; });
  assert.equal(u.stance, 'prone', 'bei 150 px bleibt er liegen');
  assert.ok(bullets(w) > 0, 'und schießt');
  w.proj.length = 0;
  k.x = 300 + 130; rebuildHash(w);
  // Der Nahkämpfer-Check ist gedrosselt (Task 13: MELEE_RECHECK s, je id um bis zu 0,04 s gestaffelt): spätestens
  // dann steht er auf; bis dahin darf er liegend weiterschießen (Schüsse vor dem Aufstehen zählen hier nicht)
  const maxSteps = Math.ceil((MELEE_RECHECK + .04) / DT) + 1;
  let n = 0;
  // Schleife darf über maxSteps hinaus laufen, damit die Grenze wirklich geprüft wird
  while (u.stance === 'prone' && n < maxSteps * 3) { u.cd = 0; w.proj.length = 0; w.time += DT; think(w, u, DT); n++; }
  assert.ok(n <= maxSteps, `steht nach ${n} Schritten auf (höchstens ${maxSteps})`);
  assert.equal(u.stance, 'up'); near(u.stanceT, PRONE_UP_T);
  thinkFor(w, u, PRONE_UP_T - DT * 2, () => { u.cd = 0; assert.equal(u.mx, 0); assert.equal(u.my, 0); });
  assert.equal(bullets(w), 0, 'beim Aufstehen kein Schuss');
  assert.equal(u.stance, 'up');
  thinkFor(w, u, DT * 3, () => { u.cd = 0; });
  assert.equal(u.stance, 'stand');
  thinkFor(w, u, .1, () => { u.cd = 0; });
  assert.ok(bullets(w) > 0, 'stehend schießt er wieder');
  assert.equal(u.stance, 'stand', 'mit Krieger in der Nähe legt er sich nicht wieder hin');
});

test('ein Krieger während des Hinlegens: kehrt um (up, so lang wie schon hingelegt)', () => {
  const w = mkWorld(), u = spawn(w, 'mg', 300, 400, 'blau');
  spawn(w, 'schuetze', 420, 400, 'rot').hp = 1e9;
  u.stance = 'down'; u.stanceT = PRONE_DOWN_T / 2;
  spawn(w, 'krieger', 300, 300, 'rot').hp = 1e9;
  rebuildHash(w);
  think(w, u, DT);
  assert.equal(u.stance, 'up'); near(u.stanceT, PRONE_UP_T / 2, 1e-6);
});

test('liegende Einheit bewegt sich nicht (auch der Scharfschütze weicht nicht aus)', () => {
  for (const type of ['mg', 'sniper']) {
    const w = mkWorld(), u = spawn(w, type, 300, 400, 'blau'); lie(u);
    // Ziel jenseits der normalen, aber innerhalb der liegenden Reichweite: stehend würde er hinlaufen
    const T = UNITS[type], D = 300 + T.range * 1.1 + T.r + 9;
    const a = spawn(w, 'schuetze', D, 400, 'rot'); a.hp = 1e9;
    let moved = 0;
    for (let t = 0; t < 3; t += DT) { step(w, DT); w.events.length = 0; moved += Math.abs(u.mx) + Math.abs(u.my); a.x = D; a.y = 400; }
    assert.equal(moved, 0, type);
    near(u.x, 300, 1e-6); near(u.y, 400, 1e-6);
    assert.equal(u.stance, 'prone');
  }
});

test('liegend mit verdeckter Schusslinie: hält das Feuer ohne Ausweichen, steht nach 2 s auf', () => {
  const w = mkWorld(), u = spawn(w, 'mg', 300, 400, 'blau'); lie(u);
  spawn(w, 'krieger', 350, 400, 'blau').hp = 1e9;                  // Verbündeter in der Schusslinie
  const a = spawn(w, 'schuetze', 450, 400, 'rot'); a.hp = 1e9;
  rebuildHash(w); u.cd = 0;
  thinkFor(w, u, PRONE_BLOCK_T - .1, () => { assert.equal(u.mx, 0); assert.equal(u.my, 0); });
  assert.equal(bullets(w), 0); assert.equal(u.stance, 'prone');
  thinkFor(w, u, .15);
  assert.equal(u.stance, 'up');
  thinkFor(w, u, PRONE_UP_T + DT);
  assert.equal(u.stance, 'stand');
  // steht jetzt und weicht seitlich aus, statt sich sofort wieder hinzulegen
  let side = 0;
  thinkFor(w, u, .5, () => { side += Math.abs(u.my); });
  assert.equal(u.stance, 'stand'); assert.ok(side > 0, 'weicht aus');
});

test('stehend mit von Anfang an verdeckter Linie: legt sich nie hin, auch nicht nach dem Zurücksetzen von blockedT', () => {
  // Verbündeter (stehend) direkt in der Linie, kein anderes Ziel: lineBlocked setzt blockedT nach 2 s auf 0
  const w = mkWorld(), u = spawn(w, 'mg', 300, 400, 'blau');
  spawn(w, 'krieger', 350, 400, 'blau').hp = 1e9;
  spawn(w, 'schuetze', 450, 400, 'rot').hp = 1e9;
  rebuildHash(w); u.cd = 0;
  let resets = 0, prev = 0;
  thinkFor(w, u, 4.5, () => {
    assert.equal(u.stance, 'stand', `t=${w.time.toFixed(2)}`);
    if (u.blockedT < prev) resets++; prev = u.blockedT;
  });
  assert.ok(resets >= 2, `blockedT zurückgesetzt (${resets})`);
  assert.equal(u.aimOk, false);
  assert.equal(bullets(w), 0);
});

test('Hinlegen und Aufstehen laufen auch ohne Ziel zu Ende (kein Einfrieren halb hingelegt)', () => {
  for (const [st, T, end] of [['down', PRONE_DOWN_T, 'prone'], ['up', PRONE_UP_T, 'stand']]) {
    const w = mkWorld(), u = spawn(w, 'mg', 300, 400, 'blau');
    u.stance = st; u.stanceT = T; rebuildHash(w);
    thinkFor(w, u, T + .05);
    assert.equal(u.stance, end, st);
  }
});

test('geschleudert (air/stun): Haltung springt auf stand', () => {
  for (const st of ['air', 'stun']) {
    const w = mkWorld(), u = spawn(w, 'mg', 300, 400, 'blau'); lie(u);
    rebuildHash(w); u.state = st;
    think(w, u, DT);
    assert.equal(u.stance, 'stand'); assert.equal(u.stanceT, 0);
  }
});

/* ---------- Fremde gerade Schüsse ---------- */
// Soldat (rot) schießt auf einen Krieger (blau) hinter einem MG (blau) in der Bahn. Zählt die Treffer am MG.
function passRate(stance, aimAtMg, n, dt = DT) {
  const w = mkWorld(11);
  const s = spawn(w, 'soldat', 100, 400, 'rot'), m = spawn(w, 'mg', 300, 400, 'blau'), k = spawn(w, 'krieger', 500, 400, 'blau');
  m.stance = stance; k.hp = 1e9; rebuildHash(w);
  let hits = 0;
  for (let i = 0; i < n; i++) {
    m.hp = 1e9; w.proj.length = 0;
    const tg = aimAtMg ? m : k;
    fire(w, s, tg, 'bullet', tg.x, tg.y);
    for (let j = 0; j < 5000 && w.proj.length; j++) stepProjectiles(w, dt);
    if (m.hp < 1e9) hits++;
  }
  return hits / n;
}

test('liegend: fremde gerade Schüsse treffen nur zu 50 %, gezielte immer, stehend immer', () => {
  const r = passRate('prone', false, 400);
  assert.ok(r > .4 && r < .6, `Trefferquote ${r}`);
  assert.equal(passRate('prone', true, 50), 1, 'gezielt auf das MG');
  assert.equal(passRate('stand', false, 50), 1, 'stehend');
});

test('liegend: ein Wurf je Geschoss und Körper, auch bei kleinen Schritten', () => {
  const r = passRate('prone', false, 300, DT / 20);
  assert.ok(r > .4 && r < .6, `Trefferquote ${r}`);
});

test('durchgelassene Kugel trifft den Körper dahinter', () => {
  const w = mkWorld(5);
  const s = spawn(w, 'soldat', 100, 400, 'rot'), m = spawn(w, 'mg', 300, 400, 'blau'), k = spawn(w, 'krieger', 500, 400, 'blau');
  lie(m); m.hp = k.hp = 1e9; rebuildHash(w);
  let behind = 0;
  for (let i = 0; i < 100; i++) {
    const hm = m.hp, hk = k.hp; w.proj.length = 0;
    fire(w, s, k, 'bullet', k.x, k.y);
    for (let j = 0; j < 400 && w.proj.length; j++) stepProjectiles(w, DT);
    if (m.hp === hm) { assert.ok(k.hp < hk, 'Krieger getroffen'); behind++; }
  }
  assert.ok(behind > 30);
});

/* ---------- Eigene Liegende (Controller-Entscheid) ---------- */
test('MG hinter einem liegenden verbündeten Scharfschützen schießt weiter, der Scharfschütze bleibt heil', () => {
  const w = mkWorld(), m = spawn(w, 'mg', 200, 400, 'blau'), sn = spawn(w, 'sniper', 250, 400, 'blau');
  lie(sn); sn.cd = 1e9;   // der Scharfschütze selbst schießt nicht (nur das MG zählt)
  const a = spawn(w, 'schuetze', 340, 400, 'rot'); a.hp = 1e9;
  const seen = new Set();
  for (let t = 0; t < 3; t += DT) {
    a.cd = 1e9; sn.cd = 1e9;   // Ziel schießt nicht zurück
    step(w, DT); w.events.length = 0;
    for (const p of w.proj) if (p.src === m) seen.add(p);
  }
  assert.ok(seen.size > 5, `MG-Schüsse ${seen.size}`);
  assert.equal(sn.hp, UNITS.sniper.hp, 'Scharfschütze unverletzt');
  assert.equal(sn.stance, 'prone');
  assert.ok(a.hp < 1e9, 'Ziel getroffen');
});

test('gerade Schüsse treffen liegende Verbündete des Schützen nie (ducken sich), stehende schon', () => {
  for (const [stance, want] of [['prone', 0], ['stand', 50]]) {
    const w = mkWorld(4);
    const s = spawn(w, 'soldat', 100, 400, 'blau'), m = spawn(w, 'mg', 300, 400, 'blau'), k = spawn(w, 'krieger', 500, 400, 'rot');
    m.stance = stance; k.hp = 1e9; rebuildHash(w);
    let hits = 0, kh = 0;
    for (let i = 0; i < 50; i++) {
      m.hp = 1e9; w.proj.length = 0; const before = k.hp;
      fire(w, s, k, 'bullet', k.x, k.y);
      for (let j = 0; j < 5000 && w.proj.length; j++) stepProjectiles(w, DT);
      if (m.hp < 1e9) hits++;
      if (k.hp < before) kh++;
    }
    assert.equal(hits, want, stance);
    if (stance === 'prone') assert.equal(kh, 50, 'alle treffen das Ziel dahinter');
  }
});

test('fremder Streuschuss in einen liegenden Gegner trifft über viele Seeds rund 50 %', () => {
  let hits = 0; const N = 300;
  for (let seed = 1; seed <= N; seed++) {
    const w = mkWorld(seed);
    const s = spawn(w, 'soldat', 100, 400, 'rot'), m = spawn(w, 'mg', 300, 400, 'blau'), k = spawn(w, 'krieger', 500, 400, 'blau');
    lie(m); m.hp = k.hp = 1e9; rebuildHash(w);
    fire(w, s, k, 'bullet', k.x, k.y);
    for (let j = 0; j < 400 && w.proj.length; j++) stepProjectiles(w, DT);
    if (m.hp < 1e9) hits++;
  }
  assert.ok(hits / N > .4 && hits / N < .6, `Trefferquote ${hits / N}`);
});

/* ---------- Pose ---------- */
const mk = (type, o = {}) => ({
  id: 1, type, T: UNITS[type], x: 100, y: 100, mx: 0, my: 0, vx: 0, vy: 0, face: 1,
  hitT: 0, fireT: 1, swingT: 0, seed: 0, tg: null, state: 'ok', ...o,
});

test('Pose: prone 0 stehend (auch ohne stance), 1 liegend: platt (sx 1,25, sy 0,6), 0,25 rad vorgekippt, Waffe flach', () => {
  for (const o of [{}, { stance: 'stand' }]) {
    const p = poseUnit(mk('mg', o), 1);
    assert.equal(p.prone, 0); assert.equal(p.lie, 0); assert.equal(p.weaponLie, 0);
    assert.equal(p.sx, 1); assert.equal(p.sy, 1);
  }
  assert.equal(PRONE_SX, 1.25); assert.equal(PRONE_SY, .6); assert.equal(PRONE_TILT, .25);
  const p = poseUnit(mk('mg', { stance: 'prone' }), 1);
  assert.equal(p.prone, 1); near(p.sx, 1.25); near(p.sy, .6);
  // kleine Neigung in Blickrichtung (Gesicht bleibt oben sichtbar), die Waffe dreht sie zurück: flach am Boden
  near(p.lie, .25); near(p.weaponLie, -.25);
  const q = poseUnit(mk('sniper', { stance: 'prone', face: -1 }), 1);
  near(q.lie, -.25); near(q.weaponLie, -.25);
  assert.equal(q.tilt, 0);
  // Blick zum Ziel rechts: in der Welt nach rechts, lokal um −lie zurückgedreht
  const r = poseUnit(mk('mg', { stance: 'prone', tg: { x: 200, y: 100 } }), 1);
  near(r.lookX, .35 * Math.cos(.25)); near(r.lookY, -.35 * Math.sin(.25));
  // halb hingelegt: halb platt
  const h = poseUnit(mk('mg', { stance: 'down', stanceT: PRONE_DOWN_T / 2 }), 1);
  near(h.sx, 1 + .25 * h.prone); near(h.sy, 1 - .4 * h.prone); near(h.lie, .25 * h.prone);
  // gerade geschleudert (stance wird erst im nächsten Denkschritt zurückgesetzt): kein Liegen in der Luft
  for (const state of ['air', 'stun']) assert.equal(poseUnit(mk('mg', { stance: 'prone', state }), 1).prone, 0, state);
});

test('Pose: Hinlegen und Aufstehen animiert (prone läuft stetig 0 → 1 bzw. 1 → 0)', () => {
  let prev = -1;
  for (let s = PRONE_DOWN_T; s >= 0; s -= .01) {
    const v = poseUnit(mk('mg', { stance: 'down', stanceT: s }), 0).prone;
    assert.ok(v >= prev - 1e-12 && v >= 0 && v <= 1, `down ${s}: ${v}`); prev = v;
  }
  near(poseUnit(mk('mg', { stance: 'down', stanceT: PRONE_DOWN_T }), 0).prone, 0);
  near(poseUnit(mk('mg', { stance: 'down', stanceT: 0 }), 0).prone, 1);
  const mid = poseUnit(mk('mg', { stance: 'down', stanceT: PRONE_DOWN_T / 2 }), 0).prone;
  assert.ok(mid > .2 && mid < .8, `Mitte ${mid}`);
  prev = 2;
  for (let s = PRONE_UP_T; s >= 0; s -= .01) {
    const v = poseUnit(mk('mg', { stance: 'up', stanceT: s }), 0).prone;
    assert.ok(v <= prev + 1e-12 && v >= 0 && v <= 1, `up ${s}: ${v}`); prev = v;
  }
  near(poseUnit(mk('mg', { stance: 'up', stanceT: PRONE_UP_T }), 0).prone, 1);
  near(poseUnit(mk('mg', { stance: 'up', stanceT: 0 }), 0).prone, 0);
});
