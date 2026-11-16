// Flache Vierecke (Task 13): Matrizen wie PIXI.Transform, Ecken wie Sprite.calculateVertices.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newMat, mat, mul, corners, bgr } from '../game/js/render/quads.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
// Bezugsrechnung ohne Matrix: Punkt (x, y) im Kind → Elternraum (erst Drehpunkt, Skalierung, Drehung, Lage)
const apply = (x, y, T) => {
  const qx = (x - T.px) * T.sx, qy = (y - T.py) * T.sy, c = Math.cos(T.rot), s = Math.sin(T.rot);
  return [qx * c - qy * s + T.x, qx * s + qy * c + T.y];
};
const T1 = { x: 30, y: -12, rot: .7, sx: -1.2, sy: .8, px: 3, py: 9 };
const T2 = { x: 4, y: 2.5, rot: -1.3, sx: .5, sy: .5, px: 0, py: 0 };

test('mat entspricht Drehpunkt → Skalierung → Drehung → Lage', () => {
  const M = mat(newMat(), T1.x, T1.y, T1.rot, T1.sx, T1.sy, T1.px, T1.py);
  for (const [x, y] of [[0, 0], [5, -2], [-7, 11]]) {
    const [ex, ey] = apply(x, y, T1);
    near(M[0] * x + M[2] * y + M[4], ex); near(M[1] * x + M[3] * y + M[5], ey);
  }
});

test('mul: Kind in Eltern verschachtelt wie Container → Sprite', () => {
  const P = mat(newMat(), T1.x, T1.y, T1.rot, T1.sx, T1.sy, T1.px, T1.py);
  const C = mat(newMat(), T2.x, T2.y, T2.rot, T2.sx, T2.sy);
  const M = mul(newMat(), P, C);
  const [ix, iy] = apply(6, -3, T2), [ex, ey] = apply(ix, iy, T1);
  near(M[0] * 6 + M[2] * -3 + M[4], ex); near(M[1] * 6 + M[3] * -3 + M[5], ey);
  // o darf ein Eingang sein
  const M2 = mul(C, P, C);
  for (let k = 0; k < 6; k++) near(M2[k], M[k]);
});

test('corners: Anker und Reihenfolge wie Sprite.calculateVertices', () => {
  const M = mat(newMat(), 100, 50, 0, 2, 2);
  const v = corners(new Float32Array(8), M, 10, 4, .5, 1);
  // Anker (0.5, 1): Ursprung unten Mitte; oben links, oben rechts, unten rechts, unten links
  assert.deepEqual(Array.from(v), [90, 42, 110, 42, 110, 50, 90, 50]);
  const R = mat(newMat(), 0, 0, Math.PI / 2, 1, 1);
  const w = corners(new Float32Array(8), R, 2, 2, 0, 0);
  near(w[2], 0, 1e-6); near(w[3], 2, 1e-6);   // (2, 0) um 90° → (0, 2)
});

test('bgr: Farbe in der Reihenfolge von Sprite._tintRGB', () => {
  assert.equal(bgr(0x123456), 0x563412);
  assert.equal(bgr(0xffffff), 0xffffff);
  assert.equal(bgr(0xff0000), 0x0000ff);
});
