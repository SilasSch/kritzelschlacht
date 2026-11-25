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
