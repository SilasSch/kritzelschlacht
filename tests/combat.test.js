import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, setCell, cellIndex, rebuildHash } from '../game/js/world.js';
import { hurt, blast, fire, hitWall, stepProjectiles, attack, think, KITE, LINE } from '../game/js/combat.js';
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

test('blast: Abfall auf 50 % am Rand, Friendly Fire trifft auch die eigene Fraktion', () => {
  const w = createWorld(1400, 800, 5); w.teamMode = true;
  const c = spawn(w, 'krieger', 500, 300, 'rot');
  const e = spawn(w, 'krieger', 540, 300, 'rot');
  const own = spawn(w, 'krieger', 500, 320, 'blau');
  rebuildHash(w);
  blast(w, 500, 300, 40, 20, 'blau', null, 'blast', 0);
  near(c.T.hp - c.hp, 20);
  near(e.T.hp - e.hp, 10);
  near(own.T.hp - own.hp, 15);
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
  assert.deepEqual([...KITE].sort(), ['lama', 'schuetze', 'soldat']);   // Scharfschütze: SNIPER.KEEP
  assert.deepEqual([...LINE].sort(), ['krieger', 'ritter', 'soldat']);
});

test('hitWall: terrain-Ereignis nur beim Unterschreiten von 70 LP oder beim Zerbrechen', () => {
  const w = createWorld(1400, 800, 5); const i = cellIndex(w, 205, 205); setCell(w, i, 4); // 140 LP
  const terr = () => w.events.filter(e => e.type === 'terrain').length;
  hitWall(w, i, 30, 190, 205); assert.equal(terr(), 0, '140 -> 110');
  assert.ok(w.events.some(e => e.type === 'wallHit'));
  hitWall(w, i, 30, 190, 205); assert.equal(terr(), 0, '110 -> 80');
  hitWall(w, i, 30, 190, 205); assert.equal(terr(), 1, '80 -> 50: Risse sichtbar');
  hitWall(w, i, 30, 190, 205); assert.equal(terr(), 1, '50 -> 20');
  hitWall(w, i, 30, 190, 205); assert.equal(terr(), 2, 'zerbrochen');
  assert.equal(w.terr[i], 0);
  // blast meldet terrain nur, wenn eine Mauer sichtbar wechselt
  const w2 = createWorld(1400, 800, 5); const j = cellIndex(w2, 405, 405); setCell(w2, j, 4); rebuildHash(w2);
  blast(w2, 405, 405, 20, 5, 'x', null, 'blast', 1); // 5 Schaden
  assert.equal(w2.events.filter(e => e.type === 'terrain').length, 0);
  blast(w2, 405, 405, 20, 100, 'x', null, 'blast', 1); // 135 -> 35
  assert.equal(w2.events.filter(e => e.type === 'terrain').length, 1);
});

/* ---------- Animations-Timer für die Rigs (Task 5) ---------- */
test('Timer: Schuss setzt fireT=0 (alle Fernkampfarten, auch Drachenfeuer)', () => {
  const w = createWorld(1400, 800, 5); w.teamMode = true;
  const t = spawn(w, 'krieger', 450, 300, 'rot');
  for (const type of ['schuetze', 'grenadier', 'magier', 'soldat', 'mg', 'sniper', 'panzerfaust', 'panzer', 'moerser', 'heli', 'drache']) {
    const s = spawn(w, type, 400, 300, 'blau'); rebuildHash(w);
    assert.ok(s.fireT >= .12, `${type}: kein Rückstoß im Ruhezustand`);
    s.cd = 0; attack(w, s, t, 50, 50, 0);
    assert.equal(s.fireT, 0, type);
  }
});

test('Timer: Treffer setzt hitT=0.15', () => {
  const { w, v } = mk('krieger');
  hurt(w, v, 1, 'melee', null);
  assert.equal(v.hitT, .15);
});

test('Timer: Schaden über Zeit (Lava, Feuer ohne Schützen) setzt hitT nicht, Treffer mit Quelle schon', () => {
  const { w, v } = mk('krieger');
  hurt(w, v, 1, 'fire', null);
  assert.equal(v.hitT, 0, 'Lava/Brand ohne Quelle quetscht nicht');
  const s = spawn(w, 'magier', 200, 300, 'blau');
  hurt(w, v, 1, 'fire', s);
  assert.equal(v.hitT, .15, 'Feuer mit Schütze quetscht');
  v.hitT = 0; hurt(w, v, 1, 'blast', null);
  assert.equal(v.hitT, .15, 'Explosion ohne Quelle (Absturz) quetscht');
});

