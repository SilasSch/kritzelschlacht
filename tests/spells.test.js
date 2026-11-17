// Zauberbuch der Magier und Gruppenzauber Meteor (Spez. #31, Nachtrag 3, Festlegungen 2, 4, 5): spells.js wählt je
// Wurf nach der Lage (Feuerball, Blitz, Windstoß, Steinwand), drei Magier zusammen kanalisieren einen Meteor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, rebuildHash, cellIndex, setCell, clearBattle, resizeWorld } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { attack, think, BURN_MAX_GEN } from '../game/js/combat.js';
import { scare } from '../game/js/abilities.js';
import { createStroke, paintTerrain, undo } from '../game/js/paint.js';
import { poseUnit } from '../game/js/render/pose.js';
import { createFxCore } from '../game/js/render/fxcore.js';
import { createRng } from '../game/js/rng.js';
import { UNITS, CELL } from '../game/js/data.js';
import {
  chooseSpell, lightning, windGust, stoneWall, stepSpells, SPELL, LIGHTNING, WIND, STONE_WALL, METEOR, FIREBALL,
  clearSpellWalls,
} from '../game/js/spells.js';

const DT = 1 / 60;
const mkWorld = (seed = 7) => { const w = createWorld(1400, 800, seed); w.teamMode = true; return w; };
// Gegner, der nie zuschlägt und nicht stirbt; frozen: steht betäubt still
const dummy = (w, type, x, y, team = 'rot', frozen = false) => {
  const e = spawn(w, type, x, y, team); e.hp = 1e9; e.cd = 1e9;
  if (frozen) { e.state = 'stun'; e.stunT = 1e9; }
  return e;
};
const run = (w, secs, each) => {
  for (let t = 0; t < secs - 1e-9; t += DT) { step(w, DT); if (each) each(w.events); w.events.length = 0; }
};
const best = w => { w.rng = () => .9; return w; };   // kein Zufall: immer der beste Zauber

/* ---------- Wahl nach Lage ---------- */
test('Wahl nach Lage: Nahkämpfer in 40 px → Windstoß, lädt der Wind noch → Steinwand', () => {
  const w = best(mkWorld()), m = spawn(w, 'magier', 400, 400, 'blau'), k = dummy(w, 'krieger', 440, 400);
  rebuildHash(w);
  assert.equal(chooseSpell(w, m, k), 'wind');
  m.windCd = 3;
  assert.equal(chooseSpell(w, m, k), 'wall');
  m.wallCd = 5;
  assert.notEqual(chooseSpell(w, m, k), 'wind'); assert.notEqual(chooseSpell(w, m, k), 'wall');
  // ein Schütze (Fernkämpfer) in 40 px ist kein Nahkämpfer
  const w2 = best(mkWorld()), m2 = spawn(w2, 'magier', 400, 400, 'blau'), s = dummy(w2, 'schuetze', 440, 400);
  rebuildHash(w2);
  assert.notEqual(chooseSpell(w2, m2, s), 'wind');
  // Bienen (Nahkämpfer, fliegen): Windstoß ja, aber keine Steinwand (sie fliegen darüber)
  const w3 = best(mkWorld()), m3 = spawn(w3, 'magier', 400, 400, 'blau'), b = dummy(w3, 'biene', 430, 400);
  rebuildHash(w3);
  assert.equal(chooseSpell(w3, m3, b), 'wind');
  m3.windCd = 3;
  assert.notEqual(chooseSpell(w3, m3, b), 'wall');
});

