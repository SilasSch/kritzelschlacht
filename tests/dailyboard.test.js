// Bestenliste der Tageschallenge (18.11.): game/js/dailyboard.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, COUNTERS } from '../game/js/data.js';
import { dailyLevel, dateKey } from '../game/js/daily.js';
import { createWorld, spawn } from '../game/js/world.js';
import { step, missionResult } from '../game/js/sim.js';
import { resetFight, STEP } from '../game/js/battle.js';
import { packArmy } from '../game/js/online.js';
import { encode, decode } from '../game/js/share.js';
import { placePlan } from '../tools/plans.mjs';
import { placeDaily, dailySnapshot, fightSeed, armyOf, checkNow, createCheck, rankEntries, resultCode, validResult,
  addLocal, cleanBoard, mergeOwn, dayEntries, cleanName, BOARD_KEEP, SIM_VERSION, VERSIONS, acceptOld, stampOf, dailyArmy } from '../game/js/dailyboard.js';
import { PAINT_TYPES } from '../game/js/online.js';

const D = '2026-11-18';
function smartArmy(date) {
  const L = dailyLevel(date), w = createWorld(1600, 900, 1);
  placeDaily(w, L); placePlan(w, L.plan.smart);
  return armyOf(w);
}

test('Nachrechnen: gleiche Armee, gleiches Ergebnis; der Lösungsplan gewinnt', () => {
  const a = smartArmy(D);
  const r1 = checkNow(D, a), r2 = checkNow(D, a);
  assert.equal(r1.error, null);
  assert.deepEqual(r1.result, r2.result);
  assert.equal(r1.result.win, true);
  assert.ok(r1.result.spent <= dailyLevel(D).par);
  assert.equal(r1.result.stars, 3);
});

test('Nachrechnen in Häppchen ergibt dasselbe wie am Stück', () => {
  const a = smartArmy(D), c = createCheck(D, a);
  let n = 0;
  while (!c.pump(0)) n++;
  assert.ok(n > 3);
  assert.deepEqual(c.result, checkNow(D, a).result);
});

test('Kampf im Spiel = Nachrechnen: Welt mit Vorgeschichte, fester Schnappschuss und feste Saat', () => {
  for (const date of ['2026-11-15', '2026-11-16', D]) {
    const L = dailyLevel(date);
    // wie main.js: Welt mit zufälliger Saat, vorher schon gekämpft
    const w = createWorld(1600, 900, 987654);
    for (let i = 0; i < 40; i++) spawn(w, 'krieger', 100 + i * 30, 300, i % 2 ? 'blau' : 'rot');
    for (let i = 0; i < 120; i++) step(w, STEP);
    placeDaily(w, L); placePlan(w, L.plan.smart);
    const army = armyOf(w), s = dailySnapshot(date, army);
    resetFight(w, s.snap, fightSeed(date));
    let t = 0, r = null;
    while (!r) { step(w, STEP); w.events.length = 0; t += STEP; r = missionResult(w, t); }
    const v = checkNow(date, army).result;
    assert.equal(r === 'win', v.win, date);
    assert.equal(Math.round(t * 100) / 100, v.time, date);
  }
});

test('Gefälschte Armeen fallen durch: fremde Einheit, zu teuer, hinter der Mallinie, Unsinn', () => {
  const L = dailyLevel(D);
  const bad = Object.keys(UNITS).find(t => UNITS[t].paint !== false && !L.units.includes(t));
  const ok = L.units[0];
  const pack = list => { const w = createWorld(1600, 900, 1); for (const [t, x, y] of list) spawn(w, t, x, y, 'blau'); return packArmy(w, 'blau'); };
  assert.match(checkNow(D, pack([[bad, 200, 400]])).error, /nicht erlaubt/);
  const many = Array.from({ length: Math.ceil(L.budget / UNITS[ok].cost) + 2 }, (_, i) => [ok, 100 + (i % 20) * 10, 100 + Math.floor(i / 20) * 10]);
  assert.match(checkNow(D, pack(many)).error, /Budget/);
  assert.match(checkNow(D, pack([[ok, 750, 400]])).error, /Mallinie/);
  assert.ok(checkNow(D, '!!!').error);
  assert.ok(checkNow(D, '').error);
  assert.ok(checkNow('gestern', smartArmy(D)).error);
});

