// Tageschallenge (Audit 18.11.): game/js/daily.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, COUNTERS } from '../game/js/data.js';
import { dailyLevel, dateKey, shortDate, shareText, PUBLIC_URL, recordDaily, countersOf, DAILY_MAIN, DAILY_BOSSES, dcost } from '../game/js/daily.js';
import { validateCampaign, unitAllowed, terrainAllowed } from '../game/js/campaign/index.js';
import { createWorld } from '../game/js/world.js';
import { step, buildMission, missionResult } from '../game/js/sim.js';
import { placePlan } from '../tools/plans.mjs';

const days = n => Array.from({ length: n }, (_, i) => dateKey(new Date(2026, 10, 1 + i)));
const enemyPts = L => L.place.reduce((a, p) => a + (p[0] === 'rect' || p[0] === 'circle' ? p[2] * dcost(p[1]) : p[0] === 'unit' ? dcost(p[1]) : 0), 0);   // feste Kosten (daily.DAILY_COST)

test('dateKey und shortDate: Ortszeit, YYYY-MM-DD und 18.11.', () => {
  assert.equal(dateKey(new Date(2026, 10, 18, 23, 59)), '2026-11-18');
  assert.equal(dateKey(new Date(2027, 0, 3)), '2027-01-03');
  assert.equal(shortDate('2026-11-18'), '18.11.');
  assert.equal(shortDate('2027-01-03'), '3.1.');
});

test('Tageschallenge: gleiches Datum, gleiches Level; andere Tage, andere Level', () => {
  assert.deepEqual(dailyLevel('2026-11-18'), dailyLevel('2026-11-18'));
  const sig = new Set(days(30).map(d => JSON.stringify({ ...dailyLevel(d), id: 0, n: 0, daily: 0 })));
  assert.ok(sig.size >= 28, `nur ${sig.size} verschiedene Level in 30 Tagen`);
});

test('Tageschallenge: gültiges Level im Kampagnenformat (60 Tage)', () => {
  for (const d of days(60)) {
    const L = dailyLevel(d);
    assert.equal(L.id, 'daily-' + d);
    assert.equal(L.n, 'Tageschallenge ' + shortDate(d));
    assert.deepEqual(validateCampaign([{ id: 'daily', n: 'Tageschallenge', d: 'Täglich neu', levels: [L] }]), [], d);
    // 5–6 erlaubte Typen, alle malbar; kein Gelände malen
    assert.ok(L.units.length >= 5 && L.units.length <= 6, `${d}: ${L.units.length} Typen`);
    assert.ok(L.units.every(t => UNITS[t].paint !== false && unitAllowed(L, t)), d);
    assert.equal(terrainAllowed(L, 'wasser'), false, `${d}: Gelände malen verboten`);
    assert.equal(terrainAllowed(L, 'radierer'), true);
    // Gegner: 1–3 Gruppen plus höchstens ein Boss, rechts im Rahmen, 70–140 Punkte (Rundung der Anzahl)
    const foes = L.place.filter(p => p[0] === 'rect' || p[0] === 'unit');
    const groups = foes.filter(p => p[0] === 'rect'), bosses = foes.filter(p => DAILY_BOSSES.includes(p[1]));
    assert.ok(groups.length >= 1 && groups.length <= 3, d);
    assert.ok(bosses.length <= 1, d);
    assert.ok(foes.every(p => UNITS[p[1]].paint !== false), d);
    for (const p of groups) assert.ok(p[3] >= .6 && p[5] <= .92 && p[3] < p[5] && p[4] < p[6], `${d}: ${JSON.stringify(p)}`);
    for (const p of L.place.filter(q => q[0] === 'unit')) assert.ok(p[2] >= .6 && p[2] <= .92, d);
    // Gelände höchstens eines, in der gegnerischen Hälfte
    const ter = L.place.filter(p => p[0] === 'tRect' || p[0] === 'tCircle');
    assert.ok(ter.length <= 1, d);
    for (const p of ter) assert.ok(p[2] >= .48, `${d}: Gelände bei x ${p[2]}`);
    const pts = enemyPts(L);
    assert.ok(pts >= 60 && pts <= 150, `${d}: ${pts} Punkte`);
    // budget ≈ 1,5 ×, par ≈ 1,1 × Gegnerpunkte, auf 5 gerundet
    assert.ok(L.par % 5 === 0 && L.budget % 5 === 0, d);
    assert.ok(Math.abs(L.par - pts * 1.1) <= 2.5 && Math.abs(L.budget - pts * 1.5) <= 2.5, `${d}: par ${L.par}, budget ${L.budget}, Gegner ${pts}`);
    // Hinweis nennt die erlaubten Einheiten
    assert.match(L.hint, /\?$/);
  }
});