test('Wahl nach Lage: 6 Feinde dicht → Feuerball; Biene allein → Blitz', () => {
  const w = best(mkWorld()), m = spawn(w, 'magier', 300, 400, 'blau');
  const foes = [];
  for (let k = 0; k < 6; k++) foes.push(dummy(w, 'krieger', 500 + (k % 3) * 18, 390 + (k / 3 | 0) * 20));
  rebuildHash(w);
  assert.equal(chooseSpell(w, m, foes[0]), 'fireball');
  const w2 = best(mkWorld()), m2 = spawn(w2, 'magier', 300, 400, 'blau'), b = dummy(w2, 'biene', 480, 400);
  rebuildHash(w2);
  assert.equal(chooseSpell(w2, m2, b), 'lightning');
  // ein dichter Bienenschwarm ist eine dichte Gruppe (Lage: Gruppe vor Flieger) → Feuerball
  const w4 = best(mkWorld()), m4 = spawn(w4, 'magier', 300, 400, 'blau'), bees = [];
  for (let k = 0; k < 8; k++) bees.push(dummy(w4, 'biene', 480 + (k % 4) * 9, 392 + (k / 4 | 0) * 12));
  rebuildHash(w4);
  assert.equal(chooseSpell(w4, m4, bees[0]), 'fireball');
  // ein einzelner Bodenfeind: auch Blitz
  const w3 = best(mkWorld()), m3 = spawn(w3, 'magier', 300, 400, 'blau'), r = dummy(w3, 'ritter', 480, 400);
  rebuildHash(w3);
  assert.equal(chooseSpell(w3, m3, r), 'lightning');
});

test('kein Feuerball auf Eigene: 3 Eigene und 2 Feinde im Einschlagkreis → nie Feuerball', () => {
  const w = mkWorld(), m = spawn(w, 'magier', 300, 400, 'blau');
  const t = dummy(w, 'krieger', 500, 400); dummy(w, 'krieger', 515, 410);
  for (let k = 0; k < 3; k++) dummy(w, 'krieger', 490 + k * 14, 380 + k * 3, 'blau');
  rebuildHash(w);
  for (let k = 0; k < 60; k++) assert.notEqual(chooseSpell(w, m, t), 'fireball');
  // ohne die Eigenen wäre es ein Feuerball (zwei Feinde: Feuerball vor Blitz)
  const w2 = best(mkWorld()), m2 = spawn(w2, 'magier', 300, 400, 'blau');
  const t2 = dummy(w2, 'krieger', 500, 400); dummy(w2, 'krieger', 515, 410);
  rebuildHash(w2);
  assert.equal(chooseSpell(w2, m2, t2), 'fireball');
});

test('mit 20 % (world.rng) der zweitbeste passende Zauber', () => {
  const w = mkWorld(11), m = spawn(w, 'magier', 300, 400, 'blau');
  const foes = [];
  for (let k = 0; k < 6; k++) foes.push(dummy(w, 'krieger', 500 + (k % 3) * 18, 390 + (k / 3 | 0) * 20));
  rebuildHash(w);
  let second = 0; const N = 1000;
  for (let k = 0; k < N; k++) { const s = chooseSpell(w, m, foes[0]); if (s !== 'fireball') { second++; assert.equal(s, 'lightning'); } }
  assert.ok(second > N * SPELL.SECOND_P * .7 && second < N * SPELL.SECOND_P * 1.3, `zweitbester ${second}/${N}`);
  assert.equal(SPELL.SECOND_P, .2);
});

test('Magier wirkt im Kampf: Blitz auf einen einzelnen Feind (sofort, Ereignis spell bolt, keine Geschosse)', () => {
  const w = best(mkWorld()), m = spawn(w, 'magier', 300, 400, 'blau'), r = dummy(w, 'ritter', 480, 400, 'rot', true);
  m.cd = 0; rebuildHash(w);
  const hp = r.hp;
  think(w, m, DT);
  assert.ok(w.events.some(e => e.type === 'spell' && e.k === 'bolt'), 'Blitz');
  assert.ok(r.hp < hp, 'sofort getroffen');
  assert.equal(w.proj.length, 0);
  assert.ok(m.cd > 0, 'lädt danach wie nach einem Wurf');
});