test('Ergebnis-Code: über share.js hin und zurück, Name gesäubert, kaputte Codes abgelehnt', async () => {
  const a = smartArmy(D);
  const d = await decode(await encode(resultCode(D, a, '  <b>Silas</b>  der Große und noch viel mehr ')));
  assert.equal(d.k, 'dailyres'); assert.equal(d.d, D); assert.equal(d.a, a);
  assert.ok(!d.n.includes('<') && d.n.length <= 20);
  assert.equal(validResult({ ...d, d: '2026-13-99x' }), false);
  await assert.rejects(decode(await encode({ v: 1, k: 'dailyres', d: D, a: 'AAAA', n: 'x' })));
  assert.equal(cleanName('  a\u0000b  c '), 'ab c');
});

test('Rangfolge: Sieg, weniger Punkte, schneller, früher', () => {
  const e = (spent, time, at, win = true) => ({ res: { win, spent, time }, at });
  const l = [e(50, 30, 1), e(40, 50, 2), e(40, 20, 3), e(30, 10, 4, false), e(40, 20, 0)];
  assert.deepEqual(rankEntries(l).map(x => x.at), [0, 3, 2, 1, 4]);
});

test('Ablage: lokale Liste und Live-Dokument behalten nur die letzten Tage, ein Eintrag je Name', () => {
  let b = {};
  addLocal(b, D, { n: 'Ann', a: 'x1' }); addLocal(b, D, { n: 'Ann', a: 'x2' }); addLocal(b, D, { n: 'Bo', a: 'x3' });
  addLocal(b, D, { n: 'Ich', a: 'm1', me: true }); addLocal(b, D, { n: 'Ich', a: 'm2', me: true });
  assert.deepEqual(b[D].map(e => e.a).sort(), ['m2', 'x2', 'x3']);
  for (let i = 1; i <= 10; i++) addLocal(b, `2026-11-0${i}`.replace('0' + 10, '10'), { n: 'A', a: 'y' + i });
  assert.equal(Object.keys(cleanBoard(b)).length, BOARD_KEEP);
  assert.ok(cleanBoard(b)[D]);
  let doc = null;
  for (let i = 1; i <= 9; i++) doc = mergeOwn(doc, `2026-11-1${i}`, 'a' + i, i);
  assert.equal(Object.keys(doc.days).length, BOARD_KEEP);
  assert.equal(doc.days['2026-11-19'].a, 'a9');
  const docs = [{ id: 'u1', data: doc }, { id: 'u2', data: { days: { '2026-11-19': { a: 'zz', at: 5 } } } }, { id: 'u3', data: { days: { '2026-11-19': { a: 3 } } } }];
  assert.deepEqual(dayEntries(docs, '2026-11-19').map(e => e.uid), ['u1', 'u2']);
});

test('Spielversion: die aktuelle steht in VERSIONS (nach einem Balance-Update dort eintragen, siehe dailyboard.js)', () => {
  assert.ok(VERSIONS[SIM_VERSION], `Neue Spielversion ${SIM_VERSION}: in dailyboard.js VERSIONS eintragen und bei der alten until = Tag des Updates setzen`);
  assert.equal(VERSIONS[SIM_VERSION].until, null);
  assert.equal(Object.values(VERSIONS).filter(v => v.until === null).length, 1);
});

