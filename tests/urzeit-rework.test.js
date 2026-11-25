// Urzeit-Rework (25.11., Wunsch Silas: „generisch und schwach“): Fressen, Raptor-Rudeljagd, Dino-Reiter, Kriegsbemalung,
// Großwildjagd, Mammut und Jungtiere im Nest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, YOUNG } from '../game/js/data.js';
import { createWorld, spawn, rebuildHash } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { hurt, BIG_GAME, NEST } from '../game/js/combat.js';
import { FEAST, PACK, PAINT, RIDE, TUSK, scare, feast } from '../game/js/abilities.js';

const DT = 1 / 60;
const mkWorld = (seed = 7) => { const w = createWorld(1400, 800, seed); w.teamMode = true; return w; };
const dummy = (w, type, x, y, team = 'rot') => { const e = spawn(w, type, x, y, team); e.hp = 1e9; e.cd = 1e9; e.abCd = 1e9; return e; };
const run = (w, secs, each) => { for (let t = 0; t < secs - 1e-9; t += DT) { step(w, DT); if (each) each(w.events); w.events.length = 0; } };
const adult = u => { u.growT = 0; u.T = UNITS[u.type]; u.hp = u.T.hp; return u; };

test('Fressen: ein Dino, der einen Gegner erledigt, heilt und wächst; Jungtiere wachsen schneller', () => {
  const w = mkWorld();
  const t = adult(spawn(w, 'trike', 400, 400, 'blau')); t.hp = 100;
  const k = spawn(w, 'krieger', 430, 400, 'rot');
  rebuildHash(w);
  hurt(w, k, 1e9, 'melee', t);
  assert.equal(t.feast, 1);
  assert.ok(Math.abs(t.hp - (100 + FEAST.HEAL * UNITS.trike.hp)) < 1e-6, 'geheilt');
  assert.ok(w.events.some(e => e.type === 'ability' && e.k === 'feast'));
  for (let i = 0; i < 5; i++) hurt(w, spawn(w, 'krieger', 430, 400, 'rot'), 1e9, 'melee', t);
  assert.equal(t.feast, FEAST.MAX, 'höchstens MAX Stufen');
  const y = spawn(w, 'raptor', 600, 400, 'blau'), g0 = y.growT;
  hurt(w, spawn(w, 'krieger', 620, 400, 'rot'), 1e9, 'melee', y);
  assert.ok(Math.abs(y.growT - (g0 - FEAST.GROW)) < 1e-6, 'Jungtier wächst GROW s schneller');
  // nur Dinos fressen, keine Eigenen
  const h = spawn(w, 'hoehle', 700, 400, 'blau');
  feast(w, h, spawn(w, 'krieger', 720, 400, 'rot')); assert.equal(h.feast, 0);
  const t2 = adult(spawn(w, 'anky', 800, 400, 'blau')); feast(w, t2, spawn(w, 'speer', 820, 400, 'blau')); assert.equal(t2.feast, 0);
});

test('Rudeljagd: ab drei Raptoren springen alle gemeinsam dieselbe Beute an', () => {
  const w = mkWorld();
  const R = [0, 1, 2].map(i => { const r = adult(spawn(w, 'raptor', 300, 370 + i * 30, 'blau')); r.abCd = i ? 5 : 0; return r; });
  const prey = dummy(w, 'krieger', 300 + PACK.REACH - 40, 400);
  let hunts = 0, pounces = 0;
  run(w, DT * 3, ev => { for (const e of ev) if (e.type === 'ability') { if (e.k === 'hunt') hunts++; if (e.k === 'pounce') pounces++; } });
  assert.equal(hunts, 1);
  assert.equal(pounces, 3, 'alle drei springen');
  for (const r of R) { assert.equal(r.tg, prey); assert.ok(r.state === 'air' || r.pounce, 'im Sprung'); }
});

test('Raptor allein springt weiter nur auf Fernkämpfer und Heiler', () => {
  const w = mkWorld();
  const r = adult(spawn(w, 'raptor', 300, 400, 'blau')); r.abCd = 0;
  dummy(w, 'krieger', 420, 400);
  let n = 0; run(w, DT * 3, ev => { n += ev.filter(e => e.type === 'ability' && (e.k === 'pounce' || e.k === 'hunt')).length; });
  assert.equal(n, 0);
});

test('Dino-Reiter: Höhlenmensch steigt auf, ist kein Ziel, wirft Steine, springt beim Tod des Dinos ab', () => {
  const w = mkWorld();
  const m = spawn(w, 'mammut', 400, 400, 'blau');
  const h = spawn(w, 'hoehle', 380, 430, 'blau');
  run(w, 1.5);
  assert.equal(h.ride, m); assert.equal(m.rider, h);
  assert.ok(Math.abs(h.x - m.x) < 1 && h.z > 10, 'sitzt oben');
  // nicht im Raster: Feinde finden nur den Dino
  rebuildHash(w);
  assert.ok(!w.hash.some(c => c.includes(h)));
  // Steine auf Feinde in Reichweite
  const e = dummy(w, 'krieger', 400 + RIDE.RANGE - 30, 400); e.speed = 0;
  let rocks = 0; run(w, RIDE.CD * 1.5, ev => { rocks += ev.filter(x => x.type === 'shot' && x.kind === 'rock').length; });
  assert.ok(rocks >= 1, 'Reiter wirft');
  // furchtlos
  scare(w, m, 3); assert.equal(m.fearT, 0);
  hurt(w, m, 1e9, 'melee', e);
  run(w, DT * 2);
  assert.equal(h.ride, null); assert.ok(h.alive, 'springt ab');
});

