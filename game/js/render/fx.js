// Effekte (Task 12, Spez. #14): zeichnet die Partikel aus fxcore.js, malt Decals (Krater, Asche, Flecken)
// und liefert das Bildschirmwackeln. createFx(renderer) mit renderer.layers (Ebenen des Renderers).
//   consume(events)  Ereignisse eines Bilds (world.events) → Partikel, Decals, Wackeln
//   update(dt[, world])  Partikel altern lassen (Spielzeit), Flugspuren der Geschosse aus world.proj
//   frame(t)  pro Bild vor dem Rendern: Sprites setzen, Decals hochladen, Wackeln abklingen lassen (Echtzeit)
//             und den Versatz { x, y } zurückgeben
//   resize(W, H, res)  Weltgröße / Auflösung der Decal-Leinwand (leert sie)
//   clear(), debug(), shake (Zahl)
// Partikel liegen in PIXI.ParticleContainern, alle aus einem Atlas (eine BaseTexture):
//   light (Ebene 'light', unter Schatten und Figuren, additiv): Bodenlicht der Explosionen
//   glow  (Ebene 'fx', additiv): weiches Glühen von Feuer, Explosion, Mündungsblitz
//   main  (Ebene 'fx', normal): Kerne, Rauch, Staub, Tropfen, Ringe, Pluszeichen, Seelchen, Pfeile
// Keine Filter, kein Dauerglühen: additives Licht auf Weiß bleibt Weiß.
/* global PIXI */
import { createFxCore, look, F, FX_CAP } from './fxcore.js';

const RM = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const TAU = Math.PI * 2;
const O = '#2a2a33';
const CELL = 64, STRIDE = 68;                       // Atlas: 64-px-Felder mit 4 px Abstand
const FRAME_R = [30, 32, 26, 26, 30, 24, 58];       // Einheitsradius je Bildteil (F) in Atlas-px
const N_FRAMES = FRAME_R.length;
const DECAL_UPLOAD = .1;                            // Decal-Upload höchstens alle 0,1 s
const PC_PROPS = { vertices: true, position: true, rotation: true, uvs: true, tint: true };
const rnd = (a, b) => a + Math.random() * (b - a);

function paintAtlas(c) {
  const cx = i => i * STRIDE + 2 + CELL / 2, cy = 2 + CELL / 2;
  // disc: harte Scheibe
  c.fillStyle = '#fff'; c.beginPath(); c.arc(cx(F.disc), cy, 30, 0, TAU); c.fill();
  // soft: Glühen, weicher Radialverlauf
  let x = cx(F.soft), g = c.createRadialGradient(x, cy, 0, x, cy, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.3, 'rgba(255,255,255,.6)');
  g.addColorStop(.65, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(x - 32, cy - 32, 64, 64);
  // puff: Rauchwolke aus vier weichen Knubbeln
  x = cx(F.puff);
  for (const [dx, dy, r] of [[0, 3, 17], [-10, -1, 12], [10, -3, 13], [0, -8, 12]]) {
    g = c.createRadialGradient(x + dx, cy + dy, 0, x + dx, cy + dy, r);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.6, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x + dx, cy + dy, r, 0, TAU); c.fill();
  }
  // ring
  c.strokeStyle = '#fff'; c.lineWidth = 4; c.beginPath(); c.arc(cx(F.ring), cy, 26, 0, TAU); c.stroke();
  // plus (Heilung)
  x = cx(F.plus); c.fillStyle = '#fff'; c.fillRect(x - 4.5, cy - 30, 9, 60); c.fillRect(x - 30, cy - 4.5, 60, 9);
  // soul: Seelchen wie im alten Spiel (eigene Farben, tint weiß)
  {
    const r = 24, sx = cx(F.soul), sy = cy - 4;
    c.beginPath(); c.moveTo(sx - r, sy + r * .6); c.arc(sx, sy, r, Math.PI, 0); c.lineTo(sx + r, sy + r * .6);
    c.lineTo(sx + r * .35, sy + r * .35); c.lineTo(sx, sy + r * .7); c.lineTo(sx - r * .35, sy + r * .35); c.closePath();
    c.fillStyle = '#fff'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#9aa6b8'; c.stroke();
    c.fillStyle = O; c.fillRect(sx - r * .35, sy - r * .2, r * .18, r * .3); c.fillRect(sx + r * .17, sy - r * .2, r * .18, r * .3);
  }
  // arrow: steckender Pfeil, Spitze rechts (Anker x = 1), Schaft nach links
  x = cx(F.arrow);
  c.lineCap = 'round'; c.strokeStyle = '#8a5a2b'; c.lineWidth = 9;
  c.beginPath(); c.moveTo(x - 27, cy); c.lineTo(x + 29, cy); c.stroke();
  c.strokeStyle = '#c9c2b2'; c.lineWidth = 6;
  c.beginPath(); c.moveTo(x - 27, cy - 8); c.lineTo(x - 18, cy); c.lineTo(x - 27, cy + 8); c.stroke();
}

