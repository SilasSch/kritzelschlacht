import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, MISSIONS, TERRAIN, CELL, HASH_CELL } from '../game/js/data.js';
import { createWorld, spawn, factionOf, cellIndex, setCell, rebuildHash, query, nearestEnemy, resizeWorld } from '../game/js/world.js';

test('spawn setzt Startwerte', () => { const w = createWorld(1400, 800, 7);
  const u = spawn(w, 'krieger', 100, 100, 'blau');
  assert.equal(u.hp, UNITS.krieger.hp); assert.equal(u.z, 0); assert.equal(u.state, 'ok');
  assert.equal(u.face, 1); assert.equal(u.tg, null); assert.equal(u.gn, 1); assert.equal(u.gx, 100);
  assert.equal(spawn(w, 'heli', 50, 50, 'rot').z, UNITS.heli.flyZ);
  assert.equal(spawn(w, 'heli', 50, 50, 'rot').face, -1); });
test('Seed macht Welt reproduzierbar', () => { assert.equal(createWorld(10,10,3).rng(), createWorld(10,10,3).rng()); });
test('nearestEnemy: nächster Gegner, keine Verbündeten', () => {
  const w = createWorld(1400, 800); w.teamMode = true;
  const a = spawn(w, 'krieger', 100, 100, 'blau'); spawn(w, 'krieger', 110, 100, 'blau');
  spawn(w, 'krieger', 400, 100, 'rot'); const near = spawn(w, 'krieger', 200, 100, 'rot');
  rebuildHash(w); assert.equal(nearestEnemy(w, a), near); });
test('nearestEnemy: keine Gegner → null', () => {
  const w = createWorld(1400, 800); w.teamMode = true;
  const a = spawn(w, 'krieger', 100, 100, 'blau'); rebuildHash(w); assert.equal(nearestEnemy(w, a), null); });
test('Nahkämpfer am Boden zielen nie auf Hubschrauber', () => {
  const w = createWorld(1400, 800); w.teamMode = true;
  const k = spawn(w, 'krieger', 100, 100, 'blau'); spawn(w, 'heli', 120, 100, 'rot');
  rebuildHash(w); assert.equal(nearestEnemy(w, k), null); });
test('Geist bevorzugt Fernkämpfer (Faktor 0.45)', () => {
  const w = createWorld(1400, 800); w.teamMode = true;
  const g = spawn(w, 'geist', 100, 100, 'blau'); spawn(w, 'krieger', 200, 100, 'rot');
  const s = spawn(w, 'schuetze', 240, 100, 'rot'); rebuildHash(w); assert.equal(nearestEnemy(w, g), s); });
test('Teammodus: Fraktion = Team, sonst = Typ', () => {
  const w = createWorld(1400, 800); const u = spawn(w, 'wolf', 5, 5, 'gelb');
  assert.equal(factionOf(w, u), 'wolf'); w.teamMode = true; assert.equal(factionOf(w, u), 'gelb'); });
test('rebuildHash zählt Fraktionen, query bricht bei true ab', () => {
  const w = createWorld(1400, 800); spawn(w, 'wolf', 50, 50, 'blau'); spawn(w, 'wolf', 60, 50, 'blau'); spawn(w, 'baer', 70, 50, 'rot');
  rebuildHash(w); assert.equal(w.totalAlive, 3); assert.equal(w.facCount.get('wolf'), 2);
  let n = 0; query(w, 60, 50, 40, () => { n++; return true; }); assert.equal(n, 1); });
test('resizeWorld behält Gelände und klemmt Einheiten', () => {
  const w = createWorld(1000, 600); setCell(w, cellIndex(w, 55, 55), 1); const u = spawn(w,'krieger',990,590,'blau');
  resizeWorld(w, 800, 500);
  assert.equal(w.terr[cellIndex(w,55,55)], 1); assert.ok(u.x <= 800 && u.y <= 500); });
test('Daten: 9 Missionen, Konstanten', () => {
  assert.equal(MISSIONS.length, 9); assert.equal(CELL, 10); assert.equal(HASH_CELL, 40);
  assert.equal(TERRAIN.mauer.id, 4); assert.equal(UNITS.panzer.mass, 40); });
