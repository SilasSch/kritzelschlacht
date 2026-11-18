// Vorhalt der Schützen (Fehler 18.11.): Ziele, die an Lava oder einer Mauer stehen und weiter wollen, bewegen sich nicht.
// Die Pfeile müssen auf sie zielen, nicht dorthin, wohin sie wollen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../game/js/world.js';
import { step, placeRect, tRect } from '../game/js/sim.js';

function arrowHits(terrain, seed) {
  const w = createWorld(1400, 820, seed); w.teamMode = true;
  if (terrain) tRect(w, terrain, .42, 0, .5, 1);
  placeRect(w, 'schuetze', 12, .2, .35, .24, .65, 'blau');
  placeRect(w, 'krieger', 16, .62, .35, .66, .65, 'rot');
  let hit = 0, miss = 0;
  for (let i = 0; i < 60 * 20; i++) {
    step(w, 1 / 60);
    for (const e of w.events) if (e.kind === 'arrow') { if (e.type === 'hit') hit++; else if (e.type === 'miss') miss++; }
    w.events.length = 0;
  }
  return hit / Math.max(1, hit + miss);
}

test('Pfeile treffen Gegner, die vor Lava stehen bleiben', () => {
  for (const seed of [1, 2]) assert.ok(arrowHits('lava', seed) > .75, `Saat ${seed}: ${arrowHits('lava', seed)}`);
});

test('tatsächliche Geschwindigkeit: wer steht, hat rvx ≈ 0, auch wenn er laufen will', () => {
  const w = createWorld(1400, 820, 4); w.teamMode = true;
  tRect(w, 'lava', .42, 0, .5, 1);
  placeRect(w, 'schuetze', 4, .2, .45, .22, .55, 'blau');
  placeRect(w, 'krieger', 6, .62, .4, .64, .6, 'rot');
  for (let i = 0; i < 60 * 9; i++) { step(w, 1 / 60); w.events.length = 0; }
  const stuck = w.units.filter(u => u.alive && u.team === 'rot' && Math.abs(u.mx) > 20);
  assert.ok(stuck.length > 0, 'Krieger wollen über die Lava');
  for (const u of stuck) assert.ok(Math.abs(u.rvx) < 8, `rvx ${u.rvx}`);
});
