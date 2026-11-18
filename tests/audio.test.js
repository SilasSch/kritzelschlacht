// Ton-Auswahl ohne WebAudio: resolveSound (Zusammenhang aus dem vorigen Ereignis), deathVoice, spatial, Speicher
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSound, deathVoice, spatial, eventSound, createAudio } from '../game/js/audio.js';
import { UNITS } from '../game/js/data.js';
import { parseSave, serializeSave } from '../game/js/save.js';

test('deathVoice: jede Einheit hat eine Todesstimme, Fahrzeuge/Bienen/Geist/Tiere eigene', () => {
  const ok = new Set(['die', 'dieBeast', 'dieBug', 'dieSpirit', 'dieMetal']);
  for (const k of Object.keys(UNITS)) assert.ok(ok.has(deathVoice(k)), k);
  assert.equal(deathVoice('panzer'), 'dieMetal');
  assert.equal(deathVoice('heli'), 'dieMetal');
  assert.equal(deathVoice('biene'), 'dieBug');
  assert.equal(deathVoice('geist'), 'dieSpirit');
  assert.equal(deathVoice('baer'), 'dieBeast');
  assert.equal(deathVoice('drache'), 'dieBeast');
  assert.equal(deathVoice('krieger'), 'die');
  assert.equal(deathVoice('unbekannt'), 'die');
});

test('resolveSound: Tod nach death-Ereignis je Einheit, mit Ort und Größe', () => {
  const r = resolveSound({ type: 'sound', k: 'die' }, { type: 'death', x: 100, y: 50, unitType: 'elefant' });
  assert.deepEqual(r, { k: 'dieBeast', size: UNITS.elefant.r, x: 100, y: 50 });
  assert.equal(resolveSound({ type: 'sound', k: 'die' }, null).k, 'die');
});

test('resolveSound: Zauber und Schüsse schärfen den Ton', () => {
  assert.equal(resolveSound({ type: 'sound', k: 'shot' }, { type: 'spell', k: 'bolt', x0: 0, y0: 0, x1: 7, y1: 8 }).k, 'zap');
  assert.equal(resolveSound({ type: 'sound', k: 'shot' }, { type: 'spell', k: 'bolt', x1: 7, y1: 8 }).x, 7);
  assert.equal(resolveSound({ type: 'sound', k: 'impact' }, { type: 'spell', k: 'meteor', x: 1, y: 1 }).k, 'meteor');
  assert.equal(resolveSound({ type: 'sound', k: 'whoosh' }, { type: 'shot', kind: 'rocket', x: 1, y: 1 }).k, 'rocket');
  assert.equal(resolveSound({ type: 'sound', k: 'fire' }, { type: 'shot', kind: 'breath', x: 1, y: 1 }).k, 'breath');
  assert.equal(resolveSound({ type: 'sound', k: 'shot' }, { type: 'shot', kind: 'bullet', x: 1, y: 1 }).k, 'shot');
  assert.equal(resolveSound({ type: 'sound', k: 'boom' }, { type: 'blast', x: 1, y: 1, R: 66 }).size, 66);
});

test('eventSound: neue Töne für Pfeile, Feuer, Heilung, Horn; Lava zischt', () => {
  assert.equal(eventSound({ type: 'hit', kind: 'arrow' }), 'thunk');
  assert.equal(eventSound({ type: 'hit', kind: 'melee' }), null);   // Ton kommt als sound-Ereignis
  assert.equal(eventSound({ type: 'miss', kind: 'pilum' }), 'thwip');
  assert.equal(eventSound({ type: 'miss', kind: 'bullet' }), null);
  assert.equal(eventSound({ type: 'charge', horn: true }), 'horn');
  assert.equal(eventSound({ type: 'charge' }), null);
  assert.equal(eventSound({ type: 'terrain', kind: 'ash' }), 'sizzle');
  assert.equal(eventSound({ type: 'heal' }), 'heal');
});

test('spatial: links/rechts, außerhalb leiser, ohne Ort mittig', () => {
  const cam = { x: 0, y: 0, zoom: 1, fit: 1, viewW: 1000, viewH: 600 };
  assert.deepEqual(spatial(cam, null, null), { pan: 0, gain: 1 });
  assert.ok(spatial(cam, 50, 300).pan < -.6);
  assert.ok(spatial(cam, 950, 300).pan > .6);
  assert.ok(Math.abs(spatial(cam, 500, 300).pan) < 1e-9);
  assert.equal(spatial(cam, 500, 300).gain, 1);
  assert.ok(spatial(cam, 2000, 300).gain < .5);
});

test('createAudio ohne Browser: stumm, wirft nicht', () => {
  const a = createAudio();
  a.play('boom'); a.onEvents([{ type: 'sound', k: 'die' }], null, false); a.setVolume(2);
  assert.equal(a.volume, 1);
});

test('Speicher: Lautstärke bleibt erhalten, alte Stände ohne Lautstärke gehen', () => {
  const s = parseSave(serializeSave({ stars: {}, muted: false, volume: .35 }));
  assert.equal(s.volume, .35);
  assert.equal(parseSave(JSON.stringify({ stars: {}, muted: true })).volume, undefined);
});
