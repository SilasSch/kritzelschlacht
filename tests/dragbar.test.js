import test from 'node:test';
import assert from 'node:assert/strict';
import { placeAt, fractionOf, parsePos } from '../game/js/ui/dragbar.js';

test('placeAt hält die Leiste im Fenster, auch nach Verkleinern', () => {
  for (const [fx, fy] of [[0, 0], [1, 1], [.5, .3], [-2, 5]]) {
    for (const [vw, vh] of [[1920, 1080], [760, 640], [500, 300]]) {
      const p = placeAt(fx, fy, vw, vh, 700, 180);
      assert.ok(p.x >= 8 && p.y >= 8, `${fx},${fy} @ ${vw}x${vh}`);
      if (vw >= 716) assert.ok(p.x + 700 <= vw - 8 + 1e-9);
      if (vh >= 196) assert.ok(p.y + 180 <= vh - 8 + 1e-9);
    }
  }
});

test('fractionOf ist die Umkehrung von placeAt und begrenzt auf 0..1', () => {
  const f = fractionOf(300, 200, 1920, 1080, 700, 180), p = placeAt(f.fx, f.fy, 1920, 1080, 700, 180);
  assert.ok(Math.abs(p.x - 300) < 1e-9 && Math.abs(p.y - 200) < 1e-9);
  assert.deepEqual(fractionOf(-500, 5000, 1920, 1080, 700, 180), { fx: 0, fy: 1 });
});

test('parsePos liest nur gültige Lagen', () => {
  assert.deepEqual(parsePos('{"fx":0.25,"fy":2}'), { fx: .25, fy: 1 });
  assert.equal(parsePos('kaputt'), null);
  assert.equal(parsePos(null), null);
  assert.equal(parsePos('{"fx":"a"}'), null);
});