test('Windstoß und Steinwand als Reaktion: auch während des Nachladens, geprüft alle SPELL.REACT_T s', () => {
  const w = best(mkWorld()), m = spawn(w, 'magier', 400, 400, 'blau'), k = dummy(w, 'krieger', 450, 400, 'rot', true);
  m.cd = 2; rebuildHash(w);
  think(w, m, DT);
  assert.ok(w.events.some(e => e.type === 'spell' && e.k === 'wind'), 'Windstoß trotz Nachladen');
  assert.ok(m.cd > 1.5, 'lädt danach neu');
  // Wind lädt, ein Angreifer kommt auf 55 px: die Wand steht zwischen beiden
  const w2 = best(mkWorld()), m2 = spawn(w2, 'magier', 400, 400, 'blau');
  dummy(w2, 'krieger', 1200, 400, 'rot', true);   // ein Ziel weit weg
  m2.cd = 2; m2.windCd = 3; rebuildHash(w2);
  think(w2, m2, DT);
  assert.equal(w2.tempWalls.length, 0, 'ohne Angreifer in 60 px nichts');
  const a = dummy(w2, 'krieger', 455, 400, 'rot', true); rebuildHash(w2);
  think(w2, m2, DT);
  assert.equal(w2.tempWalls.length, 0, 'gedrosselt: erst nach REACT_T wieder geprüft');
  for (let t = 0; t < SPELL.REACT_T + .05; t += DT) think(w2, m2, DT);
  assert.ok(w2.tempWalls.length >= STONE_WALL.MIN, `Wand ${w2.tempWalls.length}`);
  for (const e of w2.tempWalls) { const gx = e.i % w2.GW; assert.ok(gx * CELL + 5 > m2.x && gx * CELL + 5 < a.x, 'zwischen Magier und Angreifer'); }
});

/* ---------- Feuerball ---------- */
test('Feuerball setzt Getroffene in Brand (Feuer, auch Eigene im Splash)', () => {
  const w = mkWorld(), m = spawn(w, 'magier', 300, 400, 'blau'), t = dummy(w, 'krieger', 420, 400), o = dummy(w, 'krieger', 436, 400, 'blau');
  rebuildHash(w);
  m.cd = 0; attack(w, m, t, 120, 120, 0, 420, 400);
  for (let k = 0; k < 40 && w.proj.length; k++) step(w, DT);
  assert.ok(t.burnT > 0, 'Ziel brennt');
  assert.ok(o.burnT > 0, 'Eigener im Splash brennt auch (Festlegung 2)');
  assert.equal(t.burnGen, FIREBALL.GEN);
  assert.ok(FIREBALL.GEN <= BURN_MAX_GEN);
});

/* ---------- Blitz ---------- */
test('Blitz springt: 4 Feinde in einer Kette (50 px) → 4 Treffer, Schaden ×0,7 je Sprung; Eigene übersprungen', () => {
  const w = mkWorld(), m = spawn(w, 'magier', 300, 400, 'blau');
  const chain = [0, 1, 2, 3].map(k => dummy(w, 'krieger', 500 + k * 50, 400));
  const own = dummy(w, 'krieger', 575, 412, 'blau');
  const far = dummy(w, 'krieger', 750, 400);   // 100 px hinter dem letzten: kein fünfter Sprung
  rebuildHash(w);
  const hp0 = chain.map(u => u.hp), ownHp = own.hp, farHp = far.hp;
  lightning(w, m, chain[0]);
  const hits = w.events.filter(e => e.type === 'hit' && e.kind === 'lightning');
  assert.equal(hits.length, 4, `Treffer ${hits.length}`);
  const dmg = chain.map((u, k) => hp0[k] - u.hp);
  assert.ok(Math.abs(dmg[0] - LIGHTNING.DMG) < 1e-6, `erster ${dmg[0]}`);
  for (let k = 1; k < 4; k++) assert.ok(Math.abs(dmg[k] - dmg[k - 1] * LIGHTNING.FALL) < 1e-6, `Sprung ${k}: ${dmg[k]}`);
  assert.equal(own.hp, ownHp, 'Eigener nicht getroffen');
  assert.equal(far.hp, farHp, 'höchstens 3 Sprünge');
  assert.equal(w.events.filter(e => e.type === 'spell' && e.k === 'bolt').length, 4, 'ein Blitzbogen je Treffer');
  assert.deepEqual([LIGHTNING.DMG, LIGHTNING.FALL, LIGHTNING.JUMPS, LIGHTNING.R], [18, .7, 3, 70]);
});

