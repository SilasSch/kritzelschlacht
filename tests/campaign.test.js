// Kampagne in Kapiteln (Spez. #52): Kapiteldaten, Freischalten, erlaubte Einheiten beim Malen, Kapitelfilter der Prüfung.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { UNITS, MISSIONS } from '../game/js/data.js';
import {
  CHAPTERS, LEVELS, levelById, levelInfo, chapterById, nextLevel, unitAllowed, terrainAllowed, catAllowed, paintableUnits,
  chapterUnlocked, levelUnlocked, chapterProgress, spamMustLose, validateCampaign,
} from '../game/js/campaign/index.js';
import { LEGACY_IDS } from '../game/js/campaign/grundausbildung.js';
import { createWorld, rebuildHash } from '../game/js/world.js';
import { createStroke, stamp, paintTerrain, MSG_NOT_ALLOWED } from '../game/js/paint.js';
import { buildMission } from '../game/js/sim.js';
import { MISSION_PLANS, SPAM_MUST_LOSE, SPAM_ANSWER, selectLevels, parseArgs, chapterSpamVerdict, unitSpamAllowed, spamTypes } from '../tools/plans.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const alive = w => w.units.filter(u => u.alive);

/* ---------- Daten ---------- */
test('Kapitel in Spielreihenfolge, Grundausbildung zuerst mit den 9 Missionen', () => {
  assert.deepEqual(CHAPTERS.map(c => c.id), ['grundausbildung', 'burgen', 'rom', 'wildnis', 'akademie', 'vampire', 'modern', 'finale']);
  for (const c of CHAPTERS) { assert.ok(c.n && c.d, c.id); assert.ok(Array.isArray(c.levels), c.id); }
  const ga = CHAPTERS[0].levels;
  assert.equal(ga.length, 9);
  assert.deepEqual(ga.map(l => l.id), LEGACY_IDS);
  // unverändert: alle Felder der Mission sind da, MISSIONS bleibt exportiert
  ga.forEach((l, i) => { for (const k of Object.keys(MISSIONS[i])) assert.deepEqual(l[k], MISSIONS[i][k], `${l.id}.${k}`); });
  assert.equal(levelById('ga-5').n, 'Die Festung');
  assert.equal(levelInfo('ga-5').li, 4);
  assert.equal(levelInfo('ga-5').chapter, chapterById('grundausbildung'));
  assert.equal(levelById('gibtsnicht'), null);
  assert.equal(LEVELS.length, CHAPTERS.reduce((a, c) => a + c.levels.length, 0));
});

test('Kapiteldaten sind gültig (ids eindeutig, Pläne nur aus erlaubten Einheiten, smart ≤ par)', () => {
  assert.deepEqual(validateCampaign(), []);
  // die Prüfung findet typische Fehler eines Kapitels
  const bad = [{ id: 'x', n: 'X', d: 'x', levels: [
    { id: 'x-1', n: 'A', hint: 'h', budget: 50, par: 40, units: ['ritter'], place: [['rect', 'krieger', 5, .7, .3, .8, .7]],
      plan: { smart: [['krieger', 10, .3, .3, .4, .7]] } },
    { id: 'x-1', n: 'B', hint: 'h', budget: 50, par: 60, units: ['ghul'], place: [['rect', 'nix', 5, .7, .3, .8, .7]] },
  ] }];
  const err = validateCampaign(bad).join('\n');
  assert.match(err, /x-1: plan.smart nutzt krieger/);
  assert.match(err, /doppelte Level-id/);
  assert.match(err, /par <= budget/);
  assert.match(err, /ghul ist keine malbare Einheit/);
  assert.match(err, /place .* ungültig/);
  assert.match(err, /plan.smart fehlt/);
});

test('nextLevel: nächstes Level im Kapitel, nach dem letzten null', () => {
  assert.equal(nextLevel('ga-1').id, 'ga-2');
  assert.equal(nextLevel('ga-9'), null);
  assert.equal(nextLevel('nix'), null);
});

