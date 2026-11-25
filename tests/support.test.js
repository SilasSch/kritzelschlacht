// Unterstützer (Sanitäter, Trommler …) fliehen nur vor Gegnern, die zu ihnen durchkommen: ein Gegner, den ein eigener
// Kämpfer vor ihnen bindet, zählt nicht (combat.SUPPORT_FLEE). Näher als NEAR px oder auf sie gezielt: weichen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, rebuildHash } from '../game/js/world.js';
import { think, SUPPORT_FLEE } from '../game/js/combat.js';
import { runSupport } from '../tools/supportlab.mjs';

const mk = () => { const w = createWorld(1400, 800, 3); w.teamMode = true; return w; };
const freeze = u => { u.T = { ...u.T, speed: 0, dmg: 0, cd: 99 }; };
function scene(type, screened) {
  const w = mk();
  const s = spawn(w, type, 500, 400, 'blau');
  if (screened) freeze(spawn(w, 'krieger', 570, 400, 'blau'));
  const e = spawn(w, 'krieger', 590, 400, 'rot'); freeze(e);
  rebuildHash(w); think(w, s, 1 / 60);
  return { s, e };
}
for (const type of ['sani', 'trommler']) {
  test(`${type}: Gegner hinter eigenem Kämpfer (90 px) – bleibt stehen`, () => {
    const { s } = scene(type, true);
    assert.equal(s.fleeX || 0, 0); assert.ok(!(s.mx < 0), 'läuft nicht weg');
  });
  test(`${type}: derselbe Gegner ungedeckt – weicht zurück`, () => {
    const { s } = scene(type, false);
    assert.ok(s.fleeX < 0 && s.mx < 0);
  });
}
test('Gegner näher als NEAR px: weicht trotz Deckung', () => {
  const w = mk();
  const s = spawn(w, 'sani', 500, 400, 'blau');
  freeze(spawn(w, 'krieger', 520, 400, 'blau'));
  freeze(spawn(w, 'krieger', 500 + SUPPORT_FLEE.NEAR - 10, 400, 'rot'));
  rebuildHash(w); think(w, s, 1 / 60);
  assert.ok(s.fleeX < 0);
});
test('supportlab: Takt erreicht die kämpfende Linie im Schnitt deutlich öfter als früher (62 %)', () => {
  let up = 0; for (let s = 1; s <= 4; s++) up += runSupport(s).m.drumUp;
  assert.ok(up / 4 > 72, `Takt-Abdeckung ${up / 4} %`);
});