/* ---------- Windstoß ---------- */
test('Windstoß: Kegel 60°/110 px schleudert alle, Schaden nur an Feinden, Bienen fliegen weit, eigene Abklingzeit', () => {
  const w = mkWorld(), m = spawn(w, 'magier', 400, 400, 'blau');
  const foe = dummy(w, 'krieger', 450, 400), ally = dummy(w, 'krieger', 470, 425, 'blau'), bee = dummy(w, 'biene', 460, 385);
  const behind = dummy(w, 'krieger', 340, 400), side = dummy(w, 'krieger', 400, 470), out = dummy(w, 'krieger', 530, 400);
  rebuildHash(w);
  const hp = [foe, ally, behind, side, out].map(u => u.hp);
  windGust(w, m, 1, 0);
  assert.ok(Math.abs(hp[0] - foe.hp - WIND.DMG) < 1e-6, `Feind ${hp[0] - foe.hp}`);
  assert.equal(ally.hp, hp[1], 'Eigene unverletzt');
  assert.ok(foe.vx > 100 && ally.vx > 100, `geschoben ${foe.vx} ${ally.vx}`);
  assert.ok(bee.vx > 2 * foe.vx, `Biene weit weg ${bee.vx}`);
  for (const u of [behind, side, out]) assert.ok(Math.abs(u.vx) + Math.abs(u.vy) < 1e-6, 'außerhalb des Kegels');
  assert.equal(m.windCd, WIND.CD); assert.equal(WIND.CD, 6);
  assert.ok(w.events.some(e => e.type === 'spell' && e.k === 'wind'));
});

/* ---------- Steinwand ---------- */
test('Steinwand: Mauerzellen quer 40 px vor dem Magier, nie auf Einheiten oder Lava, nach 12 s Brocken', () => {
  const w = mkWorld(), m = spawn(w, 'magier', 400, 400, 'blau');
  const k = dummy(w, 'krieger', 441, 381);
  const lava = cellIndex(w, 445, 425); setCell(w, lava, 2);
  rebuildHash(w);
  const v0 = w.terrainVersion;
  const n = stoneWall(w, m, 1, 0);
  assert.ok(n >= STONE_WALL.MIN && n <= 7, `Zellen ${n}`);
  const cells = w.tempWalls.map(e => e.i);
  assert.equal(cells.length, n);
  for (const i of cells) {
    assert.equal(w.terr[i], 4); assert.equal(w.towner[i], 2); assert.equal(w.whp[i], 140);
    const gx = i % w.GW, gy = i / w.GW | 0;
    assert.equal(gx, 44, 'Zeile 40 px voraus');
    const cx = gx * CELL + 5, cy = gy * CELL + 5;
    const dx = Math.max(Math.abs(k.x - cx) - 5, 0), dy = Math.max(Math.abs(k.y - cy) - 5, 0);
    assert.ok(dx * dx + dy * dy > k.T.r * k.T.r, 'nicht auf dem Krieger');
  }
  assert.ok(!cells.includes(lava)); assert.equal(w.terr[lava], 2, 'Lava bleibt');
  assert.ok(w.terrainVersion > v0, 'Flussfeld rechnet neu');
  assert.ok(w.events.some(e => e.type === 'terrain'), 'Renderer erfährt es');
  assert.equal(m.wallCd, STONE_WALL.CD); assert.equal(STONE_WALL.CD, 10);
  const v1 = w.terrainVersion;
  w.events.length = 0;
  for (let t = 0; t < 12.1; t += DT) stepSpells(w, DT);
  for (const i of cells) { assert.equal(w.terr[i], 0); assert.equal(w.towner[i], 0); }
  assert.equal(w.tempWalls.length, 0);
  assert.ok(w.terrainVersion > v1, 'Zerfall: Flussfeld rechnet neu');
  assert.ok(w.debris.length >= n, `Brocken ${w.debris.length}`);
  assert.ok(w.events.some(e => e.type === 'terrain'));
});