test('buildMission nimmt Index, id oder Level und baut dasselbe', () => {
  const pos = w => alive(w).map(u => [u.type, Math.round(u.x), Math.round(u.y)]).join(';');
  const a = createWorld(1400, 820, 5); buildMission(a, 3);
  const b = createWorld(1400, 820, 5); buildMission(b, 'ga-4');
  const c = createWorld(1400, 820, 5); buildMission(c, levelById('ga-4'));
  assert.equal(pos(a), pos(b)); assert.equal(pos(a), pos(c));
  assert.deepEqual([...a.terr], [...c.terr]);
});

/* ---------- Freischalten ---------- */
const lvl = (id, extra = {}) => ({ id, n: id, hint: 'h', budget: 50, par: 40, place: [['rect', 'krieger', 5, .7, .3, .8, .7]], ...extra });
const TEST_CHAPTERS = [
  { id: 'a', n: 'A', d: 'a', levels: [lvl('a-1'), lvl('a-2'), lvl('a-3')] },
  { id: 'leer', n: 'Leer', d: 'leer', levels: [] },
  { id: 'b', n: 'B', d: 'b', levels: [lvl('b-1'), lvl('b-2')] },
];

test('Freischalten: Level k nach einem Stern in k−1, Kapitel nach dem letzten Level des vorigen', () => {
  const C = TEST_CHAPTERS;
  let st = {};
  assert.equal(chapterUnlocked(st, 'a', C), true, 'erstes Kapitel immer offen');
  assert.equal(levelUnlocked(st, 'a-1', C), true);
  assert.equal(levelUnlocked(st, 'a-2', C), false);
  assert.equal(chapterUnlocked(st, 'b', C), false);
  assert.equal(levelUnlocked(st, 'b-1', C), false);
  st = { 'a-1': 1 };
  assert.equal(levelUnlocked(st, 'a-2', C), true);
  assert.equal(levelUnlocked(st, 'a-3', C), false);
  st = { 'a-1': 3, 'a-2': 1 };
  assert.equal(chapterUnlocked(st, 'b', C), false, 'a-3 ohne Stern');
  st = { 'a-1': 3, 'a-2': 1, 'a-3': 2 };
  assert.equal(chapterUnlocked(st, 'leer', C), true);
  assert.equal(chapterUnlocked(st, 'b', C), true, 'leeres Kapitel dazwischen wird übersprungen');
  assert.equal(levelUnlocked(st, 'b-1', C), true);
  assert.equal(levelUnlocked(st, 'b-2', C), false);
  assert.equal(levelUnlocked(st, 'nix', C), false);
  assert.equal(chapterUnlocked(st, 'nix', C), false);
  assert.deepEqual(chapterProgress(st, 'a', C), { stars: 6, maxStars: 9, done: 3, total: 3 });
  assert.deepEqual(chapterProgress(st, 'b', C), { stars: 0, maxStars: 6, done: 0, total: 2 });
  assert.deepEqual(chapterProgress(st, 'leer', C), { stars: 0, maxStars: 0, done: 0, total: 0 });
});

test('Freischalten in der echten Kampagne: Grundausbildung wie früher (Mission i nach einem Stern in i−1)', () => {
  assert.equal(chapterUnlocked({}, 'grundausbildung'), true);
  assert.equal(levelUnlocked({}, 'ga-1'), true);
  for (let i = 1; i < 9; i++) {
    assert.equal(levelUnlocked({}, LEGACY_IDS[i]), false);
    assert.equal(levelUnlocked({ [LEGACY_IDS[i - 1]]: 1 }, LEGACY_IDS[i]), true);
  }
  // das zweite Kapitel nach Mission 9
  assert.equal(chapterUnlocked({}, 'burgen'), false);
  assert.equal(chapterUnlocked({ 'ga-9': 1 }, 'burgen'), true);
});