test('Spielversion: alte Einträge zählen wie eingetragen, aber nur bis zum letzten Tag ihrer Version', () => {
  const a = smartArmy(D), res = checkNow(D, a).result;
  // aktuelle Version: nachgerechnet, die Behauptung zählt nicht
  const fake = { v: SIM_VERSION, r: { win: true, spent: 1, time: 1, stars: 3 } };
  assert.deepEqual(checkNow(D, a, fake).result, res);
  // alte Version (bis 18.11.): wie eingetragen am 18., danach nicht mehr; unbekannte Version nie
  VERSIONS.valt = { until: D };
  try {
    const old = { v: 'valt', r: { win: true, spent: 60, time: 12.5, stars: 3 } };
    assert.deepEqual(checkNow(D, a, old).result, { win: true, spent: 60, time: 12.5, stars: 3, old: true });
    assert.ok(checkNow('2026-11-19', a, old).error);
    assert.ok(checkNow(D, a, { v: 'vgibtsnicht', r: old.r }).error);
    assert.equal(acceptOld(D, 'valt', { win: true, spent: -5, time: 3, stars: 3 }), null);
    assert.equal(acceptOld(D, 'valt', null), null);
    // Anti-Cheat: leere Armee oder unplausibel niedrige Kosten in Alt-Version abgelehnt
    assert.ok(checkNow(D, '', { v: 'valt', r: { win: true, spent: 0.001, time: 0.001, stars: 3 } }).error);
    assert.equal(validResult({ v: 1, k: 'dailyres', d: D, a: '', n: 'Fake', sv: 'valt', r: { win: true, spent: 1, time: 1, stars: 3 } }), false);
    assert.ok(checkNow(D, a, { v: 'valt', r: { win: true, spent: 1, time: 1, stars: 3 } }).error);
    // Alte Einträge behalten ihre Zahlen, auch wenn die Armee mit heutigen Kosten übers Budget käme (Silas 20.11.)
    const cost0 = {};
    for (const t of Object.keys(UNITS)) { cost0[t] = UNITS[t].cost; UNITS[t].cost *= 1.8; }
    try {
      assert.throws(() => dailyArmy(D, a), /Budget/);
      const honest = { v: 'valt', r: { win: true, spent: res.spent, time: 12.5, stars: 3 } };
      assert.deepEqual(checkNow(D, a, honest).result, { win: true, spent: res.spent, time: 12.5, stars: 3, old: true });
    } finally { for (const t in cost0) UNITS[t].cost = cost0[t]; }
    // Sortierung gemischt wie bisher: alte Version mit weniger Punkten steht vorn, markiert mit old
    const ranked = rankEntries([
      { res: { win: true, spent: 80, time: 20 }, at: 2 },
      { res: { win: true, spent: 40, time: 5, old: true }, at: 1 },
    ]);
    assert.equal(ranked[0].at, 1);
  } finally { delete VERSIONS.valt; }
  // Stempel gehen in die Ablage mit
  const b = addLocal({}, D, { n: 'A', a, ...stampOf(res) });
  assert.equal(cleanBoard(b)[D][0].v, SIM_VERSION);
  assert.equal(mergeOwn(null, D, a, 1, undefined, res).days[D].v, SIM_VERSION);
  assert.equal(dayEntries([{ id: 'u', data: mergeOwn(null, D, a, 1, undefined, res) }], D)[0].r.spent, res.spent);
});

test('Armee-Codes: neue Einheiten nur hinten anhängen (Typ = Index in PAINT_TYPES, 6 Bit)', () => {
  const fixed = 'krieger,schuetze,ritter,grenadier,reiter,roemer,sani,wolf,baer,biene,magier,geist,drache,vampir,soldat,mg,sniper,panzerfaust,moerser,panzer,heli,troll,zyklop,hexe,phoenix,einhorn,elefant,krokodil,gorilla,adler,bueffel'.split(',');
  assert.deepEqual(PAINT_TYPES.slice(0, fixed.length), fixed);
  assert.ok(PAINT_TYPES.length <= 64);
});
