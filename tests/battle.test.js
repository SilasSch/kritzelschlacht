// Schlacht-Modus (Spez. #45, battle.js): Wiederherstellen der Aufstellung, Sieger nach 180 s, 10× auswerten, Seite beim Malen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, TERRAIN, CELL } from '../game/js/data.js';
import { createWorld, spawn, rebuildHash, setCell } from '../game/js/world.js';
import { step, battleWinner, armyPoints, BATTLE_TIME } from '../game/js/sim.js';
import { ignite } from '../game/js/combat.js';
import { STONE_WALL } from '../game/js/spells.js';
import { stamp, createStroke, BY_HALF, sideAt } from '../game/js/paint.js';
import { snapshotBattle, restoreBattle, mirrorBattle, createBatch, createFight, stepFight } from '../game/js/battle.js';

const DT = 1 / 60;
const mkWorld = (seed = 7) => { const w = createWorld(1400, 800, seed); w.teamMode = true; return w; };
const cell = (w, x, y) => ((y / CELL) | 0) * w.GW + ((x / CELL) | 0);
const sig = w => w.units.filter(u => u.alive).map(u => `${u.type}|${u.team}|${u.x.toFixed(3)}|${u.y.toFixed(3)}|${u.hp}`);

// Zwei gemischte Armeen mit Gelände (Mauer, Wasser, Wald), Vampire und Magier für Ghule und Steinwände
function setup(w) {
  for (let y = 300; y < 500; y += CELL) setCell(w, cell(w, 700, y), TERRAIN.mauer.id);
  for (let x = 500; x < 560; x += CELL) for (let y = 600; y < 660; y += CELL) setCell(w, cell(w, x, y), TERRAIN.wasser.id);
  for (let x = 860; x < 900; x += CELL) for (let y = 150; y < 200; y += CELL) setCell(w, cell(w, x, y), TERRAIN.wald.id);
  for (let i = 0; i < 8; i++) spawn(w, 'krieger', 560 + (i % 2) * 20, 300 + i * 25, 'blau');
  for (let i = 0; i < 3; i++) spawn(w, 'vampir', 520, 350 + i * 40, 'blau');
  spawn(w, 'magier', 480, 400, 'blau');
  for (let i = 0; i < 6; i++) spawn(w, 'roemer', 840 - (i % 3) * 18, 360 + ((i / 3) | 0) * 18, 'rot');
  for (let i = 0; i < 6; i++) spawn(w, 'schuetze', 900, 280 + i * 30, 'rot');
  spawn(w, 'grenadier', 920, 450, 'rot');
  rebuildHash(w);
}

test('restoreBattle: stellt Einheiten und Gelände exakt wieder her, ohne Leichen, Formationen, Zauberwände, Ghule oder Brand', () => {
  const w = mkWorld();
  setup(w);
  const snap = snapshotBattle(w), units0 = sig(w), terr0 = w.terr.slice(), whp0 = w.whp.slice();
  for (let i = 0; i < 60 * 12; i++) { step(w, DT); w.events.length = 0; }
  // Was eine Schlacht hinterlassen kann, sicher dazu: Ghul, Steinwand, Brand, beschädigte Mauer
  const v = w.units.find(u => u.alive && u.type === 'vampir') || spawn(w, 'vampir', 400, 400, 'blau');
  const g = spawn(w, 'ghul', 420, 420, 'blau'); g.owner = v; v.ghouls++;
  const sw = cell(w, 300, 700); setCell(w, sw, TERRAIN.mauer.id, STONE_WALL.OWNER); w.tempWalls.push({ i: sw, t: 5 });
  const burning = w.units.find(u => u.alive && u.type === 'krieger'); if (burning) ignite(w, burning, 0, null);
  w.whp[cell(w, 700, 400)] = 3;
  assert.ok(w.corpses.length > 0, 'die Schlacht hat Leichen hinterlassen');
  restoreBattle(w, snap);
  assert.deepEqual(sig(w), units0, 'gleiche Typen, Seiten, Positionen und LP in gleicher Reihenfolge');
  assert.deepEqual([...w.terr], [...terr0], 'Gelände');
  assert.deepEqual([...w.whp], [...whp0], 'Mauer-LP');
  assert.equal(w.towner.includes(STONE_WALL.OWNER), false, 'keine Steinwand');
  for (const k of ['corpses', 'proj', 'debris', 'formations', 'tempWalls', 'casts']) assert.equal(w[k].length, 0, k);
  assert.equal(w.units.some(u => u.type === 'ghul'), false, 'keine Ghule');
  assert.equal(w.units.some(u => u.burnT > 0 || u.poisonT > 0 || u.kills > 0 || u.dmgOut > 0), false, 'kein Brand, kein Gift, keine Zähler');
  assert.equal(w.units.every(u => u.alive), true);
  assert.equal(w.teamMode, true);
  // Ein zweites Mal aus demselben Schnappschuss: wieder gleich
  for (let i = 0; i < 60 * 3; i++) { step(w, DT); w.events.length = 0; }
  restoreBattle(w, snap);
  assert.deepEqual(sig(w), units0);
});