test('Timer: Nahkampfschlag setzt swingT=0.25 (Schwert, Bärenhieb, Mauer)', () => {
  const w = createWorld(1400, 800, 5); w.teamMode = true;
  const t = spawn(w, 'ritter', 310, 300, 'rot');
  for (const type of ['krieger', 'baer', 'wolf', 'reiter']) {
    const u = spawn(w, type, 300, 300, 'blau'); rebuildHash(w);
    assert.equal(u.swingT, 0);
    u.cd = 0; attack(w, u, t, 10, 10, 0);
    assert.equal(u.swingT, .25, type);
  }
  // festgesteckt vor einer Mauer: draufhauen
  const w2 = createWorld(1400, 800, 5); w2.teamMode = true;
  const u = spawn(w2, 'krieger', 300, 300, 'blau'); spawn(w2, 'krieger', 1200, 300, 'rot');
  const i = cellIndex(w2, 312, 300); setCell(w2, i, 4); rebuildHash(w2);
  u.blk = 1; u.bcell = i; u.cd = 0;
  think(w2, u, 1 / 60);
  assert.ok(w2.whp[i] < 140, 'Mauer getroffen');
  assert.equal(u.swingT, .25);
});

test('Timer: think lässt fireT wachsen, swingT und hitT sinken bis 0', () => {
  const w = createWorld(1400, 800, 5); w.teamMode = true;
  const u = spawn(w, 'soldat', 300, 300, 'blau'); rebuildHash(w);   // kein Gegner: think kehrt früh zurück
  u.fireT = 0; u.swingT = .25; u.hitT = .15;
  think(w, u, .1);
  near(u.fireT, .1); near(u.swingT, .15); near(u.hitT, .05);
  think(w, u, .1);
  near(u.fireT, .2); near(u.swingT, .05); assert.equal(u.hitT, 0);
  think(w, u, .1);
  assert.equal(u.swingT, 0); assert.equal(u.hitT, 0);
});

// Nachtrag 4 (#37): Bienengift
test('Bienengift: ein Stich, Biene weg, das Ziel verliert 3 s lang Leben (4/s), frischt auf statt zu stapeln', async () => {
  const { createWorld, spawn, rebuildHash } = await import('../game/js/world.js');
  const { attack, think, POISON, hurt } = await import('../game/js/combat.js');
  const { isFire } = await import('../game/js/abilities.js');
  const { UNITS } = await import('../game/js/data.js');
  assert.deepEqual(POISON, { DPS: 4, T: 3 });
  assert.equal(isFire('poison'), false, 'Gift ist kein Feuer');
  assert.equal(UNITS.biene.cost, .55);
  const w = createWorld(1400, 800, 5); w.teamMode = true;
  const b = spawn(w, 'biene', 400, 400, 'blau'), k = spawn(w, 'krieger', 405, 400, 'rot'); k.cd = 1e9;
  rebuildHash(w);
  b.cd = 0; attack(w, b, k, 5, 5, 0);
  assert.ok(k.poisonT > 0, 'vergiftet');
  const hp0 = k.hp;
  b.alive = false;   // Biene weg
  k.T = { ...UNITS.krieger, speed: 0 };
  for (let i = 0; i < 60 * 4; i++) { rebuildHash(w); think(w, k, 1 / 60); }
  assert.ok(Math.abs(hp0 - k.hp - POISON.DPS * POISON.T) < 1e-6, `Giftschaden ${(hp0 - k.hp).toFixed(2)}`);
  assert.equal(k.poisonT, 0);
  // nur der erste Stich einer Biene vergiftet; ein neuer Giftstich frischt auf, stapelt nicht
  const w2 = createWorld(1400, 800, 5); w2.teamMode = true;
  const b1 = spawn(w2, 'biene', 400, 400, 'blau'), b2 = spawn(w2, 'biene', 400, 410, 'blau'), r = spawn(w2, 'ritter', 405, 405, 'rot');
  rebuildHash(w2);
  b1.cd = 0; attack(w2, b1, r, 5, 5, 0); r.poisonT = 1;
  b1.cd = 0; attack(w2, b1, r, 5, 5, 0);
  assert.equal(r.poisonT, 1, 'zweiter Stich derselben Biene vergiftet nicht neu');
  b2.cd = 0; attack(w2, b2, r, 5, 5, 0);
  assert.equal(r.poisonT, POISON.T, 'andere Biene frischt auf');
  // Maschinen: kein Gift; Gift durchdringt Rüstung (Ritter ×1)
  const p = spawn(w2, 'panzer', 600, 400, 'rot'); b2.cd = 0; attack(w2, b2, p, 5, 5, 0);
  assert.equal(p.poisonT, 0);
  const h = r.hp; hurt(w2, r, 4, 'poison', null, true); assert.ok(Math.abs(h - r.hp - 4) < 1e-9);
});