test('Steinwand: unter 3 freien Zellen keine Mauer; schon zerstörte Zellen fallen aus der Liste', () => {
  const w = mkWorld(), m = spawn(w, 'magier', 400, 400, 'blau');
  for (let y = 360; y <= 440; y += 10) setCell(w, cellIndex(w, 440, y), 1);   // Wasser auf der ganzen Linie
  rebuildHash(w);
  assert.equal(stoneWall(w, m, 1, 0), 0);
  assert.equal(w.tempWalls.length, 0); assert.equal(m.wallCd, 0);
  const w2 = mkWorld(), m2 = spawn(w2, 'magier', 400, 400, 'blau');
  rebuildHash(w2);
  stoneWall(w2, m2, 0, 1);
  const [a, ...rest] = w2.tempWalls.map(e => e.i);
  w2.terr[a] = 0; w2.towner[a] = 0; w2.whp[a] = 0;   // vorher zerschlagen
  setCell(w2, rest[0], 3, 0);                         // übermalt (Wald)
  for (let t = 0; t < 12.1; t += DT) stepSpells(w2, DT);
  assert.equal(w2.terr[rest[0]], 3, 'übermalte Zelle bleibt');
  for (const i of rest.slice(1)) assert.equal(w2.terr[i], 0);
  assert.equal(w2.tempWalls.length, 0);
});

test('Steinwand: Rückgängig und Leeren entfernen sie, Malen und Radierer behandeln sie wie eigenes Gelände', () => {
  const w = mkWorld(), m = spawn(w, 'magier', 400, 400, 'blau');
  rebuildHash(w);
  stoneWall(w, m, 1, 0);
  const cells = w.tempWalls.map(e => e.i);
  // Radierer über eine Zelle (Sandkasten): weg; Rückgängig dieses Strichs stellt sie nicht wieder her
  const s = createStroke();
  const c0 = cells[0], x0 = (c0 % w.GW) * CELL + 5, y0 = (c0 / w.GW | 0) * CELL + 5;
  paintTerrain(w, s, x0, y0, 4, 'radierer', null, 'plan');
  assert.equal(w.terr[c0], 0);
  undo(w, s);
  for (const i of cells) assert.equal(w.terr[i], 0, 'Rückgängig entfernt alle Steinwände');
  assert.equal(w.tempWalls.length, 0);
  // Mission (Planphase): auf eine Steinwand darf gemalt werden, ohne Erstattung
  stoneWall(w, m, 1, 0);
  const mission = { budget: 100, spent: 10 }, c1 = w.tempWalls[0].i;
  paintTerrain(w, createStroke(), (c1 % w.GW) * CELL + 5, (c1 / w.GW | 0) * CELL + 5, 4, 'wald', mission, 'plan');
  assert.equal(w.terr[c1], 3, 'übermalt');
  assert.ok(Math.abs(mission.spent - 10.04) < 1e-9, `keine Erstattung für die Steinwand: ${mission.spent}`);
  clearSpellWalls(w);
  assert.equal(w.tempWalls.length, 0);
  for (let i = 0; i < w.terr.length; i++) assert.ok(w.towner[i] !== 2);
  stoneWall(w, m, 1, 0);
  clearBattle(w);
  assert.equal(w.tempWalls.length, 0); assert.equal(w.casts.length, 0);
});

