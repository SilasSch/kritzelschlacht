// Geduldige Scharfschützen (Spez. #28): halten Abstand, warten ohne Ziel, bleiben hinter der Front, weichen zurück.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, rebuildHash, RV_BACK } from '../game/js/world.js';
import { think, SNIPER, LIE_MIN } from '../game/js/combat.js';
import { updateCentroids } from '../game/js/morale.js';
import { UNITS } from '../game/js/data.js';

const DT = 1 / 60;
const mkWorld = () => { const w = createWorld(1600, 800, 7); w.teamMode = true; return w; };
const run = (w, u, secs, each) => { for (let t = 0; t < secs - 1e-9; t += DT) { w.time += DT; rebuildHash(w); updateCentroids(w, DT); think(w, u, DT); u.x += u.mx * DT; u.y += u.my * DT; if (each) each(); } };
const still = e => { e.hp = 1e9; };

// Nachtrag 8 (#51): dazu Zurückweichen höchstens BACK_T s mit Sperre BACK_CD s und das Messer
test('SNIPER: Werte laut Spez. #28 und #51', () => {
  assert.deepEqual(SNIPER, { KEEP: .6, WAIT: 3, BEHIND: 40, BACK_T: 2, BACK_CD: 5, KNIFE_GAP: 12, KNIFE_DMG: 6, KNIFE_CD: .8 });
});

test('Hält Abstand zum Ziel: bei 380 px (Reichweite 456) kaum Bewegung', () => {
  const w = mkWorld(), u = spawn(w, 'sniper', 300, 400, 'blau'), e = spawn(w, 'krieger', 680, 400, 'rot'); still(e);
  const x0 = u.x, y0 = u.y;
  run(w, u, 3);
  assert.ok(Math.hypot(u.x - x0, u.y - y0) < 10);
});

test('Wartet ohne Ziel in Reichweite, rückt danach vor', () => {
  const w = mkWorld(), u = spawn(w, 'sniper', 300, 400, 'blau'), e = spawn(w, 'krieger', 900, 400, 'rot'); still(e);
  const x0 = u.x;
  run(w, u, 2.5);
  assert.ok(Math.abs(u.x - x0) < 5, `bewegt ${u.x - x0}`);
  run(w, u, 1.5);
  assert.ok(u.x - x0 > 5, 'rückt vor');
});

test('Bleibt hinter der Front: eigene Krieger bei x=500, Feind bei x=1200', () => {
  const w = mkWorld(), u = spawn(w, 'sniper', 300, 400, 'blau');
  for (let i = 0; i < 10; i++) spawn(w, 'krieger', 500, 340 + i * 14, 'blau').T = { ...UNITS.krieger, speed: 0 };
  const e = spawn(w, 'krieger', 1200, 400, 'rot'); still(e); e.T = { ...UNITS.krieger, speed: 0 };
  let maxX = 0;
  run(w, u, 15, () => { maxX = Math.max(maxX, u.x); });
  assert.ok(maxX <= 460 + 1, `x ${maxX}`);
  assert.ok(maxX > 400, 'rückt bis zur Grenze vor');
});

test('Weicht zurück: Feind bei 0,5 · Reichweite, Abstand wächst', () => {
  const w = mkWorld(), u = spawn(w, 'sniper', 300, 400, 'blau'), e = spawn(w, 'krieger', 300 + 190, 400, 'rot'); still(e); e.T = { ...UNITS.krieger, speed: 0 };
  const d0 = e.x - u.x;
  run(w, u, 2, () => { u.cd = 5; });
  assert.ok(e.x - u.x > d0 + 5);
});

test('Wartezeit beginnt neu, auch nach dem Liegen: Ziel weg, dann ~3 s warten', () => {
  const w = mkWorld(), u = spawn(w, 'sniper', 300, 400, 'blau'), e = spawn(w, 'krieger', 600, 400, 'rot'); still(e); e.T = { ...UNITS.krieger, speed: 0 };
  u.cd = 1e9;
  run(w, u, 3);
  assert.equal(u.stance, 'prone');
  u.snipeT = 50; run(w, u, .1);   // stale; liegend im Ziel setzt zurück
  assert.equal(u.snipeT, 0);
  e.x = 1000; u.tg = null; u.rt = 0;
  const x0 = u.x;
  run(w, u, 2);   // aufstehen (0,8 s) + Rest der Wartezeit
  assert.ok(Math.abs(u.x - x0) < 5);
  run(w, u, 3);
  assert.ok(u.x - x0 > 5);
});

test('Kein Auf und Ab: Schütze rückt langsam an, Scharfschütze legt sich nicht ständig neu hin', () => {
  const w = mkWorld(), u = spawn(w, 'sniper', 300, 400, 'blau'), e = spawn(w, 'schuetze', 300 + 330, 400, 'rot'); still(e); e.T = { ...UNITS.schuetze, speed: 0 };
  u.cd = 1e9; e.cd = 1e9;
  const d0 = e.x - u.x;
  let changes = 0, last = u.stance;
  run(w, u, 6, () => { e.x -= 20 * DT; if (u.stance !== last) { changes++; last = u.stance; } });
  assert.ok(changes <= 4, `Wechsel ${changes}`);
  assert.ok(e.x - u.x > 0.6 * 380 - 1 || e.x - u.x > d0 - 120);
});