/* ---------- Erlaubte Einheiten ---------- */
test('units und cats: erlaubte Einheiten, Gelände und Reiter', () => {
  const L = lvl('w', { units: ['ritter', 'schuetze', 'wolf'], cats: ['armee', 'gelaende'] });
  assert.equal(unitAllowed(L, 'ritter'), true);
  assert.equal(unitAllowed(L, 'krieger'), false, 'nicht in units');
  assert.equal(unitAllowed(L, 'wolf'), false, 'in units, aber Kategorie nicht in cats');
  assert.deepEqual(paintableUnits(L), ['schuetze', 'ritter']);
  assert.equal(catAllowed(L, 'armee'), true);
  assert.equal(catAllowed(L, 'tiere'), false);
  assert.equal(catAllowed(L, 'gelaende'), true);
  const U = lvl('u', { units: ['biene'] });   // ohne cats: Gelände frei
  assert.deepEqual(paintableUnits(U), ['biene']);
  assert.equal(terrainAllowed(U, 'wasser'), true);
  assert.equal(catAllowed(U, 'armee'), false);
  const noTerr = lvl('t', { cats: ['tiere'] });
  assert.equal(terrainAllowed(noTerr, 'mauer'), false);
  assert.equal(terrainAllowed(noTerr, 'radierer'), true, 'der Radierer geht immer');
  assert.equal(catAllowed(noTerr, 'gelaende'), false);
  // ohne Level (Sandkasten) alles; nicht Malbares wie der Ghul nie in paintableUnits
  assert.equal(unitAllowed(null, 'krieger'), true);
  assert.ok(!paintableUnits(null).includes('ghul'));
  assert.equal(unitAllowed(L, 'gibtsnicht'), false);
  // Grundausbildung M6 (cats tiere, gelaende) wie früher
  assert.ok(paintableUnits(levelById('ga-6')).every(t => UNITS[t].cat === 'tiere'));
});

test('stamp: im Level nur Einheiten aus units, sonst Warnung und nichts gesetzt', () => {
  const w = createWorld(1400, 800, 3);
  const def = lvl('s', { units: ['ritter'], budget: 500 });
  const m = { budget: 500, spent: 0, def };
  const s = createStroke(0);
  const no = stamp(w, s, 200, 400, 60, 'krieger', 'blau', m, 'plan');
  assert.equal(no.placed, 0);
  assert.equal(no.warning, MSG_NOT_ALLOWED);
  assert.equal(m.spent, 0);
  assert.equal(alive(w).length, 0);
  assert.equal(stamp(w, s, 200, 400, 60, 'krieger', 'blau', m, 'plan').warning, null, 'nur einmal pro Strich');
  const yes = stamp(w, createStroke(0), 200, 400, 60, 'ritter', 'blau', m, 'plan');
  assert.ok(yes.placed > 0);
  assert.ok(alive(w).every(u => u.type === 'ritter'));
  assert.equal(m.spent, yes.placed * UNITS.ritter.cost);
  // cats wirken weiter: M6 erlaubt keine Armee
  const m6 = { budget: 500, spent: 0, def: levelById('ga-6') };
  assert.equal(stamp(w, createStroke(0), 200, 200, 60, 'krieger', 'blau', m6, 'plan').placed, 0);
  assert.ok(stamp(w, createStroke(0), 200, 200, 60, 'wolf', 'blau', m6, 'plan').placed > 0);
  // ohne def (alte Aufrufer) und im Sandkasten unverändert
  assert.ok(stamp(w, createStroke(0), 300, 650, 50, 'krieger', 'blau', { budget: 500, spent: 0 }, 'plan').placed > 0);
  assert.ok(stamp(w, createStroke(0), 900, 400, 60, 'krieger', 'gruen', null, null).placed > 0);
});

test('paintTerrain: Gelände nur, wenn cats es erlaubt; der Radierer immer', () => {
  const w = createWorld(1400, 800, 3);
  const def = lvl('t', { cats: ['tiere'], budget: 500 });
  const m = { budget: 500, spent: 0, def };
  const r = paintTerrain(w, createStroke(0), 200, 400, 40, 'wasser', m, 'plan');
  assert.equal(r.changed, false);
  assert.equal(r.warning, MSG_NOT_ALLOWED);
  assert.ok([...w.terr].every(v => v === 0));
  assert.equal(m.spent, 0);
  stamp(w, createStroke(0), 200, 400, 40, 'wolf', 'blau', m, 'plan');
  rebuildHash(w);
  const n = alive(w).length; assert.ok(n > 0);
  const e = paintTerrain(w, createStroke(0), 200, 400, 60, 'radierer', m, 'plan');
  assert.equal(e.changed, true);
  assert.equal(alive(w).length, 0);
  const ok = paintTerrain(w, createStroke(0), 200, 400, 40, 'wasser', { budget: 500, spent: 0, def: levelById('ga-6') }, 'plan');
  assert.equal(ok.changed, true, 'M6 erlaubt Gelände');
});