export function createFx(renderer) {
  const L = renderer.layers;

  /* ---------- Atlas und Container ---------- */
  const acv = document.createElement('canvas');
  acv.width = STRIDE * N_FRAMES; acv.height = STRIDE;
  paintAtlas(acv.getContext('2d'));
  const base = new PIXI.BaseTexture(acv, { mipmap: PIXI.MIPMAP_MODES.OFF });
  const tex = FRAME_R.map((_, i) => new PIXI.Texture(base, new PIXI.Rectangle(i * STRIDE + 2, 2, CELL, CELL)));

  function makePC(layer, blend, name) {
    const pc = new PIXI.ParticleContainer(FX_CAP, PC_PROPS, FX_CAP);
    pc.blendMode = blend; pc.name = name;
    layer.addChild(pc);
    return { pc, arr: [], n: 0, blend };
  }
  const light = makePC(L.light, PIXI.BLEND_MODES.ADD, 'fxLight');
  const glow = makePC(L.fx, PIXI.BLEND_MODES.ADD, 'fxGlow');        // unter den Kernen: Kerne behalten ihre Farbe
  const main = makePC(L.fx, PIXI.BLEND_MODES.NORMAL, 'fxMain');

  function put(g, t, x, y, scale, rot, tint, alpha, ax) {
    let sp = g.arr[g.n];
    if (!sp) {
      if (g.arr.length >= FX_CAP) return;
      sp = new PIXI.Sprite(t); g.pc.addChild(sp); g.arr.push(sp);
    }
    g.n++;
    sp.texture = t; sp.anchor.set(ax, .5); sp.position.set(x, y); sp.rotation = rot;
    sp.scale.set(scale); sp.tint = tint; sp.alpha = alpha;
  }
  // ParticleContainer kennt kein visible: unbenutzte Sprites bekommen Größe und Deckkraft 0
  function finish(g) {
    for (let i = g.n; i < g.arr.length; i++) { const sp = g.arr[i]; if (sp.alpha !== 0) { sp.alpha = 0; sp.scale.set(0); } }
    const n = g.n; g.n = 0;
    return n;
  }

  /* ---------- Decals (Offscreen-Leinwand wie das Gelände, Upload gedrosselt) ---------- */
  const dcv = document.createElement('canvas'), dctx = dcv.getContext('2d');
  let res = 0, decalTex = null, decalDirty = false, decalForce = false, decalUpT = -1, decalCount = 0, decalUploads = 0;
  const decalSprite = new PIXI.Sprite();
  L.decals.addChild(decalSprite);

  function resize(W, H, r) {
    res = r;
    dcv.width = Math.ceil(W * res); dcv.height = Math.ceil(H * res);   // leert die Decals
    if (decalTex) decalTex.destroy(true);
    decalTex = PIXI.Texture.from(dcv);
    decalSprite.texture = decalTex; decalSprite.scale.set(1 / res);
    decalDirty = false; decalForce = false; decalCount = 0;
  }
  // Fleck: drei verschobene flache Ellipsen (wie im alten Spiel)
  function decal(x, y, r, col, a) {
    if (!res) return;
    const c = dctx; c.setTransform(res, 0, 0, res, 0, 0); c.globalAlpha = a; c.fillStyle = col;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(x + rnd(-r, r) * .5, y + rnd(-r, r) * .3, r * rnd(.4, .8), r * rnd(.22, .42), 0, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
    decalDirty = true; decalCount++;
  }
  // Krater (nur optisch, Spez. #12): dunkler, leicht unrunder Ring mit Deckkraft 0.1
  function crater(x, y, R) {
    if (!res || !(R > 0)) return;
    const c = dctx; c.setTransform(res, 0, 0, res, 0, 0);
    c.globalAlpha = .1; c.strokeStyle = O; c.lineWidth = Math.max(2, R * .2); c.lineJoin = 'round';
    const rx = R * .62, ry = R * .42, ph = Math.random() * TAU;
    c.beginPath();
    for (let i = 0; i <= 12; i++) {
      const a = i / 12 * TAU, k = 1 + .08 * Math.sin(a * 3 + ph);
      const px = x + Math.cos(a) * rx * k, py = y + Math.sin(a) * ry * k;
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.closePath(); c.stroke();
    c.globalAlpha = 1;
    decalDirty = true; decalCount++;
  }

  const core = createFxCore({ decal, crater });

  /* ---------- Bild ---------- */
  const LK = {}, off = { x: 0, y: 0 };
  let lastT = -1, nMain = 0, nGlow = 0, nLight = 0;
  function frame(t) {
    const dt = lastT < 0 || t < lastT ? 0 : Math.min(.1, t - lastT);
    lastT = t;
    core.decay(dt);   // Wackeln klingt je Sekunde ab, nicht je Bild
    if (decalTex && decalDirty && (decalForce || t - decalUpT >= DECAL_UPLOAD || t < decalUpT)) {
      decalTex.update(); decalUpT = t; decalDirty = false; decalForce = false; decalUploads++;
    }
    const live = core.store.live;
    for (let i = 0; i < live.length; i++) {
      look(live[i], LK);
      if (LK.alpha > .004) put(main, tex[LK.frame], LK.x, LK.y, Math.max(.001, LK.r) / FRAME_R[LK.frame], LK.rot, LK.tint, LK.alpha, LK.ax);
      if (LK.gAlpha > .004) put(LK.gLight ? light : glow, tex[F.soft], LK.x, LK.y, LK.gR / FRAME_R[F.soft], 0, LK.gTint, LK.gAlpha, .5);
    }
    nMain = finish(main); nGlow = finish(glow); nLight = finish(light);
    const s = RM ? 0 : core.shake;
    off.x = s ? (Math.random() - .5) * s : 0; off.y = s ? (Math.random() - .5) * s : 0;
    return off;
  }

  function clear() {
    core.clear();
    dctx.setTransform(1, 0, 0, 1, 0, 0); dctx.clearRect(0, 0, dcv.width, dcv.height);
    decalDirty = true; decalForce = true; decalCount = 0;
  }

  // Für Prüfungen (?debug: window.__kritzel.fx.debug()): lebende Partikel je Art, Sprites des letzten
  // Bilds je Container (main normal, glow/light additiv), Deckel, Budget-Auslassungen, Wackeln, Decals,
  // mittlere Rauchdrift seit Entstehung (dx ≈ +12·age, dy ≈ −20·age), Filter auf der Bühne (soll 0 sein).
  function debug() {
    const byKind = core.store.countByKind(), st = core.stats();
    let n = 0, dx = 0, dy = 0, age = 0;
    for (const p of core.store.live) if (p.k === 'smoke') { n++; dx += p.x - p.x0; dy += p.y - p.y0; age += p.age; }
    let filters = 0;
    for (let o = L.fx; o; o = o.parent) if (o.filters && o.filters.length) filters += o.filters.length;
    for (const k in L) if (L[k].filters && L[k].filters.length) filters += L[k].filters.length;
    const r2 = v => Math.round(v * 100) / 100;
    return {
      particles: core.store.count, cap: FX_CAP, byKind,
      sprites: { main: nMain, glow: nGlow, light: nLight },
      blend: { main: main.pc.blendMode, glow: glow.pc.blendMode, light: light.pc.blendMode },
      dropped: st.dropped, skipped: st.skipped, lights: st.lights,
      shake: r2(core.shake), decals: decalCount, decalUploads,
      smoke: n ? { n, dx: r2(dx / n), dy: r2(dy / n), age: r2(age / n) } : { n: 0 },
      filters,
    };
  }

  return {
    consume: core.consume, update: core.update, frame, resize, clear, debug,
    get shake() { return core.shake; },
    set shake(v) { core.shake = v; },
  };
}
