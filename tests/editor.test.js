// Level-Editor (Audit 18.11.): Welt → eigenes Level → buildMission, Spielstand, Malen der Gegner
import test from 'node:test';
import assert from 'node:assert/strict';
import { levelFromWorld, frameFrac, suggestBudget, parFor, isLevel, levelProblem, upsertCustom, terrainRects, CUSTOM_MAX, UNIT_CATS } from '../game/js/editor.js';
import { createWorld, spawn, rebuildHash, frameX, setCell } from '../game/js/world.js';
import { buildMission, armyPoints, tRect } from '../game/js/sim.js';
import { stamp, createStroke, zoneX, EDITOR } from '../game/js/paint.js';
import { encode, decode, levelData } from '../game/js/share.js';
import { TERRAIN } from '../game/js/data.js';
import { validateCampaign } from '../game/js/campaign/index.js';

const sizes = [[1400, 875], [2400, 820], [1100, 900]];

test('frameFrac ist die Umkehrung von frameX, auch auf breiten Welten', () => {
  for (const [W, H] of sizes) {
    const w = createWorld(W, H, 1);
    for (const f of [-.2, 0, .42, .7, 1, 1.3]) assert.ok(Math.abs(frameFrac(w, frameX(w, f)) - f) < 1e-9, `${W}x${H} f=${f}`);
  }
});

test('Budget-Vorschlag und Par', () => {
  assert.equal(suggestBudget(40), 60);
  assert.equal(suggestBudget(0), 10);
  assert.equal(parFor(130), 100);
  assert.equal(parFor(1), 1);
});

// Welt mit drei Gegnern, einem eigenen Krieger (gehört nicht ins Level), Mauer und Wasser; tRect in Anteilen von W
function editorWorld(W, H) {
  const w = createWorld(W, H, 7); w.teamMode = true;
  spawn(w, 'krieger', frameX(w, .7), H * .4, 'rot');
  spawn(w, 'schuetze', frameX(w, .8), H * .5, 'rot');
  spawn(w, 'ritter', frameX(w, .9), H * .6, 'rot');
  spawn(w, 'krieger', frameX(w, .2), H * .5, 'blau');
  const f = v => frameX(w, v) / W;
  tRect(w, 'mauer', f(.6), .2, f(.62), .8);
  tRect(w, 'wasser', f(.3), .1, f(.4), .2);
  rebuildHash(w);
  return w;
}
const cnt = (w, k) => w.terr.reduce((n, id) => n + (id === TERRAIN[k].id), 0);

test('Welt → Level → buildMission auf anderer Weltgröße: Anzahl, Typen und ungefähre Lage bleiben', () => {
  for (const [W, H] of sizes) {
    const src = editorWorld(W, H);
    const lv = levelFromWorld(src, { n: 'Test', hint: 'Hinweis', budget: '' });
    assert.ok(isLevel(lv), 'Form passt');
    assert.match(lv.id, /^custom-[0-9a-z]+$/);
    assert.equal(lv.place.filter(p => p[0] === 'unit').length, 3);
    assert.equal(lv.budget, suggestBudget(armyPoints(src).rot));
    assert.equal(lv.par, Math.round(lv.budget / 1.3));
    assert.equal(lv.cats, undefined, 'alle Kategorien: keine Einschränkung');
    assert.deepEqual(validateCampaign([{ id: 'c', n: 'C', d: 'D', levels: [{ ...lv, plan: { smart: [['krieger', 1]] } }] }]), []);
    for (const [W2, H2] of sizes) {
      const dst = createWorld(W2, H2, 3);
      buildMission(dst, lv);
      const red = dst.units.filter(u => u.alive && u.team === 'rot');
      assert.deepEqual(red.map(u => u.type).sort(), ['krieger', 'ritter', 'schuetze']);
      assert.equal(dst.units.filter(u => u.team === 'blau').length, 0);
      const want = { krieger: [.7, .4], schuetze: [.8, .5], ritter: [.9, .6] };
      for (const u of red) {
        const [fx, fy] = want[u.type];
        assert.ok(Math.abs(frameFrac(dst, u.x) - fx) < .01, `${W}→${W2} ${u.type} x`);
        assert.ok(Math.abs(u.y / H2 - fy) < .01, `${u.type} y`);
      }
      // Gelände: Mauer und Wasser in ähnlichem Verhältnis zur Rahmenfläche
      const area = w => Math.min(w.W, 1.6 * w.H) * w.H;
      for (const k of ['mauer', 'wasser']) {
        const a = cnt(src, k) / area(src), b = cnt(dst, k) / area(dst);
        assert.ok(b > 0 && Math.abs(a - b) / a < .5, `${k} ${W}x${H}→${W2}x${H2}: ${a} vs ${b}`);
      }
    }
  }
});