/* ---------- Werkzeuge ---------- */
test('plans.mjs: alte Namen kommen aus den Leveln der Grundausbildung', () => {
  assert.deepEqual(SPAM_MUST_LOSE, [1, 3, 4, 6, 7, 8]);
  assert.deepEqual(SPAM_ANSWER, { 4: ['zyklop'] });
  assert.equal(MISSION_PLANS.length, 9);
  MISSION_PLANS.forEach((p, i) => assert.equal(p, CHAPTERS[0].levels[i].plan));
  assert.deepEqual(CHAPTERS[0].levels.map(spamMustLose), [false, true, false, true, true, false, true, true, true]);
  assert.equal(spamMustLose(lvl('neu')), true, 'neue Level: Spam muss verlieren, wenn nichts anderes dasteht');
  assert.equal(unitSpamAllowed(5, 'roemer'), false); assert.equal(unitSpamAllowed(4, 'roemer'), true);
  assert.equal(unitSpamAllowed(lvl('r', { units: ['ritter'] }), 'roemer'), false);
  assert.deepEqual(spamTypes(lvl('r', { units: ['ritter', 'biene'] })), ['ritter', 'biene']);
});

test('Kapitelfilter: selectLevels und parseArgs', () => {
  const all = selectLevels();
  assert.equal(all.length, LEVELS.length);
  const ga = selectLevels('grundausbildung');
  assert.equal(ga.length, 9);
  // Namen und Saaten der Grundausbildung wie vor dem Umbau (gleiche Ergebnisse der Prüfung)
  assert.deepEqual(ga.map(e => e.tag), ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9']);
  ga.forEach((e, i) => assert.equal(e.seed(3), 1000 * (i + 1) + 3));
  // Kapitel werden nach und nach gefüllt: Mehrfachauswahl gegen die tatsächliche Levelzahl prüfen
  const burg = chapterById('burgen').levels.length;
  assert.equal(selectLevels('burgen').length, burg);
  assert.equal(selectLevels('burgen,grundausbildung').length, 9 + burg);
  assert.throws(() => selectLevels('gibtsnicht'), /unbekanntes Kapitel/);
  assert.deepEqual(parseArgs(['missions', '8', '--chapter=rom', '1400x875']), { chapter: 'rom', pos: ['missions', '8', '1400x875'] });
  assert.deepEqual(parseArgs(['newspam']), { chapter: null, pos: ['newspam'] });
});

test('newspam-Regel neuer Kapitel: jede erlaubte Einheit verliert ≥ 6/8, außer answer', () => {
  const L = lvl('n', { answer: ['magier'] });
  assert.equal(chapterSpamVerdict(L, 'krieger', 2, 8).ok, true);
  assert.equal(chapterSpamVerdict(L, 'krieger', 3, 8).ok, false);
  assert.match(chapterSpamVerdict(L, 'krieger', 3, 8).note, /FAIL/);
  assert.equal(chapterSpamVerdict(L, 'magier', 8, 8).ok, true);
});

test('balance.mjs --chapter: leeres Kapitel ist OK, unbekanntes bricht mit Exitcode 2 ab', () => {
  const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'tools/balance.mjs'), ...a], { encoding: 'utf8' });
  // Ein noch leeres Kapitel (falls es eines gibt) muss mit „keine Level“ und Exitcode 0 durchlaufen
  const empty = CHAPTERS.find(c => !c.levels.length);
  if (empty) for (const cmd of ['missions', 'newspam']) {
    const r = run(cmd, '1', '1400x875', `--chapter=${empty.id}`);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, new RegExp(`keine Level in ${empty.id}`));
    assert.match(r.stdout, /OK/);
  }
  const bad = run('missions', '1', '1400x875', '--chapter=gibtsnicht');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unbekanntes Kapitel/);
});

test('Lava ist in keinem Level malbar, im Sandkasten und in der Schlacht schon', async () => {
  const { terrainAllowed, LEVELS } = await import('../game/js/campaign/index.js');
  for (const { level } of LEVELS) {
    assert.equal(terrainAllowed(level, 'lava'), false, level.id);
    assert.equal(terrainAllowed(level, 'radierer'), true, level.id);
  }
  assert.equal(terrainAllowed(null, 'lava'), true);
});