test('Tageschallenge: immer mindestens zwei Konter des Hauptgegners erlaubt', () => {
  for (const d of days(60)) {
    const L = dailyLevel(d);
    assert.ok(DAILY_MAIN.includes(L.main), d);
    assert.equal(L.place.find(p => p[0] === 'rect')[1], L.main, `${d}: die erste Gruppe ist der Hauptgegner`);
    const c = L.units.filter(t => COUNTERS.some(k => k[0] === t && k[1] === L.main));
    assert.ok(c.length >= 2, `${d}: Konter von ${L.main}: ${c}`);
    assert.ok(countersOf(L.main).length >= 2);
    // der Plan nutzt nur Konter
    for (const [t] of L.plan.smart) assert.ok(COUNTERS.some(k => k[0] === t), `${d}: ${t} ist kein Konter`);
  }
});

test('Tageschallenge: Teilen-Text und Bestwert', () => {
  const full = shareText('2026-11-18', { win: true, spent: 64, budget: 110, stars: 3, time: 38.2, lost: 3, deployed: 10, medals: { mask: 3 } });
  assert.equal(full, '🖍️ Kritzelschlacht · Tageschallenge #1 (18.11.)\n⭐⭐⭐ Sieg mit 64 von 110 Punkten in 0:38\n'
    + '🟦🟦🟦🟦🟦🟦🟦🟥🟥🟥 7 von 10 überlebt\n🛡️⚡ Medaillen\nSchaffst du\'s billiger? ' + PUBLIC_URL);
  assert.ok(full.length <= 280);
  assert.match(shareText('2026-11-19', { win: true, spent: 70.5, stars: 2 }), /^🖍️ Kritzelschlacht · Tageschallenge #2 \(19\.11\.\)\n⭐⭐✩ Sieg mit 70,5 Punkten\n/);
  const lost = shareText('2026-11-18', { win: false, spent: 50, stars: 0, deployed: 4, lost: 4, medals: { mask: 7 } });
  assert.match(lost, /Niederlage/); assert.doesNotMatch(lost, /Medaillen|⭐/);
  const daily = {};
  assert.equal(recordDaily(daily, '2026-11-18', { win: false, spent: 10, stars: 0 }), null, 'Niederlage zählt nicht');
  assert.deepEqual(recordDaily(daily, '2026-11-18', { win: true, spent: 80, stars: 2 }), { spent: 80, stars: 2 });
  assert.deepEqual(recordDaily(daily, '2026-11-18', { win: true, spent: 90, stars: 1 }), { spent: 80, stars: 2 }, 'schlechter bleibt der alte');
  assert.deepEqual(recordDaily(daily, '2026-11-18', { win: true, spent: 64, stars: 3 }), { spent: 64, stars: 3 });
  assert.deepEqual(Object.keys(daily), ['2026-11-18']);
});

// Der Lösungsplan gewinnt fast immer (Tuning des Erzeugers, 300 Läufe über 150 Tage: 296 Siege). Hier 8 feste Tage.
test('Tageschallenge: der Lösungsplan gewinnt in den meisten Fällen', () => {
  const ds = ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-12-05', '2026-12-24', '2027-01-07', '2027-02-14'];
  const out = ds.map((d, i) => {
    const L = dailyLevel(d);
    const w = createWorld(1400, 875, 500 + i); buildMission(w, L);
    placePlan(w, L.plan.smart);
    let t = 0, r = null;
    while (!r) { step(w, 1 / 60); w.events.length = 0; t += 1 / 60; r = missionResult(w, t); }
    return r;
  });
  const wins = out.filter(r => r === 'win').length;
  assert.ok(wins >= 7, `nur ${wins}/${ds.length} gewonnen: ${out}`);
});
