// Rückzug und Erholung (Spez. #27, Task 5): ab 25 % LP flieht jede Einheit (Römer im Block erst ab 15 %),
// weg vom nächsten Feind und zu den eigenen Leuten, 1,2× so schnell, ohne anzugreifen; eingeholt oder in die
// Ecke gedrängt wehrt sie sich. Ohne Feind in 200 px erholt sie sich nach 2 s um 5 % der LP je s und kehrt ab
// 60 % zurück. Sanitäter heilen Fliehende zuerst. Liegende stehen erst auf. Gilt auch für die Bosse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, rebuildHash, cellIndex, setCell } from '../game/js/world.js';
import { think, PRONE_UP_T } from '../game/js/combat.js';
import { step } from '../game/js/sim.js';
import { MORALE, updateMorale, updateCentroids, fleeSteer, CORNER_PAD } from '../game/js/morale.js';
import { poseUnit, FEAR_PUPIL } from '../game/js/render/pose.js';
import { UNITS } from '../game/js/data.js';

const DT = 1 / 60;
const mkWorld = (seed = 7) => { const w = createWorld(1400, 800, seed); w.teamMode = true; return w; };
const run = (w, secs, each) => { for (let t = 0; t < secs - 1e-9; t += DT) { step(w, DT); w.events.length = 0; if (each) each(); } };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Gegner, der nie zuschlägt (oder schießt) und nicht stirbt
const dummy = (w, type, x, y, team = 'rot') => { const e = spawn(w, type, x, y, team); e.hp = 1e9; e.cd = 1e9; return e; };

test('Rückzug: Werte laut Spez. #27 und neue Felder in spawn', () => {
  assert.deepEqual(MORALE, { FLEE: .25, FLEE_FORM: .15, BACK: .6, SAFE_R: 200, SAFE_T: 2, REGEN: .05, SPEED: 1.2, CORNER_T: 1.5 });
  const u = spawn(mkWorld(), 'krieger', 100, 100, 'blau');
  assert.equal(u.flee, false); assert.equal(u.safeT, 0); assert.equal(u.cornerT, 0);
});

test('Flucht ab 25 %: rennt weg, schneller als sonst, ohne zuzuschlagen', () => {
  const w = mkWorld(), u = spawn(w, 'krieger', 600, 400, 'blau');
  u.hp = 14;   // 14/60 < 25 %
  const e = spawn(w, 'krieger', 630, 400, 'rot'); e.hp = 1e9; e.cd = 5;   // verfolgt, schlägt aber in 0,5 s nicht
  let swung = false, maxSp = 0;
  run(w, .5, () => { if (u.swingT > 0) swung = true; maxSp = Math.max(maxSp, Math.hypot(u.mx, u.my)); });
  assert.equal(u.flee, true);
  assert.ok(dist(u, e) > 30 + 3, `Abstand ${dist(u, e)}`);
  assert.equal(e.hp, 1e9, 'kein Treffer von ihm');
  assert.equal(swung, false, 'kein Schwung');
  assert.ok(Math.abs(maxSp - UNITS.krieger.speed * MORALE.SPEED) < 1e-6, `Tempo ${maxSp}`);
});

test('über 25 % keine Flucht', () => {
  const w = mkWorld(), u = spawn(w, 'krieger', 600, 400, 'blau');
  u.hp = 16;
  dummy(w, 'krieger', 630, 400);
  run(w, .3);
  assert.equal(u.flee, false);
});

test('Erholung: ohne Feind in 200 px nach SAFE_T s +5 %/s, ab 60 % zurück in den Kampf', () => {
  const w = mkWorld(), u = spawn(w, 'krieger', 400, 400, 'blau');
  u.hp = 14;
  const s = spawn(w, 'sani', 400 + MORALE.SAFE_R + 60, 400, 'rot');   // Gegner außerhalb SAFE_R, bewegt sich nicht
  run(w, MORALE.SAFE_T - .1);
  assert.equal(u.flee, true);
  assert.equal(u.hp, 14, 'vor SAFE_T keine Erholung');
  run(w, 4.1);
  assert.ok(u.hp > 14, 'LP gestiegen');
  assert.ok(Math.abs(u.hp - (14 + 4 * MORALE.REGEN * 60)) < 1, `LP ${u.hp}`);
  assert.equal(u.flee, true, 'unter 60 % flieht er weiter');
  let back = -1;
  run(w, 4, () => { if (back < 0 && !u.flee) back = u.hp; });
  assert.ok(back >= MORALE.BACK * 60 - 1e-9 && back < MORALE.BACK * 60 + 1, `zurück bei ${back}`);
  assert.equal(u.flee, false);
  assert.ok(s.alive);
});

