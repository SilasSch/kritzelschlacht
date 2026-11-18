import test from 'node:test';
import assert from 'node:assert/strict';
import { worldSizeFor, createCamera, worldToScreen, WORLD_ASPECT_MIN, WORLD_ASPECT_MAX, WORLD_MAX_W, WORLD_MAX_H } from '../game/js/camera.js';

const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

test('worldSizeFor: bis 1920×1080 wie bisher (Viewport / Grundzoom .55–1.15)', () => {
  for (const [vw, vh] of [[1280, 800], [1366, 768], [1920, 1080], [1440, 900], [1024, 768]]) {
    const bz = Math.min(1.15, Math.max(.55, Math.min(vw / 1400, vh / 820)));
    const s = worldSizeFor(vw, vh);
    assert.ok(near(s.bz, bz), `${vw}x${vh}`);
    assert.ok(near(s.W, vw / bz) && near(s.H, vh / bz), `${vw}x${vh}`);
  }
});

test('worldSizeFor: Seitenverhältnis und Größe begrenzt, Welt passt immer in die Ansicht', () => {
  for (const [vw, vh] of [[2560, 1080], [3440, 1440], [3840, 1080], [5120, 1440], [900, 1600], [600, 1400], [3840, 2160], [7680, 2160], [640, 420], [400, 300]]) {
    const s = worldSizeFor(vw, vh), a = s.W / s.H;
    assert.ok(a >= WORLD_ASPECT_MIN - 1e-9 && a <= WORLD_ASPECT_MAX + 1e-9, `${vw}x${vh}: Verhältnis ${a}`);
    assert.ok(s.W <= WORLD_MAX_W + 1e-6 && s.H <= WORLD_MAX_H + 1e-6, `${vw}x${vh}: ${s.W}x${s.H}`);
    assert.ok(s.W * s.bz <= vw + 1e-6 && s.H * s.bz <= vh + 1e-6, `${vw}x${vh}: passt nicht`);
  }
});

test('worldSizeFor: 32:9 zentriert die Welt mit Rand links und rechts', () => {
  const s = worldSizeFor(3840, 1080), c = createCamera(3840, 1080, s.W, s.H);
  assert.ok(near(c.zoom, s.bz));
  const tl = worldToScreen(c, 0, 0), br = worldToScreen(c, s.W, s.H);
  assert.ok(tl.x > 500 && near(tl.x, 3840 - br.x, 1e-3));
  assert.ok(near(tl.y, 0, 1e-3) && near(br.y, 1080, 1e-3));
});
