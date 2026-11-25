import test from 'node:test';
import assert from 'node:assert/strict';
import { foldReason } from '../game/js/ui/palfold.js';

test('Malleiste klappt in Missionen und Schlacht im Kampf und beim Malen weg, im Sandkasten nie', () => {
  assert.equal(foldReason({}, false), null);
  assert.equal(foldReason({}, true), null);   // Sandkasten bleibt wie gehabt
  for (const k of ['mission', 'battle']) {
    assert.equal(foldReason({ [k]: { phase: 'plan' } }, false), null);
    assert.equal(foldReason({ [k]: { phase: 'plan' } }, true), 'paint');
    for (const ph of ['battle', 'fight', 'done']) assert.equal(foldReason({ [k]: { phase: ph } }, false), 'fight');
  }
});

test('Ganzes HUD: beim Malen überall weg, im Kampf reduziert, in Aufstellung und Auswertung voll', async () => {
  const { hudMode, isNet } = await import('../game/js/ui/palfold.js');
  assert.equal(hudMode({}, false), null);
  assert.equal(hudMode({}, true), 'paint');                         // auch im Sandkasten
  assert.equal(hudMode({ battle: { phase: 'fight' } }, true), 'paint');
  assert.equal(hudMode({ mission: { phase: 'plan' } }, false), null);
  assert.equal(hudMode({ mission: { phase: 'battle' } }, false), 'fight');
  assert.equal(hudMode({ mission: { phase: 'done' } }, false), null);   // Ergebnis: volle Leiste
  assert.equal(hudMode({ battle: { phase: 'fight' } }, false), 'fight');
  assert.equal(hudMode({ battle: { phase: 'fight', batch: {} } }, false), null);
  assert.equal(hudMode({ battle: { phase: 'done' } }, false), null);
  assert.equal(isNet({ battle: { hot: { online: true } } }), true);
  assert.equal(isNet({ battle: { hot: { step: 'blau' } } }), false);
  assert.equal(isNet({}), false);
});

test('Zuschauen: reduziertes HUD und weggeklappte Malleiste, Malen geht vor', async () => {
  const { hudMode, foldReason } = await import('../game/js/ui/palfold.js');
  assert.equal(hudMode({ watch: true }, false), 'fight');
  assert.equal(hudMode({ watch: true }, true), 'paint');
  assert.equal(foldReason({ watch: true }, false), 'fight');
  assert.equal(foldReason({ watch: true }, true), null);
});
