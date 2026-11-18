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
