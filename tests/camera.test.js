import test from 'node:test';
import assert from 'node:assert/strict';
import { createCamera, screenToWorld, worldToScreen, zoomAt, pan, clampCamera, resizeCamera, setPadding } from '../game/js/camera.js';

const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

test('createCamera zeigt die ganze Welt zentriert', () => {
  const c = createCamera(1200, 750, 1400, 820);
  assert.ok(near(c.fit, Math.min(1200 / 1400, 750 / 820)));
  assert.equal(c.zoom, c.fit);
  const tl = worldToScreen(c, 0, 0), br = worldToScreen(c, 1400, 820);
  assert.ok(near(tl.x, 1200 - br.x) && near(tl.y, 750 - br.y));
  assert.ok(tl.x >= -1e-6 && tl.y >= -1e-6);
});

test('screenToWorld und worldToScreen sind invers', () => {
  const c = createCamera(1200, 750, 1400, 820); zoomAt(c, 400, 300, 2.5); pan(c, 30, -20);
  const w = screenToWorld(c, 123, 456); const s = worldToScreen(c, w.x, w.y);
  assert.ok(near(s.x, 123) && near(s.y, 456));
});

test('zoomAt hält den Punkt unter dem Mauszeiger fest', () => {
  const c = createCamera(1200, 750, 1400, 820); const before = screenToWorld(c, 300, 200);
  zoomAt(c, 300, 200, 2); const after = screenToWorld(c, 300, 200);
  assert.ok(Math.abs(before.x - after.x) < 1e-6 && Math.abs(before.y - after.y) < 1e-6);
});

test('Zoom bleibt in [fit, fit*4]', () => {
  const c = createCamera(1200, 750, 1400, 820);
  for (let i = 0; i < 30; i++) zoomAt(c, 600, 375, 1.15);
  assert.ok(near(c.zoom, c.fit * 4));
  for (let i = 0; i < 60; i++) zoomAt(c, 600, 375, 1 / 1.15);
  assert.ok(near(c.zoom, c.fit));
});

test('pan + screenToWorld: Missionsgrenze 0.42*W bleibt an derselben Weltstelle', () => {
  const W = 1400, c = createCamera(1200, 750, W, 820);
  zoomAt(c, 500, 300, 3);
  const sx = worldToScreen(c, 0.42 * W, 100).x;
  pan(c, 40, 0); // Kamera verschiebt sich, Bildschirmposition ändert sich ggf. durch clamp
  const w = screenToWorld(c, worldToScreen(c, 0.42 * W, 100).x, 100);
  assert.ok(near(w.x, 0.42 * W));
  assert.ok(Number.isFinite(sx));
  // Klick exakt auf die Linie ergibt Weltkoordinate 0.42*W
  const s = worldToScreen(c, 0.42 * W, 0);
  assert.ok(near(screenToWorld(c, s.x, s.y).x, 0.42 * W));
});

test('pan verschiebt um Bildschirmpixel (Welt folgt der Maus)', () => {
  const c = createCamera(1200, 750, 1400, 820); zoomAt(c, 600, 375, 3);
  const p = worldToScreen(c, 700, 400);
  pan(c, 25, -15);
  const q = worldToScreen(c, 700, 400);
  assert.ok(near(q.x - p.x, 25) && near(q.y - p.y, -15));
});

test('clampCamera hält die Welt im Bild', () => {
  const c = createCamera(1200, 750, 1400, 820); zoomAt(c, 600, 375, 3);
  pan(c, 1e6, 1e6);
  assert.ok(c.x >= -1e-6 && c.y >= -1e-6);
  pan(c, -1e7, -1e7);
  assert.ok(c.x + c.viewW / c.zoom <= c.worldW + 1e-6);
  assert.ok(c.y + c.viewH / c.zoom <= c.worldH + 1e-6);
  const f = createCamera(1200, 750, 1400, 820); f.x = 999; f.y = -999; clampCamera(f);
  const a = worldToScreen(f, 0, 0), b = worldToScreen(f, 1400, 820);
  assert.ok(near(a.x, 1200 - b.x) && near(a.y, 750 - b.y));
});

test('resizeCamera passt fit an und behält Zoom-Verhältnis', () => {
  const c = createCamera(1200, 750, 1400, 820); zoomAt(c, 600, 375, 2);
  const ratio = c.zoom / c.fit;
  resizeCamera(c, 800, 600, 1400, 820);
  assert.ok(near(c.fit, Math.min(800 / 1400, 600 / 820)));
  assert.ok(near(c.zoom / c.fit, ratio));
  assert.equal(c.viewW, 800);
  assert.ok(c.zoom >= c.fit - 1e-9 && c.zoom <= c.fit * 4 + 1e-9);
});

test('clampCamera: gezoomt berücksichtigt HUD-Padding für oberen und unteren Rand', () => {
  const c = createCamera(1200, 750, 1400, 820);
  setPadding(c, 70, 160);
  zoomAt(c, 600, 375, 2.5);
  pan(c, 0, 1e6);
  assert.ok(near(worldToScreen(c, 0, 0).y, 70), `oberer Rand bei y=70 statt ${worldToScreen(c, 0, 0).y}`);
  pan(c, 0, -1e6);
  assert.ok(near(worldToScreen(c, 0, 820).y, 750 - 160), `unterer Rand bei y=${750 - 160} statt ${worldToScreen(c, 0, 820).y}`);
});