test('Steinwand übersteht eine Größenänderung der Welt (Zellindizes neu)', () => {
  const w = mkWorld(), m = spawn(w, 'magier', 400, 400, 'blau');
  rebuildHash(w);
  stoneWall(w, m, 1, 0);
  const n = w.tempWalls.length;
  resizeWorld(w, 1200, 700);
  assert.equal(w.tempWalls.length, n);
  for (const e of w.tempWalls) { assert.equal(w.terr[e.i], 4); assert.equal(w.towner[e.i], 2); }
});

/* ---------- Meteor ---------- */
// n Magier dicht beieinander (20 px) gegen 8 betäubte Feinde in einem Pulk 200 px vor ihnen
function meteorScene(n, ownInCircle = 0) {
  const w = best(mkWorld(5)), mages = [];
  for (let k = 0; k < n; k++) { const u = spawn(w, 'magier', 300, 380 + k * 20, 'blau'); u.cd = k ? 1 : 0; mages.push(u); }
  for (let k = 0; k < 8; k++) dummy(w, 'krieger', 500 + (k % 3) * 18, 375 + (k / 3 | 0) * 20, 'rot', true);
  // Eigene im Ring (48 px) um die Mitte des Pulks: in jedem Einschlagkreis um einen der Feinde
  for (let k = 0; k < ownInCircle; k++) { const a = k / ownInCircle * Math.PI * 2; dummy(w, 'krieger', 518 + Math.cos(a) * 48, 395 + Math.sin(a) * 48, 'blau', true); }
  rebuildHash(w);
  return { w, mages };
}
const bigBlasts = evs => evs.filter(e => e.type === 'blast' && e.R === METEOR.R);

test('Meteor nur in Gruppe: 2 Magier → kein Meteor', () => {
  const { w, mages } = meteorScene(2);
  let n = 0;
  run(w, 3, evs => { n += bigBlasts(evs).length; });
  assert.equal(n, 0);
  for (const m of mages) assert.equal(m.chanId, 0);
});

test('Meteor: 3 Magier kanalisieren 1,5 s still, dann blast R 80 mit Schaden 70 und Brand, 30 s Abklingzeit je Teilnehmer', () => {
  const { w, mages } = meteorScene(3);
  let t = 0, t0 = -1, tb = -1, blast = null, pos = null;
  run(w, 3, evs => {
    t += DT;
    if (t0 < 0 && mages.every(m => m.chanId > 0)) { t0 = t; pos = mages.map(m => [m.x, m.y]); }
    if (t0 >= 0 && tb < 0) for (let k = 0; k < 3; k++) assert.ok(Math.hypot(mages[k].x - pos[k][0], mages[k].y - pos[k][1]) < 1, 'steht still');
    for (const e of bigBlasts(evs)) { if (tb < 0) { tb = t; blast = e; } }
  });
  assert.ok(t0 > 0, 'Kanal begonnen');
  assert.ok(tb > 0, 'Meteor eingeschlagen');
  assert.ok(Math.abs(tb - t0 - METEOR.CHANNEL) < 2.5 * DT, `Kanal ${tb - t0}`);
  assert.equal(blast.kind, 'fire');
  assert.deepEqual([METEOR.R, METEOR.DMG, METEOR.CHANNEL, METEOR.CD, METEOR.GROUP_R, METEOR.MIN], [80, 70, 1.5, 30, 90, 3]);
  for (const m of mages) { assert.equal(m.chanId, 0); assert.ok(m.meteorCd > METEOR.CD - 2, `Abklingzeit ${m.meteorCd}`); }
  assert.ok(w.units.some(u => u.team === 'rot' && u.burnT > 0), 'Einschlag zündet an');
  assert.equal(w.casts.length, 0);
});

test('Meteor: stirbt ein Magier während des Kanals (unter 3), wird abgebrochen', () => {
  const { w, mages } = meteorScene(3);
  let n = 0;
  run(w, .5);
  assert.ok(mages.every(m => m.chanId > 0), 'kanalisieren');
  mages[1].hp = -1; mages[1].alive = false;
  run(w, 2.5, evs => { n += bigBlasts(evs).length; });
  assert.equal(n, 0, 'kein Meteor');
  assert.equal(mages[0].chanId, 0); assert.equal(mages[2].chanId, 0);
  assert.equal(w.casts.length, 0);
});