test('Feind in SAFE_R: keine Erholung', () => {
  const w = mkWorld(), u = spawn(w, 'krieger', 400, 400, 'blau');
  u.hp = 14;
  const e = dummy(w, 'schuetze', 400 + MORALE.SAFE_R - 40, 400);
  run(w, 4, () => { e.x = u.x + MORALE.SAFE_R - 40; e.y = u.y; });
  assert.equal(u.hp, 14);
  assert.equal(u.safeT, 0);
});

test('Eingeholt wehrt sich: ein schnellerer Feind klebt an ihm, nach CORNER_T schlägt er zurück', () => {
  const w = mkWorld(), u = spawn(w, 'krieger', 600, 400, 'blau');
  u.hp = 14;
  const wolf = dummy(w, 'wolf', 625, 400);   // 100 px/s gegen 62 px/s
  let hp = wolf.hp, early = false;
  run(w, MORALE.CORNER_T - .1, () => { if (wolf.hp < hp) early = true; });
  assert.equal(early, false, 'vor CORNER_T kein Treffer');
  assert.equal(u.flee, true);
  run(w, .6);
  assert.ok(wolf.hp < hp, 'mindestens ein Treffer von ihm');
  assert.equal(u.flee, true, 'bleibt auf der Flucht');
  assert.ok(u.cornerT >= MORALE.CORNER_T);
});

test('cornerT: Feind in Nahkampfreichweite + 10 px zählt, Abstand setzt zurück', () => {
  const w = mkWorld(), u = spawn(w, 'krieger', 600, 400, 'blau');
  u.hp = 14;
  const e = dummy(w, 'krieger', 600 + 9 + 9 + CORNER_PAD - 1, 400);
  rebuildHash(w);
  for (let k = 0; k < 30; k++) { w.time += DT; u.rt -= DT; updateMorale(w, u, DT); }
  assert.ok(Math.abs(u.cornerT - 30 * DT) < 1e-9, `cornerT ${u.cornerT}`);
  e.x = 600 + 9 + 9 + CORNER_PAD + 5;
  updateMorale(w, u, DT);
  assert.equal(u.cornerT, 0);
});

test('Römer im Block halten länger: bei 20 % keine Flucht, bei 14 % schon, dann aus dem Block', () => {
  const w = mkWorld();
  const R = [];
  for (let k = 0; k < 8; k++) R.push(spawn(w, 'roemer', 300 - (k % 4) * 26, 400 + ((k / 4 | 0) - .5) * 26, 'blau'));
  dummy(w, 'schuetze', 1200, 400);
  run(w, .6);
  const u = R[0];
  assert.equal(u.formOn, true, 'im Block');
  u.hp = .2 * UNITS.roemer.hp;
  run(w, .2);
  assert.equal(u.flee, false); assert.equal(u.formOn, true);
  u.hp = .14 * UNITS.roemer.hp;
  run(w, DT);
  assert.equal(u.flee, true); assert.equal(u.formOn, false);
  run(w, .6);   // nach der Neubildung gehört er zu keinem Block
  assert.equal(u.form, 0); assert.equal(u.formOn, false);
  for (const f of w.formations) assert.ok(!f.m.includes(u));
  // allein (nicht im Block) flieht ein Römer schon bei 20 %
  const w2 = mkWorld(), v = spawn(w2, 'roemer', 300, 400, 'blau');
  v.hp = .2 * UNITS.roemer.hp; dummy(w2, 'krieger', 330, 400);
  run(w2, DT);
  assert.equal(v.flee, true);
});

test('Keine Flucht in Lava: Lava hinter dem Fliehenden, er betritt keine Lava-Zelle', () => {
  const w = mkWorld(), u = spawn(w, 'krieger', 300, 400, 'blau');
  u.hp = 14;
  for (let gy = 0; gy < w.GH; gy++) for (let gx = 15; gx < 29; gx++) setCell(w, gy * w.GW + gx, 2);   // x 150..290
  const e = spawn(w, 'krieger', 330, 400, 'rot'); e.hp = 1e9; e.cd = 1e9;
  let lava = 0;
  run(w, 4, () => { if (w.terr[cellIndex(w, u.x, u.y)] === 2) lava++; });
  assert.equal(lava, 0, 'Schritte auf Lava');
  assert.ok(u.alive); assert.equal(u.hp, 14);
  assert.equal(u.flee, true);
});

test('Mauer hinter dem Fliehenden: er weicht seitlich aus statt dagegen zu rennen', () => {
  const w = mkWorld(), u = spawn(w, 'krieger', 300, 400, 'blau');
  u.hp = 14;
  for (let gy = 0; gy < w.GH; gy++) for (let gx = 26; gx < 29; gx++) setCell(w, gy * w.GW + gx, 4);
  const e = dummy(w, 'krieger', 330, 400);
  run(w, 1.5, () => { e.x = u.x + 30; });   // Feind bleibt dicht dran
  assert.ok(Math.abs(u.y - 400) > 40, `seitlich ausgewichen (y ${u.y})`);
});

