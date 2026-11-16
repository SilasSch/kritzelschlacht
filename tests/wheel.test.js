import test from 'node:test';
import assert from 'node:assert/strict';
import { createWheel, wheelAction, wheelPx, MAX_EVENT_ZOOM } from '../game/js/wheel.js';

const ev = (o) => ({ deltaX: 0, deltaY: 0, deltaMode: 0, shiftKey: false, ctrlKey: false, ...o });
const near = (a, b, e) => Math.abs(a - b) <= e;

test('Mausrad-Raster (100 px) zoomt etwa 1,15× in beide Richtungen', () => {
  const s = createWheel();
  assert.ok(near(wheelAction(s, ev({ deltaY: -100 })).zoom, 1.15, 1e-9));
  assert.ok(near(wheelAction(s, ev({ deltaY: 100 })).zoom, 1 / 1.15, 1e-9));
});

test('Touchpad: viele kleine Schritte zoomen so viel wie ihre Summe, nicht je Ereignis 1,15×', () => {
  const s = createWheel();
  let z = 1;
  for (let i = 0; i < 10; i++) z *= wheelAction(s, ev({ deltaY: -4 })).zoom; // 40 px zusammen
  assert.ok(near(z, Math.pow(1.15, .4), 1e-9), `z=${z}`);
  assert.ok(z < 1.1);
  // 100 Ereignisse je -1 px = ein Raster
  let z2 = 1;
  for (let i = 0; i < 100; i++) z2 *= wheelAction(s, ev({ deltaY: -1 })).zoom;
  assert.ok(near(z2, 1.15, 1e-6));
});

test('Pinch (Strg+Rad): stetig, begrenzt je Ereignis', () => {
  const s = createWheel();
  let z = 1;
  for (let i = 0; i < 10; i++) z *= wheelAction(s, ev({ deltaY: -3, ctrlKey: true })).zoom;
  assert.ok(near(z, Math.exp(.3), 1e-9), `z=${z}`);   // ~1,35× nach 10 Ereignissen, nicht 4×
  assert.equal(wheelAction(s, ev({ deltaY: -500, ctrlKey: true })).zoom, MAX_EVENT_ZOOM);
  assert.equal(wheelAction(s, ev({ deltaY: 500, ctrlKey: true })).zoom, 1 / MAX_EVENT_ZOOM);
});

test('deltaMode Zeilen (×16) und Seiten (×Ansichtshöhe) werden normalisiert', () => {
  assert.equal(wheelPx(3, 1, 800), 48);
  assert.equal(wheelPx(1, 2, 800), 800);
  assert.equal(wheelPx(-7, 0, 800), -7);
  const s = createWheel();
  assert.ok(near(wheelAction(s, ev({ deltaY: -3, deltaMode: 1 })).zoom, Math.exp(48 * Math.log(1.15) / 100), 1e-9));
  assert.equal(wheelAction(s, ev({ deltaY: -1, deltaMode: 2 }), 800).zoom, MAX_EVENT_ZOOM);
});

test('seitwärts wischen ohne Shift zoomt nicht', () => {
  const s = createWheel();
  assert.equal(wheelAction(s, ev({ deltaX: 40 })), null);
  assert.equal(wheelAction(s, ev({ deltaX: -120 })), null);
});

test('Shift+Rad: ein Raster ~8 px Pinsel, kleine Schritte werden gesammelt, deltaX zählt mit Shift', () => {
  const s = createWheel();
  assert.deepEqual(wheelAction(s, ev({ deltaY: -100, shiftKey: true })), { brush: 8 });
  assert.deepEqual(wheelAction(s, ev({ deltaY: 100, shiftKey: true })), { brush: -8 });
  // Touchpad: 25 Ereignisse je -4 px = ein Raster = 8 px insgesamt
  let sum = 0;
  for (let i = 0; i < 25; i++) { const r = wheelAction(s, ev({ deltaY: -4, shiftKey: true })); if (r) sum += r.brush; }
  assert.equal(sum, 8);
  // Browser, die Shift+Rad zu deltaX machen
  assert.deepEqual(wheelAction(createWheel(), ev({ deltaX: -100, shiftKey: true })), { brush: 8 });
  // ein riesiges Ereignis ändert den Pinsel höchstens um ein Raster
  assert.deepEqual(wheelAction(createWheel(), ev({ deltaY: -1000, shiftKey: true })), { brush: 8 });
});

test('Shift+Rad: Richtungswechsel verwirft den angesammelten Rest', () => {
  const s = createWheel();
  assert.equal(wheelAction(s, ev({ deltaY: -10, shiftKey: true })), null); // 0,8 px gesammelt
  assert.equal(wheelAction(s, ev({ deltaY: 10, shiftKey: true })), null);  // Rest verworfen, -0,8
  assert.ok(Math.abs(s.acc + .8) < 1e-9);
});