test('snapshotBattle: Ghule kommen nicht mit, ein Frosch als er selbst, Steinwände nicht', () => {
  const w = mkWorld();
  spawn(w, 'krieger', 300, 300, 'blau'); spawn(w, 'ghul', 320, 300, 'blau');
  const f = spawn(w, 'ritter', 900, 300, 'rot'); f.frogFrom = 'ritter'; f.type = 'frosch'; f.T = UNITS.frosch;
  setCell(w, cell(w, 500, 500), TERRAIN.mauer.id, STONE_WALL.OWNER);
  const s = snapshotBattle(w);
  assert.deepEqual(s.units.map(u => u.type), ['krieger', 'ritter']);
  assert.equal(s.terr.some((t, i) => s.towner[i] === STONE_WALL.OWNER || t), false);
});

test('battleWinner: wer allein übrig bleibt; nach 180 s die höhere Armeestärke, Gleichstand unentschieden', () => {
  const w = mkWorld();
  assert.equal(battleWinner(w, 0), 'draw', 'beide leer');
  const k = [0, 1, 2].map(i => spawn(w, 'krieger', 300, 300 + i * 30, 'blau'));
  assert.equal(battleWinner(w, 0), 'blau');
  const r = spawn(w, 'ritter', 900, 300, 'rot');
  assert.equal(battleWinner(w, 10), null);
  assert.equal(battleWinner(w, BATTLE_TIME), null, 'genau 180 s läuft noch');
  const p = armyPoints(w);
  assert.equal(p.blau, 3 * UNITS.krieger.cost); assert.equal(p.rot, UNITS.ritter.cost);
  const hi = p.blau > p.rot ? 'blau' : 'rot';
  assert.equal(battleWinner(w, 181), hi, 'höhere Stärke');
  // Gleichstand: gleiche Typen auf beiden Seiten
  const w2 = mkWorld(); spawn(w2, 'krieger', 300, 300, 'blau'); spawn(w2, 'krieger', 900, 300, 'rot');
  assert.equal(battleWinner(w2, 181), 'draw');
  k.forEach(u => { u.alive = false; });
  assert.equal(battleWinner(w, 5), 'rot');
  r.alive = false;
  assert.equal(battleWinner(w, 5), 'draw', 'beide gefallen');
});

test('createFight: jede Schlacht endet (auch wenn sich die Seiten nie erreichen: nach 180 s)', () => {
  const w = mkWorld();
  spawn(w, 'krieger', 300, 400, 'blau');
  spawn(w, 'heli', 1000, 400, 'rot');   // Nahkämpfer erreichen keinen Hubschrauber
  const f = createFight(snapshotBattle(w), 3);
  f.world.units.find(u => u.type === 'heli').T = { ...UNITS.heli, dmg: 0, range: 0 };   // schießt nicht
  let n = 0;
  while (!f.winner && n < 60 * 200) { stepFight(f); n++; }
  assert.ok(f.winner, 'beendet');
  assert.ok(f.t > BATTLE_TIME && f.t < BATTLE_TIME + .1, `nach ${f.t} s`);
  assert.equal(f.winner, UNITS.heli.cost > UNITS.krieger.cost ? 'rot' : 'blau');
});

test('createBatch: 4 Läufe ergeben zusammen 4, gleich bei gleicher Startzahl, unabhängig von der Häppchengröße', () => {
  const w = mkWorld();
  for (let i = 0; i < 5; i++) spawn(w, 'krieger', 560, 300 + i * 30, 'blau');
  for (let i = 0; i < 2; i++) spawn(w, 'schuetze', 480, 340 + i * 40, 'blau');
  for (let i = 0; i < 5; i++) spawn(w, 'krieger', 840, 300 + i * 30, 'rot');
  spawn(w, 'grenadier', 900, 360, 'rot');
  const snap = snapshotBattle(w), before = sig(w);
  const a = createBatch(snap, 4, 1234);
  assert.equal(a.pump(), true);
  const sum = a.result.wins.blau + a.result.wins.rot + a.result.wins.draw;
  assert.equal(sum, 4);
  assert.equal(a.result.times.length, 4);
  assert.ok(a.result.avgTime > 0 && a.result.avgTime <= BATTLE_TIME + 1);
  // Häppchen (wie je Bild in main.js): gleiche Zahlen
  let t = 0; const b = createBatch(snap, 4, 1234, () => t++);
  let frames = 0; while (!b.pump(40)) frames++;
  assert.ok(frames > 4, `in ${frames} Häppchen`);
  assert.deepEqual(b.result, a.result);
  assert.equal(b.k, 4);
  // Verschiedene Zufallswerte je Lauf: nicht alle Dauern gleich
  assert.ok(new Set(a.result.times.map(x => x.toFixed(4))).size > 1, `Dauern ${a.result.times}`);
  assert.deepEqual(sig(w), before, 'die angezeigte Welt bleibt unberührt');
  // Abbrechen
  const c = createBatch(snap, 10, 5);
  c.pump(0); c.cancel();
  assert.equal(c.done, true); assert.equal(c.cancelled, true); assert.equal(c.result, null);
  assert.equal(c.pump(), true, 'nach dem Abbruch passiert nichts mehr');
  assert.equal(c.result, null);
});

