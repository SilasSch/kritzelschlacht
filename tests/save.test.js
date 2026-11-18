import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEY, parseSave, serializeSave } from '../game/js/save.js';

test('Schlüssel bleibt kritzelschlacht-v1', () => assert.equal(SAVE_KEY, 'kritzelschlacht-v1'));

test('alter Spielstand (Index 0–8) wird gelesen und in Level-ids übersetzt (Spez. #52)', () => {
  const old = '{"stars":{"0":3,"1":2},"muted":true}';
  const s = parseSave(old);
  assert.deepEqual(s.stars, { 'ga-1': 3, 'ga-2': 2 });
  assert.equal(s.muted, true);
  // geschrieben: ids, dazu der alte Index der Grundausbildung (ein älteres Spiel sieht die Sterne weiter)
  assert.deepEqual(JSON.parse(serializeSave(s)), { stars: { 'ga-1': 3, 'ga-2': 2, 0: 3, 1: 2 }, muted: true });
  s.stars['ga-3'] = 1; s.stars['burg-1'] = 2; s.muted = false;
  assert.deepEqual(JSON.parse(serializeSave(s)), { stars: { 'ga-1': 3, 'ga-2': 2, 'ga-3': 1, 'burg-1': 2, 0: 3, 1: 2, 2: 1 }, muted: false });
  // neu lesen verliert nichts und bleibt stabil
  const again = parseSave(serializeSave(s));
  assert.deepEqual(again.stars, { 'ga-1': 3, 'ga-2': 2, 'ga-3': 1, 'burg-1': 2 });
  assert.equal(serializeSave(again), serializeSave(s));
});

test('Migration: alle 9 alten Indizes, je Level der beste Wert, Unsinn fällt weg', () => {
  const old = JSON.stringify({ stars: { 0: 1, 1: 2, 2: 3, 3: 1, 4: 2, 5: 3, 6: 1, 7: 2, 8: 3 }, muted: false });
  const s = parseSave(old);
  assert.deepEqual(s.stars, { 'ga-1': 1, 'ga-2': 2, 'ga-3': 3, 'ga-4': 1, 'ga-5': 2, 'ga-6': 3, 'ga-7': 1, 'ga-8': 2, 'ga-9': 3 });
  // altes Spiel (kritzelschlacht.html) hat nach dem neuen weitergespielt: alter Index besser als die id
  const mixed = parseSave('{"stars":{"0":3,"ga-1":1,"ga-2":2,"1":1,"9":3,"rom-1":"2","x":0,"y":-1,"z":"kaputt"}}');
  assert.deepEqual(mixed.stars, { 'ga-1': 3, 'ga-2': 2, 'rom-1': 2 });
  assert.equal(mixed.muted, false);
});

test('kein oder kaputter Spielstand ergibt den leeren Stand', () => {
  for (const t of [null, undefined, '', 'null', 'kaputt{', '42', '"text"', '[1,2]', 'true',
    '{"stars":null}', '{"stars":"x","muted":1}', '{"stars":[3,2]}']) {
    const s = parseSave(t);
    assert.ok(s.stars && typeof s.stars === 'object' && !Array.isArray(s.stars), `stars bei ${t}`);
    assert.equal(Object.keys(s.stars).length, 0, `keine Sterne bei ${t}`);
    assert.doesNotThrow(() => serializeSave(s));
  }
  assert.equal(parseSave('{"muted":true}').muted, true);
  assert.equal(parseSave('kaputt').muted, false);
});

/* ---------- Tageschallenge (Audit 18.11.) ---------- */
test('Tageschallenge: daily wird gelesen, geprüft, geschrieben und auf 30 Tage gekürzt', () => {
  // alter Stand ohne daily: leeres Objekt, geschrieben wie vorher (ohne daily)
  const old = parseSave('{"stars":{"ga-1":2},"muted":false}');
  assert.deepEqual(old.daily, {});
  assert.deepEqual(JSON.parse(serializeSave(old)), { stars: { 'ga-1': 2, 0: 2 }, muted: false });
  // Unsinn fällt weg, Sterne höchstens 3
  const s = parseSave(JSON.stringify({ stars: {}, daily: { '2026-11-18': { spent: 64, stars: 3 }, '2026-11-17': { spent: 'x' },
    kaputt: { spent: 1 }, '2026-11-16': null, '2026-11-15': { spent: 70.5, stars: 9 } } }));
  assert.deepEqual(s.daily, { '2026-11-15': { spent: 70.5, stars: 3 }, '2026-11-18': { spent: 64, stars: 3 } });
  assert.deepEqual(parseSave(serializeSave(s)).daily, s.daily);
  assert.deepEqual(parseSave(serializeSave(s)).stars, {});
  for (const t of ['{"daily":null}', '{"daily":[1]}', '{"daily":"x"}']) assert.deepEqual(parseSave(t).daily, {});
  // nur die letzten 30 Tage
  const many = {};
  for (let d = 1; d <= 40; d++) many[`2026-10-${String(d).padStart(2, '0')}`] = { spent: d, stars: 1 };
  const k = Object.keys(parseSave(JSON.stringify({ daily: many })).daily);
  assert.equal(k.length, 30);
  assert.equal(k[0], '2026-10-11');
  s.daily = many;
  assert.equal(Object.keys(JSON.parse(serializeSave(s)).daily).length, 30);
});