test('Meteor: ein erschreckter Teilnehmer fällt heraus; mit 4 Magiern geht es weiter', () => {
  const { w, mages } = meteorScene(4);
  let n = 0;
  run(w, .5);
  assert.ok(mages.every(m => m.chanId > 0), 'alle vier kanalisieren');
  scare(w, mages[0], 2);
  run(w, 2, evs => { n += bigBlasts(evs).length; });
  assert.equal(n, 1, 'drei reichen');
  assert.equal(mages[0].chanId, 0);
});

test('Meteor: kein Einschlag, wo mehr Eigene als Feinde im Kreis stehen', () => {
  const { w, mages } = meteorScene(3, 10);
  let n = 0;
  run(w, 3, evs => { n += bigBlasts(evs).length; });
  assert.equal(n, 0);
  for (const m of mages) assert.equal(m.chanId, 0);
});

/* ---------- Form, Darstellung ---------- */
test('spawn legt die Zauberfelder für alle Einheiten an', () => {
  const w = mkWorld(), k = spawn(w, 'krieger', 100, 100, 'blau'), m = spawn(w, 'magier', 200, 100, 'blau');
  for (const u of [k, m]) {
    assert.equal(u.windCd, 0); assert.equal(u.wallCd, 0); assert.equal(u.meteorCd, 0); assert.equal(u.chanId, 0);
  }
  assert.deepEqual(w.tempWalls, []); assert.deepEqual(w.casts, []);
});

test('Pose: kanalisierender Magier hebt den Stab', () => {
  const w = mkWorld(), m = spawn(w, 'magier', 200, 100, 'blau');
  const p0 = poseUnit(m, 1, {});
  assert.equal(p0.weaponLift, 0);
  m.chanId = 1;
  const p1 = poseUnit(m, 1, {});
  assert.ok(p1.weaponLift > .3, `Stab oben ${p1.weaponLift}`);
});

test('Effekte: Blitz, Wind, Steinwand und Meteor über das Budget; Kanalstrahlen und fallender Meteor aus world.casts', () => {
  const rng = createRng(3), fx = createFxCore({}, { rand: rng });
  fx.consume([
    { type: 'spell', k: 'bolt', x0: 100, y0: 100, x1: 200, y1: 120, z0: 0, z1: 0 },
    { type: 'spell', k: 'wind', x: 100, y: 100, nx: 1, ny: 0, R: WIND.R },
    { type: 'spell', k: 'wall', x: 140, y: 100, px: 0, py: 1, L: 30 },
    { type: 'spell', k: 'meteor', x: 300, y: 300, R: METEOR.R },
  ]);
  const by = fx.store.countByKind();
  for (const k of ['bolt', 'boltc', 'gust', 'wave', 'dust']) assert.ok(by[k] > 0, `${k}: ${JSON.stringify(by)}`);
  // Budget: 200 Blitze in einem Bild → höchstens FRAME_LIMITS.spell
  const fx2 = createFxCore({}, { rand: rng });
  fx2.consume(Array.from({ length: 200 }, () => ({ type: 'spell', k: 'bolt', x0: 0, y0: 0, x1: 60, y1: 0 })));
  assert.ok(fx2.stats().skipped.spell > 0);
  // Kanal: Strahlen von jedem Magier, Kugel am Himmel; in der letzten Phase fällt der Meteor
  const w = mkWorld(), ms = [0, 1, 2].map(k => { const u = spawn(w, 'magier', 300 + k * 20, 400, 'blau'); u.chanId = 1; return u; });
  w.casts.push({ id: 1, x: 500, y: 400, t: .5, sx: 450, sy: 210, f: 'blau', n: 3, m: ms });
  const fx3 = createFxCore({}, { rand: rng });
  for (let k = 0; k < 10; k++) fx3.update(DT, w);
  let b = fx3.store.countByKind();
  assert.ok(b.beam > 0 && b.orb > 0, JSON.stringify(b));
  assert.ok(!b.meteor);
  w.casts[0].t = METEOR.CHANNEL - .1;
  for (let k = 0; k < 4; k++) fx3.update(DT, w);
  b = fx3.store.countByKind();
  assert.ok(b.meteor > 0 && b.mtrail > 0, 'Meteor fällt mit Schweif');
  // Pause (update ohne Welt): die je Bild gesetzten Teile bleiben stehen, solange die Welt steht
  for (let k = 0; k < 30; k++) fx3.update(DT * .5, null);
  b = fx3.store.countByKind();
  assert.ok(b.meteor > 0 && b.beam === undefined && b.mark > 0, `in der Pause: ${JSON.stringify(b)}`);
  // weiter ohne Kanal (eingeschlagen): verschwinden sofort
  w.casts.length = 0;
  for (let k = 0; k < 2; k++) fx3.update(DT, w);
  b = fx3.store.countByKind();
  assert.ok(!b.meteor && !b.mark && !b.orb, JSON.stringify(b));
});