/* ---------- Nur im Liegen (Nachtrag 4, #36) ---------- */
test('Werte laut Nachtrag 4: Schaden 90, Abklingzeit 4,5 s, Reichweite 456', () => {
  assert.equal(UNITS.sniper.dmg, 90); assert.equal(UNITS.sniper.cd, 4.5); assert.equal(UNITS.sniper.range, 456);
});

test('Schießt nie im Stehen oder beim Hinlegen/Aufstehen, auch in der ganzen Schlacht', async () => {
  const { step } = await import('../game/js/sim.js');
  const w = mkWorld(), ss = [];
  for (let i = 0; i < 4; i++) ss.push(spawn(w, 'sniper', 200, 250 + i * 100, 'blau'));
  for (let i = 0; i < 6; i++) spawn(w, 'krieger', 900 + (i % 2) * 30, 300 + i * 40, 'rot');
  for (let i = 0; i < 4; i++) spawn(w, 'schuetze', 520, 300 + i * 60, 'rot');
  let shots = 0;
  for (let i = 0; i < 60 * 30; i++) {
    step(w, DT); w.events.length = 0;
    for (const u of ss) if (u.alive && u.fireT === 0) { shots++; assert.equal(u.stance, 'prone', `Schuss in Haltung ${u.stance}`); }
  }
  assert.ok(shots >= 3, `Schüsse ${shots}`);
});

test('Ziel zu nah zum Hinlegen (unter LIE_MIN): weicht stehend zurück, legt sich dann hin und schießt', () => {
  const w = mkWorld(), u = spawn(w, 'sniper', 600, 400, 'blau'), e = spawn(w, 'schuetze', 900, 400, 'rot'); still(e); e.T = { ...UNITS.schuetze, speed: 0 }; e.cd = 1e9;
  u.cd = 0;
  let fired = false, firedAt = 0;
  run(w, u, 6, () => { if (!fired && u.fireT === 0) { fired = true; firedAt = e.x - u.x; } });
  assert.ok(fired, 'schießt');
  assert.ok(firedAt >= UNITS.sniper.range * LIE_MIN - 2, `erst ab LIE_MIN · Reichweite: ${firedAt.toFixed(0)}`);
});

test('Nahkämpfer nah: steht, schießt nicht und weicht zurück', () => {
  const w = mkWorld(), u = spawn(w, 'sniper', 600, 400, 'blau'), e = spawn(w, 'krieger', 700, 400, 'rot'); still(e); e.T = { ...UNITS.krieger, speed: 0 };
  u.cd = 0;
  const x0 = u.x;
  run(w, u, 1.5, () => { assert.notEqual(u.fireT, 0, 'kein Schuss'); assert.equal(u.stance, 'stand'); });
  assert.ok(u.x < x0 - 30, `weicht zurück: ${(u.x - x0).toFixed(0)}`);
});

/* ---------- Nachtrag 8, #51: kurzes Zurückweichen, Messer ---------- */
test('#51: von einem gleich schnellen Krieger gejagt: höchstens 2 s zurück, dann Messer, der Krieger verliert LP', async () => {
  const { step } = await import('../game/js/sim.js');
  const w = mkWorld(), u = spawn(w, 'sniper', 600, 400, 'blau');
  for (let k = 0; k < 4; k++) { const a = spawn(w, 'krieger', 100, 300 + k * 30, 'blau'); a.state = 'stun'; a.stunT = 1e9; a.hp = 1e9; }
  const e = spawn(w, 'krieger', 760, 400, 'rot');
  e.T = { ...UNITS.krieger, speed: UNITS.sniper.speed, dmg: 0 }; e.hp = 1e4;
  u.cd = 1e9;   // das Gewehr bleibt hier stumm: nur das Messer trifft
  let back = 0, knifed = 0;
  for (let i = 0; i < 60 * 8; i++) {
    const x0 = u.x;
    step(w, 1 / 60); w.events.length = 0;
    if (u.x < x0 - .2) back += 1 / 60;
    if (u.swingT === .25) knifed++;
  }
  assert.ok(back <= 2.1, `weicht ${back.toFixed(2)} s zurück`);
  assert.ok(knifed >= 3, `Messerstiche ${knifed}`);
  assert.ok(e.hp < 1e4, 'Krieger verliert LP');
  assert.ok(u.alive && u.stance === 'stand');
});

test('#51: vor einem langsameren Verfolger höchstens BACK_T s am Stück zurück, dann BACK_CD s Pause', () => {
  const w = mkWorld(), u = spawn(w, 'sniper', 600, 400, 'blau'), e = spawn(w, 'krieger', 700, 400, 'rot'); still(e); e.T = { ...UNITS.krieger, speed: 20 };
  u.cd = 1e9;
  let run1 = 0, longest = 0, starts = [], t = 0, prev = false;
  run(w, u, 9, () => {
    t += DT;
    e.x -= 20 * DT;   // kommt langsam heran
    const b = u.rv[RV_BACK] > 0;
    if (b && !prev) starts.push(t);
    if (b) { run1 += DT; longest = Math.max(longest, run1); } else run1 = 0;
    prev = b;
  });
  assert.ok(starts.length >= 1, 'weicht zurück');
  assert.ok(longest <= SNIPER.BACK_T + 2 * DT, `am Stück ${longest.toFixed(2)} s`);
  for (let k = 1; k < starts.length; k++) assert.ok(starts[k] - starts[k - 1] >= SNIPER.BACK_CD, `Pause ${(starts[k] - starts[k - 1]).toFixed(2)} s`);
});