test('Kriegsbemalung: Schamanin bemalt kämpfende Verbündete, sie schlagen härter und erschrecken nicht', () => {
  const w = mkWorld();
  const s = spawn(w, 'schamane', 300, 400, 'blau'); s.abCd = 0;
  const K = [0, 1, 2].map(i => spawn(w, 'hoehle', 340, 380 + i * 20, 'blau'));
  const foe = dummy(w, 'krieger', 400, 400);
  for (const k of K) k.tg = foe;
  let painted = 0; run(w, DT * 2, ev => { painted += ev.filter(e => e.type === 'ability' && e.k === 'paint').length; });
  assert.equal(painted, 3);
  for (const k of K) assert.ok(k.paintT > PAINT.T - .1);
  scare(w, K[0], 2); assert.equal(K[0].fearT, 0);
  // Schaden ×PAINT.DMG im Nahkampf
  const a = spawn(w, 'hoehle', 600, 600, 'blau'), b = dummy(w, 'krieger', 615, 600);
  a.paintT = 5; a.hits = -99; rebuildHash(w);
  const hp0 = b.hp; a.cd = 0; a.tg = b; run(w, DT);
  const d = hp0 - b.hp;
  assert.ok(d >= UNITS.hoehle.dmg * .85 * PAINT.DMG - 1e-6 && d <= UNITS.hoehle.dmg * 1.15 * PAINT.DMG + 1e-6, `Schaden ${d}`);
});

test('Großwildjagd: Speer bleibt in großen Zielen stecken (mehr Schaden, langsamer), kleine nicht', () => {
  const w = mkWorld();
  const sp = spawn(w, 'speer', 300, 400, 'blau');
  const big = dummy(w, 'troll', 450, 400); big.speed = 0;
  const small = dummy(w, 'krieger', 450, 600); small.speed = 0;
  assert.ok(UNITS.troll.mass >= BIG_GAME.MASS && UNITS.krieger.mass < BIG_GAME.MASS);
  sp.cd = 0; sp.tg = big;
  let stuck = 0; run(w, 2, ev => { stuck += ev.filter(e => e.type === 'ability' && e.k === 'stuck').length; });
  assert.ok(stuck >= 1); assert.ok(big.slowT > 0);
  assert.equal(small.slowT, 0);
});

test('Mammut: Stoßzähne schleudern Gegner vorn hoch, dickes Fell gegen Pfeile, Feuer tut mehr weh', () => {
  const w = mkWorld();
  const m = spawn(w, 'mammut', 400, 400, 'blau'); m.face = 1; m.abCd = 0;
  const k = dummy(w, 'krieger', 400 + UNITS.mammut.r + 14, 400);
  let tusk = 0; run(w, DT * 3, ev => { tusk += ev.filter(e => e.type === 'ability' && e.k === 'tusk').length; });
  assert.equal(tusk, 1);
  assert.equal(k.state, 'air', 'hochgeschleudert');
  const a = spawn(w, 'mammut', 800, 200, 'blau'), hp0 = a.hp;
  hurt(w, a, 100, 'arrow', null); assert.ok(Math.abs(hp0 - a.hp - 60) < 1e-6);
  const b = spawn(w, 'mammut', 800, 600, 'blau'), hp1 = b.hp;
  hurt(w, b, 100, 'fire', null); assert.ok(Math.abs(hp1 - b.hp - 130) < 1e-6);
  assert.ok(TUSK.MAXM < UNITS.mammut.mass);
});

test('Nest: Jungtiere bleiben stehen, bis ein Feind nah ist oder sie groß sind', () => {
  const w = mkWorld();
  const t = spawn(w, 'trike', 300, 400, 'blau');
  dummy(w, 'krieger', 900, 400);
  const x0 = t.x;
  run(w, 2);
  assert.ok(t.growT > 0 && Math.abs(t.x - x0) < 3, 'wartet im Nest');
  t.growT = 1e-3; run(w, 2);
  assert.ok(t.x - x0 > 20, 'erwachsen läuft er los');
  const w2 = mkWorld(), y = spawn(w2, 'raptor', 300, 400, 'blau'), e = dummy(w2, 'krieger', 300 + NEST.R - 40, 400);
  e.speed = 0; const d0 = e.x - y.x; run(w2, 1);
  assert.ok(e.x - y.x < d0 - 10, 'nahe Feinde greift auch ein Jungtier an');
  assert.ok(YOUNG.raptor);
});
