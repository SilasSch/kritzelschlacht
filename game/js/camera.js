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

export function clampCamera(cam) {
  const vw = cam.viewW / cam.zoom, vh = cam.viewH / cam.zoom;
  // Passt die Welt in die Ansicht, wird sie zentriert; sonst bleibt der Rand im Bild.
  cam.x = vw >= cam.worldW ? (cam.worldW - vw) / 2 : Math.min(Math.max(cam.x, 0), cam.worldW - vw);
  cam.y = vh >= cam.worldH ? (cam.worldH - vh) / 2 : Math.min(Math.max(cam.y, 0), cam.worldH - vh);
  return cam;
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
