// Reine Kamera-Mathematik (kein DOM, kein PIXI). screen = (world - cam.x) * cam.zoom;
// cam.x/cam.y sind die Weltkoordinaten der linken oberen Bildschirmecke.
const MAX_ZOOM_FACTOR = 4;

export function createCamera(viewW, viewH, worldW, worldH) {
  const cam = { x: 0, y: 0, zoom: 1, fit: 1, viewW, viewH, worldW, worldH };
  cam.fit = Math.min(viewW / worldW, viewH / worldH);
  cam.zoom = cam.fit;
  clampCamera(cam);
  return cam;
}

export function screenToWorld(cam, sx, sy) {
  return { x: sx / cam.zoom + cam.x, y: sy / cam.zoom + cam.y };
}

export function worldToScreen(cam, wx, wy) {
  return { x: (wx - cam.x) * cam.zoom, y: (wy - cam.y) * cam.zoom };
}

// Lage der Welt im freien Platz einer Achse (Bildschirm-px): spare = Ansicht − Welt, a/b = vom HUD belegt (vorn/hinten).
// Reicht der Platz, liegt die Welt mittig zwischen den HUD-Leisten; sonst wird der Platz im Verhältnis a : b verteilt.
function slack(spare, a, b) {
  if (spare >= a + b) return a + (spare - a - b) / 2;
  return a + b > 0 ? spare * a / (a + b) : spare / 2;
}

export function clampCamera(cam) {
  const vw = cam.viewW / cam.zoom, vh = cam.viewH / cam.zoom, p = cam.pad || NO_PAD;
  // Passt die Welt in die Ansicht, liegt sie im Platz zwischen den HUD-Leisten (cam.pad, sonst mittig);
  // sonst bleibt der Rand im Bild.
  cam.x = vw >= cam.worldW ? -slack((vw - cam.worldW) * cam.zoom, p.l, p.r) / cam.zoom : Math.min(Math.max(cam.x, 0), cam.worldW - vw);
  cam.y = vh >= cam.worldH ? -slack((vh - cam.worldH) * cam.zoom, p.t, p.b) / cam.zoom : Math.min(Math.max(cam.y, 0), cam.worldH - vh);
  return cam;
}
const NO_PAD = { t: 0, b: 0, l: 0, r: 0 };

// Vom HUD belegte Ränder in Bildschirm-px (oben, unten, links, rechts); nur für die Lage einer ganz sichtbaren Welt
export function setPadding(cam, t, b, l = 0, r = 0) {
  cam.pad = { t: Math.max(0, t), b: Math.max(0, b), l: Math.max(0, l), r: Math.max(0, r) };
  return clampCamera(cam);
}

export function zoomAt(cam, sx, sy, factor) {
  const before = screenToWorld(cam, sx, sy);
  cam.zoom = Math.min(cam.fit * MAX_ZOOM_FACTOR, Math.max(cam.fit, cam.zoom * factor));
  cam.x = before.x - sx / cam.zoom;
  cam.y = before.y - sy / cam.zoom;
  return clampCamera(cam);
}

export function pan(cam, dxScreen, dyScreen) {
  cam.x -= dxScreen / cam.zoom;
  cam.y -= dyScreen / cam.zoom;
  return clampCamera(cam);
}

export function resizeCamera(cam, viewW, viewH, worldW, worldH) {
  const ratio = cam.zoom / cam.fit;
  const cx = cam.x + cam.viewW / cam.zoom / 2, cy = cam.y + cam.viewH / cam.zoom / 2;
  cam.viewW = viewW; cam.viewH = viewH; cam.worldW = worldW; cam.worldH = worldH;
  cam.fit = Math.min(viewW / worldW, viewH / worldH);
  cam.zoom = cam.fit * Math.min(MAX_ZOOM_FACTOR, Math.max(1, ratio));
  cam.x = cx - viewW / cam.zoom / 2;
  cam.y = cy - viewH / cam.zoom / 2;
  return clampCamera(cam);
}

// Feste Spielfeldgröße in Weltpixeln, unabhängig vom Fenster: jedes Fenster sieht dasselbe Feld, nur skaliert
// (cam.fit) und bei abweichendem Seitenverhältnis mit Rand (clampCamera zentriert). Fenstergröße oder Resize mitten
// in der Runde ändern damit nichts am Spiel (früher Welt = Viewport / Grundzoom: größeres Fenster = mehr Platz).
// 16:9 wie die meisten Bildschirme; Missionsrahmen (world.frameX, 1,6 · H = 1440) liegt nah an der Balance-Form 1400×875.
export const WORLD_W = 1600, WORLD_H = 900;