test('Daten: Zauberbuch-Karte in data.js (Feuerball, Blitz, Windstoß, Steinwand, Meteor)', () => {
  const names = UNITS.magier.abil.map(a => a.n);
  for (const n of ['Feuerball', 'Blitz', 'Windstoß', 'Steinwand', 'Meteor']) assert.ok(names.some(x => x.startsWith(n)), n);
});

// Task 7: gegen einen einzelnen Geist der Feuerball (nur Feuer trifft ihn voll), gegen andere Einzelziele der Blitz
test('Wahl nach Lage: einzelner Geist → Feuerball, einzelne Biene weiter Blitz', () => {
  const w = best(mkWorld()), m = spawn(w, 'magier', 300, 400, 'blau'), g = dummy(w, 'geist', 480, 400);
  rebuildHash(w);
  assert.equal(chooseSpell(w, m, g), 'fireball');
  const w2 = best(mkWorld()), m2 = spawn(w2, 'magier', 300, 400, 'blau'), b = dummy(w2, 'biene', 480, 400);
  rebuildHash(w2);
  assert.equal(chooseSpell(w2, m2, b), 'lightning');
});

// Task 7: eine zerschlagene Steinwand, an deren Stelle eine neue gezogen wird, zerfällt erst nach ihrer vollen Zeit
test('Steinwand an derselben Stelle neu: kein alter Eintrag lässt sie zu früh zerfallen', () => {
  const w = mkWorld(), m = spawn(w, 'magier', 400, 400, 'blau');
  rebuildHash(w);
  assert.ok(stoneWall(w, m, 1, 0) >= STONE_WALL.MIN);
  const cells = w.tempWalls.map(e => e.i);
  for (let t = 0; t < 8; t += DT) stepSpells(w, DT);   // 8 s alt
  // Wand dort von Hand weg (als wäre sie zerschlagen, der Eintrag hängt noch) und sofort neu gezogen
  for (const i of cells) { w.terr[i] = 0; w.towner[i] = 0; w.whp[i] = 0; }
  m.wallCd = 0;
  assert.ok(stoneWall(w, m, 1, 0) >= STONE_WALL.MIN);
  assert.equal(new Set(w.tempWalls.map(e => e.i)).size, w.tempWalls.length, 'je Zelle ein Eintrag');
  for (let t = 0; t < 6; t += DT) stepSpells(w, DT);   // alte Restzeit (4 s) vorbei, neue noch nicht
  for (const i of cells) if (w.tempWalls.some(e => e.i === i)) assert.equal(w.terr[i], 4, 'steht noch');
  assert.ok(w.tempWalls.length > 0);
});
