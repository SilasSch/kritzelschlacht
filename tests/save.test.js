import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEY, parseSave, serializeSave } from '../game/js/save.js';

test('Schlüssel bleibt kritzelschlacht-v1', () => assert.equal(SAVE_KEY, 'kritzelschlacht-v1'));

test('alter Spielstand wird gelesen und im selben Format geschrieben', () => {
  const old = '{"stars":{"0":3,"1":2},"muted":true}';
  const s = parseSave(old);
  assert.deepEqual(s.stars, { 0: 3, 1: 2 });
  assert.equal(s.stars[0], 3); assert.equal(s.stars[1], 2); assert.equal(s.muted, true);
  assert.equal(serializeSave(s), old);
  s.stars[2] = 1; s.muted = false;
  assert.deepEqual(JSON.parse(serializeSave(s)), { stars: { 0: 3, 1: 2, 2: 1 }, muted: false });
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
