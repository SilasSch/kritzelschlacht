// Kapitel „Burgen & Ritter“ (Spez. #52): Form der Level. Die Balance prüft tools/balance.mjs --chapter=burgen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS } from '../game/js/data.js';
import burgen from '../game/js/campaign/burgen.js';

test('Burgen & Ritter: 4–5 Level mit festen ids burg-1 …', () => {
  assert.ok(burgen.levels.length >= 4 && burgen.levels.length <= 5);
  burgen.levels.forEach((l, i) => assert.equal(l.id, `burg-${i + 1}`));
});

test('Burgen & Ritter: nur Armee-Einheiten, jedes Level mit Gelände und Smart-Plan unter par', () => {
  for (const l of burgen.levels) {
    assert.ok(l.units.length >= 3, l.id);
    for (const t of l.units) assert.equal(UNITS[t].cat, 'armee', `${l.id}: ${t}`);
    assert.ok(l.place.some(p => p[0] === 'tRect' || p[0] === 'tCircle'), `${l.id}: Gelände`);
    const cost = l.plan.smart.reduce((s, [t, n]) => s + n * UNITS[t].cost, 0);
    assert.ok(cost <= l.par && l.par <= l.budget, l.id);
    assert.ok(l.hint.length > 20, l.id);
  }
});
