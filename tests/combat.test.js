import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, setCell, cellIndex, rebuildHash } from '../game/js/world.js';
import { hurt, blast, fire, hitWall, stepProjectiles, KITE, LINE } from '../game/js/combat.js';
import { RANGED } from '../game/js/data.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const mk = (type, x = 300, y = 300, team = 'rot') => {
  const w = createWorld(1400, 800, 5); w.teamMode = true;
  return { w, v: spawn(w, type, x, y, team) };
};

test('Rüstung: Ritter nimmt arrow 0.35, melee 0.7, bullet 0.8', () => {
  const { w, v } = mk('ritter');
  near(hurt(w, v, 10, 'arrow', null), 3.5);
  near(hurt(w, v, 10, 'melee', null), 7);
  near(hurt(w, v, 10, 'bullet', null), 8);
  near(hurt(w, v, 10, 'blast', null), 15);
});

test('Schildwall: Ritter nimmt bei arrow zusätzlich ×0.65', () => {
  const { w, v } = mk('ritter'); v.wall = true;
  near(hurt(w, v, 10, 'arrow', null), 10 * .35 * .65);
  near(hurt(w, v, 10, 'melee', null), 10 * .7 * .65);
  near(hurt(w, v, 10, 'bullet', null), 8);
});

test('Panzer: rocket 1.6, bullet 0.25', () => {
  const { w, v } = mk('panzer');
  near(hurt(w, v, 10, 'rocket', null), 16);
  near(hurt(w, v, 10, 'bullet', null), 2.5);
});

test('Heli: rocket 1.4', () => {
  const { w, v } = mk('heli');
  near(hurt(w, v, 10, 'rocket', null), 14);
});

test('Geist: Nicht-Feuer 0.5, Feuer voll', () => {
  const { w, v } = mk('geist');
  near(hurt(w, v, 10, 'melee', null), 5);
  near(hurt(w, v, 10, 'fire', null), 10);
});

test('Wald: Deckung ×0.5 gegen arrow|blast|bullet|rocket, nicht gegen melee', () => {
  const { w, v } = mk('krieger', 305, 305);
  setCell(w, cellIndex(w, 305, 305), 3);
  for (const k of ['arrow', 'blast', 'bullet', 'rocket']) { v.hp = 1e6; near(hurt(w, v, 10, k, null), 5); }
  near(hurt(w, v, 10, 'melee', null), 10);
});

test('hurt: Tod setzt alive=false, zählt Kill und meldet death-Ereignis', () => {
  const { w, v } = mk('krieger'); const src = spawn(w, 'krieger', 280, 300, 'blau');
  hurt(w, v, 1000, 'melee', src);
  assert.equal(v.alive, false); assert.equal(src.kills, 1);
  assert.ok(w.events.some(e => e.type === 'death' && e.unitType === 'krieger' && e.team === 'rot'));
  assert.equal(hurt(w, v, 10, 'melee', src), 0);
});

test('death-Ereignis trägt Angaben zum Sieger (oder null)', () => {
  const { w, v } = mk('krieger'); const src = spawn(w, 'reiter', 280, 300, 'blau'); src.kills = 2;
  hurt(w, v, 1000, 'melee', src);
  const e = w.events.find(e => e.type === 'death');
  assert.equal(e.killerId, src.id); assert.equal(e.killerType, 'reiter');
  assert.equal(e.killerTeam, 'blau'); assert.equal(e.killerKills, 3);
  const o = spawn(w, 'wolf', 320, 300, 'rot'); w.events.length = 0;
  hurt(w, o, 1000, 'fire', null);
  const e2 = w.events.find(e => e.type === 'death');
  assert.equal(e2.killerId, null); assert.equal(e2.killerType, null); assert.equal(e2.killerTeam, null); assert.equal(e2.killerKills, null);
});

test('blast: Abfall auf 50 % am Rand, eigene Fraktion verschont', () => {
  const w = createWorld(1400, 800, 5); w.teamMode = true;
  const c = spawn(w, 'krieger', 500, 300, 'rot');
  const e = spawn(w, 'krieger', 540, 300, 'rot');
  const own = spawn(w, 'krieger', 500, 320, 'blau');
  rebuildHash(w);
  blast(w, 500, 300, 40, 20, 'blau', null, 'blast', 0);
  near(c.T.hp - c.hp, 20);
  near(e.T.hp - e.hp, 10);
  assert.equal(own.hp, own.T.hp);
  assert.ok(w.events.some(ev => ev.type === 'blast' && ev.R === 40 && ev.shake > 0));
});

test('hitWall: zerstörte Mauer wird leer und meldet terrain', () => {
  const w = createWorld(1400, 800, 5); const i = cellIndex(w, 205, 205); setCell(w, i, 4);
  hitWall(w, i, 100, 190, 205); assert.equal(w.terr[i], 4);
  hitWall(w, i, 100, 190, 205); assert.equal(w.terr[i], 0);
  assert.ok(w.events.some(e => e.type === 'terrain'));
});

test('fire: Pfeil fliegt, trifft und meldet shot + sound', () => {
  const w = createWorld(1400, 800, 5); w.teamMode = true;
  const s = spawn(w, 'schuetze', 300, 300, 'blau'); const t = spawn(w, 'krieger', 450, 300, 'rot');
  rebuildHash(w);
  fire(w, s, t, 'arrow');
  assert.equal(w.proj.length, 1);
  assert.ok(w.events.some(e => e.type === 'shot' && e.kind === 'arrow' && e.face === 1));
  assert.ok(w.events.some(e => e.type === 'sound' && e.k === 'twang'));
  for (let k = 0; k < 120 && w.proj.length; k++) stepProjectiles(w, 1 / 60);
  assert.equal(w.proj.length, 0);
  assert.ok(t.hp < t.T.hp);
});

test('Typ-Sets: RANGED in data.js, KITE und LINE in combat.js', () => {
  assert.ok(RANGED.has('schuetze') && RANGED.has('moerser') && !RANGED.has('krieger'));
  assert.deepEqual([...KITE].sort(), ['schuetze', 'sniper', 'soldat']);
  assert.deepEqual([...LINE].sort(), ['krieger', 'ritter', 'soldat']);
});