test('Flieger ignorieren das Gelände auf der Flucht', () => {
  const w = mkWorld(), u = spawn(w, 'heli', 300, 400, 'blau');
  u.hp = 50;
  for (let gy = 0; gy < w.GH; gy++) for (let gx = 15; gx < 29; gx++) setCell(w, gy * w.GW + gx, 2);
  dummy(w, 'soldat', 330, 400);
  run(w, 1);
  assert.equal(u.flee, true);
  assert.ok(u.x < 260, `fliegt über die Lava (x ${u.x})`);
});

test('Fluchtrichtung: weg vom Feind, zum Schwerpunkt der eigenen Fraktion gemischt', () => {
  const w = mkWorld(), u = spawn(w, 'krieger', 600, 400, 'blau');
  u.hp = 14;
  // eigene Truppen oben (y 150), Feind rechts
  for (let k = 0; k < 6; k++) dummy(w, 'krieger', 560 + k * 20, 150, 'blau');
  const e = dummy(w, 'krieger', 640, 400);
  u.flee = true;
  rebuildHash(w); updateCentroids(w, DT);
  const c = w.cent.get('blau');
  assert.ok(c && c.n === 6, 'Fliehende zählen nicht zum Schwerpunkt');
  assert.ok(Math.abs(c.y - 150) < 1e-9);
  u.tg = e;
  fleeSteer(w, u, DT);
  assert.ok(u.mx < 0, 'weg vom Feind'); assert.ok(u.my < 0, 'zu den eigenen Leuten');
  // Schwerpunkt hinter dem Feind: kein Lauf auf den Feind zu
  const w2 = mkWorld(), v = spawn(w2, 'krieger', 600, 400, 'blau');
  for (let k = 0; k < 6; k++) dummy(w2, 'krieger', 900, 380 + k * 10, 'blau');
  const e2 = dummy(w2, 'krieger', 640, 400);
  v.hp = 14; v.flee = true; v.tg = e2;
  rebuildHash(w2); updateCentroids(w2, DT);
  fleeSteer(w2, v, DT);
  assert.ok(v.mx <= 0, `nicht auf den Feind zu (mx ${v.mx})`);
});

test('Sanitäter bevorzugt Fliehende', () => {
  const w = mkWorld(), s = spawn(w, 'sani', 300, 400, 'blau');
  const near = spawn(w, 'krieger', 330, 400, 'blau'); near.hp = 40;
  const fl = spawn(w, 'krieger', 300, 650, 'blau'); fl.hp = 12; fl.flee = true;
  rebuildHash(w);
  s.rt = 0; think(w, s, DT);
  assert.equal(s.tg, fl);
  // ohne Flucht: der nächste Verletzte
  fl.flee = false; s.rt = 0; think(w, s, DT);
  assert.equal(s.tg, near);
});

test('Panzer, Hubschrauber und Drache fliehen auch', () => {
  for (const type of ['panzer', 'heli', 'drache']) {
    const w = mkWorld(), u = spawn(w, type, 600, 400, 'blau');
    u.hp = .2 * UNITS[type].hp;
    const e = dummy(w, 'soldat', 690, 400);
    const d0 = dist(u, e);
    run(w, 1);
    assert.equal(u.flee, true, type);
    assert.ok(dist(u, e) > d0 + 20, `${type}: Abstand ${dist(u, e)}`);
  }
});

test('Liegende stehen erst auf und fliehen dann', () => {
  const w = mkWorld(), u = spawn(w, 'mg', 600, 400, 'blau');
  u.stance = 'prone'; u.hp = 20;
  const e = dummy(w, 'schuetze', 750, 400);
  rebuildHash(w);
  think(w, u, DT);
  assert.equal(u.flee, true);
  assert.equal(u.stance, 'up');
  assert.equal(u.mx, 0); assert.equal(u.my, 0);
  for (let t = 0; t < PRONE_UP_T + .05; t += DT) { w.time += DT; think(w, u, DT); }
  assert.equal(u.stance, 'stand');
  assert.ok(u.mx < 0, 'läuft weg');
  assert.ok(e.alive);
});

test('Angstaugen: poseUnit liefert fear und kleine Pupillen nur auf der Flucht', () => {
  const w = mkWorld(), u = spawn(w, 'krieger', 600, 400, 'blau');
  let p = poseUnit(u, 1);
  assert.equal(p.fear, 0); assert.equal(p.pupil, 1);
  u.flee = true;
  p = poseUnit(u, 1);
  assert.equal(p.fear, 1); assert.equal(p.pupil, FEAR_PUPIL);
  assert.ok(FEAR_PUPIL < 1 && FEAR_PUPIL > 0);
  assert.ok(p.sweat >= 0 && p.sweat < 1);
  const b = spawn(w, 'panzer', 600, 400, 'blau'); b.flee = true;
  assert.equal(poseUnit(b, 1, {}, undefined).fear, 1);
});