// Nachtrag 4 (#38): Sanitäter
test('Sanitäter: mehrere heilen dasselbe Ziel gedämpft (voll, 50 %, 25 %), nur das Ziel; Heilwelle mit Gruppen-Abklingzeit; Kosten 3,5', async () => {
  const { createWorld, spawn, rebuildHash } = await import('../game/js/world.js');
  const { think, HEAL_STACK } = await import('../game/js/combat.js');
  const { ABILITY, HEAL_WAVE, stepAbility } = await import('../game/js/abilities.js');
  const { UNITS } = await import('../game/js/data.js');
  assert.equal(UNITS.sani.cost, 3.5);
  assert.deepEqual(HEAL_STACK.MUL, [1, .5, .25]); assert.ok(HEAL_STACK.T < UNITS.sani.cd);
  const w = createWorld(1400, 800, 5); w.teamMode = true;
  const k = spawn(w, 'krieger', 400, 400, 'blau'); k.hp = 10;
  const n = spawn(w, 'krieger', 420, 400, 'blau'); n.hp = 10;   // Nachbar in 20 px: wird nicht mitgeheilt
  const ms = [0, 1, 2, 3].map(i => spawn(w, 'sani', 360, 380 + i * 12, 'blau'));
  for (const m of ms) { m.cd = 0; m.abCd = 99; m.tg = k; m.rt = 1; }
  w.time = 5; rebuildHash(w);
  for (const m of ms) think(w, m, 1 / 60);
  const h = UNITS.sani.heal;
  assert.ok(Math.abs(k.hp - (10 + h * (1 + .5 + .25 + .25))) < 1e-9, `LP ${k.hp}`);
  assert.equal(n.hp, 10, 'Nachbar bleibt');
  // nach HEAL_STACK.T s wieder voll
  w.time += HEAL_STACK.T; ms[0].cd = 0; ms[0].tg = k; ms[0].rt = 1;
  const before = k.hp; think(w, ms[0], 1 / 60);
  assert.ok(Math.abs(k.hp - before - h) < 1e-9);
  // Heilwelle: nahe Sanitäter (≤ SHARE) laden mit neu, ferne nicht
  assert.equal(HEAL_WAVE.SHARE, 120);
  const w2 = createWorld(1400, 800, 5); w2.teamMode = true;
  const a = spawn(w2, 'sani', 400, 400, 'blau'), b = spawn(w2, 'sani', 480, 400, 'blau'), c = spawn(w2, 'sani', 700, 400, 'blau');
  for (let i = 0; i < 3; i++) spawn(w2, 'krieger', 400 + i * 15, 430, 'blau').hp = 5;
  a.abCd = 0; b.abCd = 0; c.abCd = 0; rebuildHash(w2);
  assert.equal(stepAbility(w2, a, 1 / 60), false);   // Welle sofort fertig
  assert.ok(b.abCd >= ABILITY.sani.cd, `b wartet: ${b.abCd}`);
  assert.equal(c.abCd, 0, 'ferner Sanitäter unberührt');
});

// Fix-Runde 1 (Prüfung 4b): ein einzelner Sanitäter heilt immer voll, Ghule werden nicht vergiftet, Bienen vergessen Tote
test('Fix-Runde 1: einzelner Sanitäter 10 s lang immer volle Heilung; kein Gift für Ghule; Biene hält kein totes Stichziel', async () => {
  const { createWorld, spawn, rebuildHash } = await import('../game/js/world.js');
  const { think, attack } = await import('../game/js/combat.js');
  const { UNITS } = await import('../game/js/data.js');
  const w = createWorld(1400, 800, 5); w.teamMode = true;
  const k = spawn(w, 'krieger', 400, 400, 'blau'); k.T = { ...UNITS.krieger, hp: 1e6 }; k.hp = 1; k.cd = 1e9;
  const m = spawn(w, 'sani', 350, 400, 'blau'); m.T = { ...UNITS.sani, speed: 0 }; m.abCd = 1e9;
  const gains = [];
  for (let i = 0; i < 600; i++) {
    w.time += 1 / 60; rebuildHash(w);
    const h = k.hp; think(w, m, 1 / 60); if (k.hp > h) gains.push(k.hp - h);
  }
  assert.ok(gains.length >= 9, `Heilungen ${gains.length}`);
  assert.ok(gains.every(g => Math.abs(g - UNITS.sani.heal) < 1e-9), gains.join(','));
  // Ghul: kein Gift
  const b = spawn(w, 'biene', 600, 400, 'rot'), g = spawn(w, 'ghul', 605, 400, 'blau');
  rebuildHash(w); b.cd = 0; attack(w, b, g, 5, 5, 0);
  assert.equal(g.poisonT, 0);
  // Biene tötet ihr Ziel: kein Verweis bleibt
  const e = spawn(w, 'krieger', 610, 420, 'blau'); e.hp = 1;
  b.cd = 0; attack(w, b, e, 5, 5, 0);
  assert.ok(!e.alive); assert.equal(b.stingTg, null);
});
