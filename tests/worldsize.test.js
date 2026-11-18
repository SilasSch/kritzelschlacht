import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD_W, WORLD_H, createCamera, resizeCamera, worldToScreen, setPadding } from '../game/js/camera.js';

const near = (a, b, e = 1e-3) => Math.abs(a - b) < e;

// Das Spielfeld hängt nicht vom Fenster ab: jedes Fenster zeigt die ganze Welt, mittig, nur anders skaliert
test('feste Welt passt in jedes Fenster, mittig mit Rand', () => {
  for (const [vw, vh] of [[1280, 800], [1920, 1080], [2560, 1080], [5120, 1440], [900, 1600], [640, 420], [3840, 2160]]) {
    const c = createCamera(vw, vh, WORLD_W, WORLD_H);
    const tl = worldToScreen(c, 0, 0), br = worldToScreen(c, WORLD_W, WORLD_H);
    assert.ok(tl.x >= -1e-6 && tl.y >= -1e-6 && br.x <= vw + 1e-6 && br.y <= vh + 1e-6, `${vw}x${vh}`);
    assert.ok(near(tl.x, vw - br.x) && near(tl.y, vh - br.y), `${vw}x${vh} nicht mittig`);
    assert.ok(near(br.x - tl.x, vw) || near(br.y - tl.y, vh), `${vw}x${vh} füllt keine Seite`);
  }
});

test('Resize ändert nur die Kamera: dieselbe Weltstelle bleibt sichtbar', () => {
  const c = createCamera(1920, 1080, WORLD_W, WORLD_H);
  resizeCamera(c, 3840, 1080, WORLD_W, WORLD_H);
  assert.equal(c.worldW, WORLD_W); assert.equal(c.worldH, WORLD_H);
  const tl = worldToScreen(c, 0, 0), br = worldToScreen(c, WORLD_W, WORLD_H);
  assert.ok(near(tl.y, 0) && near(br.y, 1080) && near(tl.x, 3840 - br.x));
});

test('setPadding: Welt mit freiem Platz rückt zwischen die HUD-Leisten', () => {
  const c = createCamera(760, 640, WORLD_W, WORLD_H);   // Welt 760×427,5, 212,5 px frei
  setPadding(c, 60, 140);
  let tl = worldToScreen(c, 0, 0), br = worldToScreen(c, WORLD_W, WORLD_H);
  assert.ok(near(tl.y, 60 + (212.5 - 200) / 2, .01) && near(tl.x, 0));
  setPadding(c, 100, 300);                              // zu wenig Platz: Verhältnis 1 : 3
  tl = worldToScreen(c, 0, 0);
  assert.ok(near(tl.y, 212.5 / 4, .01));
  setPadding(c, 0, 0);
  tl = worldToScreen(c, 0, 0); br = worldToScreen(c, WORLD_W, WORLD_H);
  assert.ok(near(tl.y, 640 - br.y));
});