test('Malen im Schlacht-Modus: die Seite ergibt sich aus der Hälfte (rechts der Mitte Rot)', () => {
  const w = mkWorld();
  assert.equal(sideAt(w, w.W / 2 - 1), 'blau'); assert.equal(sideAt(w, w.W / 2 + 1), 'rot');
  const s = createStroke();
  const r = stamp(w, s, w.W * .75, w.H / 2, 40, 'krieger', BY_HALF, null, null);
  assert.ok(r.placed > 0);
  assert.ok(s.units.every(u => u.team === 'rot' && u.face === -1), 'rechts: Rot');
  const s2 = createStroke();
  stamp(w, s2, w.W * .25, w.H / 2, 40, 'schuetze', BY_HALF, null, null);
  assert.ok(s2.units.length > 0 && s2.units.every(u => u.team === 'blau'), 'links: Blau');
  // Pinsel über der Mittellinie: jede Einheit nach ihrer eigenen Hälfte
  const s3 = createStroke();
  stamp(w, s3, w.W / 2, w.H * .3, 70, 'krieger', BY_HALF, null, null);
  assert.ok(s3.units.length > 4);
  assert.ok(s3.units.every(u => u.team === (u.x < w.W / 2 ? 'blau' : 'rot')));
});

test('mirrorBattle: Seiten tauschen spiegelt Einheiten und Gelände, Blau wird Rot', () => {
  const w = mkWorld();
  spawn(w, 'krieger', 300, 300, 'blau'); spawn(w, 'ritter', 1000, 500, 'rot');
  setCell(w, cell(w, 105, 405), TERRAIN.wasser.id);
  mirrorBattle(w);
  const k = w.units.find(u => u.type === 'krieger'), r = w.units.find(u => u.type === 'ritter');
  assert.equal(k.team, 'rot'); assert.equal(k.x, w.W - 300);
  assert.equal(r.team, 'blau'); assert.equal(r.x, w.W - 1000);
  assert.equal(w.terr[((405 / CELL) | 0) * w.GW + (w.GW - 1 - ((105 / CELL) | 0))], TERRAIN.wasser.id);
  assert.equal(w.terr.filter(Boolean).length, 1);
});

test('resetFight: gleicher Kampf nach derselben Aufstellung und Saat, auch wenn die Welt schon gekämpft hat', async () => {
  const { resetFight } = await import('../game/js/battle.js');
  const { createWorld: cw } = await import('../game/js/world.js');
  const { step: st, placeRect: pr, tCircle: tc } = await import('../game/js/sim.js');
  const a = cw(1400, 820, 5); a.teamMode = true;
  tc(a, 'wasser', .5, .5, .1);
  pr(a, 'schuetze', 10, .2, .3, .25, .7, 'blau'); pr(a, 'roemer', 12, .3, .35, .34, .65, 'blau');
  pr(a, 'krieger', 20, .7, .3, .76, .7, 'rot'); pr(a, 'magier', 4, .8, .4, .82, .6, 'rot');
  const snap = snapshotBattle(a);
  const b = cw(1400, 820, 99); b.teamMode = true;
  pr(b, 'ritter', 10, .4, .4, .5, .6, 'rot'); pr(b, 'grenadier', 10, .5, .4, .6, .6, 'blau');
  for (let i = 0; i < 300; i++) { st(b, 1 / 60); b.events.length = 0; }   // Vorgeschichte: Leichen, ids, Zeit, Zufall
  const run = w => { resetFight(w, snap, 1234); for (let i = 0; i < 600; i++) { st(w, 1 / 60); w.events.length = 0; }
    return w.units.map(u => `${u.id}:${u.x.toFixed(3)},${u.y.toFixed(3)},${u.hp.toFixed(3)}`).join('|'); };
  assert.equal(run(a), run(b));
});
