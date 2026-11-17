// Charakterkarten (Spez. #29): reine Kartendaten aus UNITS und COUNTERS
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, COUNTERS } from '../game/js/data.js';
import { COUNTERS as PLAN_COUNTERS } from '../tools/plans.mjs';
import { unitCard, cardTypes, RETREAT_NOTE } from '../game/js/cards.js';

const STATS = ['hp', 'dmg', 'speed', 'range', 'cost'];

test('jede Einheit hat eine Karte', () => {
  for (const t of Object.keys(UNITS)) {
    const c = unitCard(t);
    assert.equal(c.type, t);
    assert.ok(typeof c.name === 'string' && c.name.length > 0, t);
    assert.equal(c.name, UNITS[t].n);
    assert.equal(c.cat, UNITS[t].cat);
    assert.equal(c.desc, UNITS[t].d);
    assert.equal(c.raw.hp, UNITS[t].hp);
    for (const k of STATS) assert.ok(c.stats[k] >= 0 && c.stats[k] <= 1, `${t}.${k} = ${c.stats[k]}`);
    assert.ok(Array.isArray(c.abil) && Array.isArray(c.strong) && Array.isArray(c.weak) && Array.isArray(c.tags));
  }
});

test('Werte: das Maximum aller Einheiten ergibt 1, mehr ist mehr', () => {
  assert.equal(unitCard('panzer').stats.hp, 1);
  assert.equal(unitCard('sniper').stats.range, 1);   // 456 px seit Nachtrag 4 (#36), vor dem Mörser (420)
  assert.equal(unitCard('biene').stats.speed, 1);
  assert.equal(unitCard('drache').stats.cost, 1);
  assert.ok(unitCard('ritter').stats.hp > unitCard('krieger').stats.hp);
  assert.ok(unitCard('reiter').stats.speed > unitCard('ritter').stats.speed);
  // Schaden je Sekunde: das MG-Dauerfeuer zählt mehr als der einzelne Treffer
  assert.ok(unitCard('mg').stats.dmg > unitCard('krieger').stats.dmg);
  assert.ok(Math.max(...Object.keys(UNITS).map(t => unitCard(t).stats.dmg)) === 1);
});

test('Konter', () => {
  const r = unitCard('ritter');
  assert.ok(r.strong.includes('krieger'));
  assert.ok(r.weak.includes('biene'));
  assert.deepEqual([...r.strong].sort(), ['bueffel', 'einhorn', 'gorilla', 'krieger', 'reiter', 'schuetze']);
  assert.deepEqual([...r.weak].sort(), ['biene', 'magier', 'sniper']);
  assert.deepEqual([...unitCard('roemer').weak].sort(), ['grenadier', 'magier', 'moerser', 'reiter']);
  assert.ok(unitCard('moerser').strong.includes('roemer'), 'Mörser, wie im Römer-Text');
  // Konter nur aus COUNTERS, keine erfundenen; Einheiten ohne Einträge haben leere Listen
  for (const t of Object.keys(UNITS)) {
    const c = unitCard(t);
    for (const s of c.strong) assert.ok(COUNTERS.some(([a, b]) => a === t && b === s), `${t} stark gegen ${s}`);
    for (const w of c.weak) assert.ok(COUNTERS.some(([a, b]) => a === w && b === t), `${t} schwach gegen ${w}`);
    assert.equal(new Set(c.strong).size, c.strong.length);
  }
  // Task 7: jede neue Einheit schlägt mindestens eine und wird von mindestens einer geschlagen (Duell im Prüfstand)
  for (const t of ['vampir', 'troll', 'zyklop', 'hexe', 'phoenix', 'einhorn', 'elefant', 'krokodil', 'gorilla', 'adler', 'bueffel']) {
    assert.ok(unitCard(t).strong.length >= 1 && unitCard(t).weak.length >= 1, t);
  }
  assert.deepEqual(unitCard('sani').strong, []);
  assert.deepEqual(unitCard('sani').weak, []);
});

test('COUNTERS liegen in data.js, plans.mjs reicht sie weiter', () => {
  assert.equal(PLAN_COUNTERS, COUNTERS);
  for (const [a, b] of COUNTERS) assert.ok(UNITS[a] && UNITS[b], `${a}/${b}`);
});

test('Fähigkeiten', () => {
  const ab = unitCard('roemer').abil;
  const txt = ab.map(a => a.n + ' ' + a.d).join(' ');
  assert.match(txt, /Speersalve/);
  assert.match(txt, /Schild/);
  assert.ok(unitCard('ritter').abil.some(a => a.n === 'Schildwall'));
  assert.ok(unitCard('mg').abil.some(a => a.n === 'Hinlegen'));
  assert.ok(unitCard('sniper').abil.some(a => a.n === 'Nur im Liegen'));
  for (const t of Object.keys(UNITS)) {
    for (const a of unitCard(t).abil) {
      assert.ok(typeof a.n === 'string' && a.n.length > 0 && a.n.length <= 24, `${t}: ${a.n}`);
      assert.ok(typeof a.d === 'string' && a.d.length > 0 && a.d.length <= 140, `${t}: ${a.d}`);
    }
  }
  assert.match(RETREAT_NOTE, /25 %/);
});

test('Texte nennen die Konter aus der Balance-Prüfung', () => {
  assert.doesNotMatch(UNITS.ritter.d, /MG/);
  assert.match(UNITS.ritter.d, /Bienen/);
  assert.match(UNITS.ritter.d, /Scharfschützen/);
  assert.match(UNITS.roemer.d, /Mörser/);
});

test('Kategorien und Merkmale', () => {
  const g = cardTypes();
  assert.deepEqual(g.map(x => x.cat), ['armee', 'tiere', 'mythisch', 'modern']);
  assert.equal(g.reduce((s, x) => s + x.types.length, 0), Object.keys(UNITS).length);
  assert.ok(unitCard('drache').tags.includes('Fliegt'));
  assert.ok(unitCard('magier').tags.includes('Flächenschaden'));
  assert.ok(unitCard('sani').tags.includes('Heilt'));
  assert.ok(unitCard('krieger').tags.includes('Nahkampf'));
  assert.ok(unitCard('schuetze').tags.includes('Fernkampf'));
});

test('unbekannter Typ: keine Karte', () => {
  assert.equal(unitCard('wasser'), null);
  assert.equal(unitCard('gibtsnicht'), null);
});

test('Punkte: bis zwei Nachkommastellen mit Komma (Bienen 0,55)', async () => {
  const { fmtPts } = await import('../game/js/cards.js');
  assert.equal(fmtPts(UNITS.biene.cost), '0,55');
  assert.equal(fmtPts(4.5), '4,5'); assert.equal(fmtPts(40), '40'); assert.equal(fmtPts(.55 * 3), '1,65');
});