test('gleiche Weltgröße: Gelände kommt zellgenau zurück, Läufe sind zusammengefasst', () => {
  const src = editorWorld(1400, 875);
  setCell(src, 5 * src.GW + 70, TERRAIN.lava.id, 1);
  const lv = levelFromWorld(src, {});
  const dst = createWorld(1400, 875, 1);
  buildMission(dst, lv);
  assert.deepEqual([...dst.terr], [...src.terr]);
  assert.ok(terrainRects(src).length <= 4, 'Mauer, Wasser, Lava als wenige Rechtecke');
});

test('breite Welt: Gelände außerhalb des Rahmens fällt weg oder wird abgeschnitten', () => {
  const w = createWorld(2600, 800, 1);
  const L = 1.6 * 800, left = (2600 - L) / 2;
  tRect(w, 'mauer', 10 / 2600, .3, (left - 40) / 2600, .35);   // ganz links außerhalb
  tRect(w, 'wasser', (left + L - 50) / 2600, .5, (left + L + 200) / 2600, .55);   // ragt rechts hinaus
  const r = terrainRects(w);
  assert.ok(!r.some(p => p[1] === 'mauer'));
  assert.ok(r.some(p => p[1] === 'wasser') && r.every(p => p[2] >= 0 && p[4] <= 1));
});

test('Meta: Name, Hinweis, Budget, Kategorien; id hängt am Inhalt', () => {
  const w = editorWorld(1400, 875);
  const a = levelFromWorld(w, { n: '  Mein   Level ', hint: 'x', budget: 77, cats: ['armee', 'tiere', 'gelaende'] });
  assert.equal(a.n, 'Mein Level'); assert.equal(a.hint, 'x'); assert.equal(a.budget, 77); assert.equal(a.par, 59);
  assert.deepEqual(a.cats, ['armee', 'tiere']);
  assert.equal(levelFromWorld(w, { n: 'Mein Level', hint: 'x', budget: 77, cats: ['tiere', 'armee'] }).id, a.id);
  assert.notEqual(levelFromWorld(w, { n: 'Anders', hint: 'x', budget: 77 }).id, a.id);
  assert.equal(levelFromWorld(w, { cats: UNIT_CATS }).cats, undefined);
  assert.equal(levelFromWorld(w, {}).n, 'Eigenes Level');
});

test('ohne Gegner: levelProblem meldet es', () => {
  const w = createWorld(1400, 875, 1);
  assert.match(levelProblem(levelFromWorld(w, {})), /Gegner/);
  assert.equal(levelProblem(levelFromWorld(editorWorld(1400, 875), {})), null);
});

test('Malen im Editor: nur Rot und nur rechts der Mallinie', () => {
  const w = createWorld(1400, 875, 5); w.teamMode = true;
  const z = zoneX(w), s = createStroke();
  stamp(w, s, z, 400, 120, 'krieger', EDITOR, null, null);
  assert.ok(s.units.length > 0);
  for (const u of s.units) { assert.equal(u.team, 'rot'); assert.ok(u.x > z); }
});

test('Code: eigenes Level übersteht encode/decode', async () => {
  const lv = levelFromWorld(editorWorld(1400, 875), { n: 'Geteilt', budget: 50, cats: ['armee'] });
  const d = await decode(await encode(levelData(lv)));
  assert.equal(d.k, 'level');
  assert.deepEqual(d.level, lv);
});

test('isLevel lehnt kaputte Formen ab', () => {
  const ok = levelFromWorld(editorWorld(1400, 875), {});
  const bads = [null, 1, [], {}, { ...ok, id: '' }, { ...ok, budget: 0 }, { ...ok, place: [] }, { ...ok, place: [['unit', 'gibtsnicht', .5, .5]] },
    { ...ok, place: [['unit', 'krieger', 'a', .5]] }, { ...ok, place: [['tRect', 'radierer', 0, 0, 1, 1]] }, { ...ok, cats: 'armee' }, { ...ok, n: 5 }];
  bads.forEach((bad, i) => assert.equal(isLevel(bad), false, `Fall ${i}`));
  assert.equal(isLevel(ok), true);
});

test('upsertCustom: neueste zuerst, ersetzt das bearbeitete, Obergrenze', () => {
  const mk = id => ({ id, n: id, hint: '', budget: 10, par: 8, place: [['unit', 'krieger', .5, .5]] });
  let r = upsertCustom([], mk('a')); r = upsertCustom(r.list, mk('b'));
  assert.deepEqual(r.list.map(l => l.id), ['b', 'a']);
  r = upsertCustom(r.list, mk('c'), 'a');
  assert.deepEqual(r.list.map(l => l.id), ['c', 'b']);
  const full = Array.from({ length: CUSTOM_MAX }, (_, i) => mk('x' + i));
  const f = upsertCustom(full, mk('neu'));
  assert.ok(f.error); assert.equal(f.list, full);
  assert.equal(upsertCustom(full, mk('neu'), 'x3').error, null, 'Ersetzen geht auch bei voller Liste');
});
