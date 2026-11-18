// PixiJS-Renderer (PIXI 7.4.2 als globales PIXI). Zeichnet die Welt im Kamera-Ausschnitt.
// Ebenen in Zeichenreihenfolge: terrain, decals, corpses, light, shadows, ground, projectiles, air, fx, overlay.
// Liest die Welt nur und zeichnet ihre Objekte. Effekte (Partikel, Decals, Bodenlicht, Wackeln) gehören
// fx.js: consume(events) reicht world.events weiter, renderer.fx ist die Effekt-Schnittstelle.
// Höhenachse: Bildschirm-y = y − z für Einheiten, Leichen, Teile, Brocken und Geschosse; Schatten bleiben
// am Boden (y) und werden mit der Höhe größer, blasser und weicher (pose.shadowParams, Spez. #14).
/* global PIXI */
import { TEAMS, CELL, UNITS, DOME } from '../data.js';
import { PHOENIX } from '../abilities.js';   // Task 6: Asche des Phönix
import { query, factionOf } from '../world.js';
import { DEBRIS_FADE } from '../physics.js';
import { bakeRigTextures, poseUnit, TEAM_INDEX, E, BOSS_GEO } from './rig.js';
import { shadowParams, corpseLook, projScreen, SHADOW_ALPHA, PRONE_DROP, PRONE_GUN, bossMemory, dragonHead, drawnMuzzle } from './pose.js';
import { bossMuzzle, TURN_SQUASH } from '../muzzle.js';
import { PRONE } from '../combat.js';
import { DODGE, DODGE_KINDS } from '../dodge.js';
import { createFx } from './fx.js';
import { createQuadBatch, newMat, mat, mul } from './quads.js';

const O = '#2a2a33';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const LAYERS = ['terrain', 'decals', 'corpses', 'light', 'shadows', 'ground', 'projectiles', 'air', 'fx', 'overlay'];
const MAX_TEX = 4096;
const TAU = Math.PI * 2;
// Zauberstab und Mörserrohr liegen wie in der alten Zeichnung hinter dem Körper (und damit unter dem Hut)
const BACK_WEAPON = new Set(['magier', 'moerser']);
const SHADOW_TINT = 0x282846;        // wie rgba(40,40,70) des Rig-Schattens
const HALF = { ax: .5, ay: .5 };

const colorCache = new Map();
function C(s) {
  if (typeof s === 'number') return s;
  let v = colorCache.get(s);
  if (v === undefined) { v = new PIXI.Color(s).toNumber(); colorCache.set(s, v); }
  return v;
}
function hh(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }

// Sprite-Pool: Sprites werden pro Bild in Zeichenreihenfolge neu vergeben.
function makePool(container) {
  const arr = [];
  let n = 0;
  return {
    next() {
      let s = arr[n];
      if (!s) { s = new PIXI.Sprite(); s.anchor.set(.5); container.addChild(s); arr.push(s); }
      s.visible = true; n++;
      return s;
    },
    finish() { for (let i = n; i < arr.length; i++) arr[i].visible = false; n = 0; },
  };
}

export function createRenderer(canvasHost) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let view = canvasHost.querySelector('canvas');
  if (!view) { view = document.createElement('canvas'); canvasHost.prepend(view); }
  const app = new PIXI.Application({
    view, width: Math.max(1, canvasHost.clientWidth), height: Math.max(1, canvasHost.clientHeight),
    background: 0xffffff, antialias: true, resolution: dpr, autoDensity: true, autoStart: false,
  });
  app.ticker.stop();

  const scene = new PIXI.Container();
  app.stage.addChild(scene);
  const L = {};
  for (const n of LAYERS) { L[n] = new PIXI.Container(); L[n].name = n; scene.addChild(L[n]); }
  // Spielfeld als weißes Blatt: passt die Welt nicht genau in die Ansicht (32:9, Hochformat; camera.worldSizeFor),
  // bleibt rundherum ein grauer Rand, damit man sieht, wo gemalt werden kann
  const paper = new PIXI.Graphics();
  scene.addChildAt(paper, 0); paper.visible = false;
  let paperW = 0, paperH = 0, edge = false;
  const EDGE_BG = 0xeceef4, PAPER_LINE = 0xd9dce6;
  const fx = createFx({ layers: L, app });   // Effekte: Decals, Bodenlicht, Partikel, Wackeln

  /* ---------- Gelände (Offscreen-Canvas, Code aus drawTerrain) ---------- */
  const zoneG = new PIXI.Graphics();
  const zoneText = new PIXI.Text('deine Seite', { fontFamily: 'Nunito, system-ui, sans-serif', fontWeight: '800', fontSize: 15, fill: 0x4d82f0 });
  zoneText.alpha = .8; zoneText.anchor.set(1, .75); zoneText.resolution = 3;
  // Schlacht-Modus (Spez. #45): Mittellinie mit den Seiten Blau (links) und Rot (rechts)
  const sideStyle = c => ({ fontFamily: 'Nunito, system-ui, sans-serif', fontWeight: '800', fontSize: 15, fill: c });
  const sideB = new PIXI.Text('Blau', sideStyle(0x3f7cff)), sideR = new PIXI.Text('Rot', sideStyle(0xff4d4d));
  sideB.alpha = sideR.alpha = .85; sideB.anchor.set(1, .75); sideR.anchor.set(0, .75); sideB.resolution = sideR.resolution = 3;
  const tcv = document.createElement('canvas'), tctx = tcv.getContext('2d');
  let terrTex = null;
  const terrSprite = new PIXI.Sprite();
  L.terrain.addChild(zoneG, zoneText, terrSprite);   // Zone liegt wie früher unter dem Gelände

  /* ---------- Wasser (Nachtrag 7, #48) ----------
     Wellen und Schaumrand als eine Fläche über dem Gelände (ein Draw-Call, nur wenn die Karte Wasser hat): ein
     Fragment-Shader liest eine Wassermaske mit einem Texel je Zelle (R = 255 für Wasser), linear gefiltert, also mit
     weichem Übergang an der Küste. Innen (Maske > .55) ziehen zwei gekreuzte, verbogene Sinuszüge langsam (etwa 14 px/s):
     helle, in Stücke gebrochene Kammlinien und zart dunklere Täler. Am Rand (Maske .08–.5, auf dem hellen Ufersaum des
     Geländes) liegt weißer Schaum, dessen Helligkeit als langsame Welle die Küste entlangläuft (kein Gesamtflackern),
     innen davon eine feine dunkle Linie (Sticker-Akzent #2a2a33). Die Maske folgt den Gelände-Änderungen (drawTerrain)
     und wird mit dem Gelände hochgeladen. Kein Filter, keine Maske im Szenengraph. */
  const WATER_VERT = `precision highp float;
attribute vec2 aVertexPosition;
uniform mat3 projectionMatrix;
uniform mat3 translationMatrix;
varying vec2 vP;
void main() { vP = aVertexPosition; gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0); }`;
  const WATER_FRAG = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vP;
uniform sampler2D uMask;
uniform vec2 uGrid;
uniform float uTime;
void main() {
  float m = texture2D(uMask, vP / uGrid).r;
  if (m < .04) discard;
  float t = uTime;
  vec2 p = vP;
  float w1 = sin(p.x * .085 + p.y * .03 - t * 1.2 + sin(p.y * .045 + t * .45) * 1.8);
  float w2 = sin(p.x * .035 - p.y * .07 - t * .9 + sin(p.x * .03 - t * .3) * 1.5);
  float w = w1 * .6 + w2 * .4;
  float brk = smoothstep(-.3, .45, sin(p.x * .021 + p.y * .017 + t * .15) + .45 * sin(p.y * .05 - p.x * .013));
  float crest = smoothstep(.62, .69, w) * (1. - smoothstep(.75, .84, w)) * brk;
  float trough = smoothstep(-.6, -.92, w1);
  float inside = smoothstep(.55, .9, m);
  float band = smoothstep(.08, .22, m) * (1. - smoothstep(.36, .52, m));
  float pulse = .6 + .4 * sin(t * 1.5 - (p.x + p.y) * .022);
  float line = smoothstep(.5, .56, m) * (1. - smoothstep(.58, .68, m));
  float a = trough * .08 * inside;
  vec3 c = vec3(.18, .45, .68) * a;
  float k = crest * .5 * inside; c = c * (1. - k) + vec3(.96, .99, 1.) * k; a += k * (1. - a);
  k = band * pulse * .78; c = c * (1. - k) + vec3(.97, .99, 1.) * k; a += k * (1. - a);
  k = line * .13; c = c * (1. - k) + vec3(.165, .165, .2) * k; a += k * (1. - a);
  gl_FragColor = vec4(c, a);
}`;
  const WATER_PERIOD = TAU / .15;
  let waterMesh = null, waterTex = null, waterData = null, waterAny = false, waterDirty = false;
  function makeWater() {
    if (waterMesh) { L.terrain.removeChild(waterMesh); waterMesh.destroy(); waterTex.destroy(true); }
    waterData = new Uint8Array(GW * GH * 4);
    waterTex = PIXI.Texture.fromBuffer(waterData, GW, GH, { scaleMode: PIXI.SCALE_MODES.LINEAR, mipmap: PIXI.MIPMAP_MODES.OFF, wrapMode: PIXI.WRAP_MODES.CLAMP });
    const W = GW * CELL, H = GH * CELL;
    const geo = new PIXI.Geometry().addAttribute('aVertexPosition', [0, 0, W, 0, W, H, 0, H], 2).addIndex([0, 1, 2, 0, 2, 3]);
    const sh = PIXI.Shader.from(WATER_VERT, WATER_FRAG, { uMask: waterTex, uGrid: new Float32Array([W, H]), uTime: 0 });
    waterMesh = new PIXI.Mesh(geo, sh); waterMesh.name = 'water'; waterMesh.visible = false;
    L.terrain.addChild(waterMesh);
  }
  // Maske im Gitterbereich neu (aus drawTerrain)
  function waterCells(terr, x0, y0, x1, y1) {
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
      const i = gy * GW + gx, v = terr[i] === 1 ? 255 : 0;
      waterData[i * 4] = v; waterData[i * 4 + 3] = 255;
    }
    waterDirty = true;
  }

  let rigs = null;           // gebackene Rig-Teile pro Typ (rig.js)
  let res = 0, worldW = 0, worldH = 0, GW = 0, GH = 0;
  // Neu zu zeichnende Gitterbereiche, einzeln (zwei Treffer weit auseinander ergeben kein Riesenrechteck).
  // CPU-Neuzeichnen sofort; GPU-Upload für Kampf-Änderungen höchstens alle TERR_UPLOAD s,
  // für Malen / komplettes Neuzeichnen sofort.
  const TERR_UPLOAD = .1, MAX_RECTS = 48;
  const dirtyRects = [];
  let terrChanged = false, terrForce = false, terrUpT = -1;

  function drawTerrain(world, x0, y0, x1, y1) {
    const { terr, whp } = world;
    x0 = clamp(x0, 0, GW - 1); x1 = clamp(x1, 0, GW - 1); y0 = clamp(y0, 0, GH - 1); y1 = clamp(y1, 0, GH - 1);
    const c = tctx; c.save(); c.setTransform(res, 0, 0, res, 0, 0);
    const px0 = x0 * CELL, py0 = y0 * CELL, pw = (x1 - x0 + 1) * CELL, ph = (y1 - y0 + 1) * CELL;
    c.beginPath(); c.rect(px0, py0, pw, ph); c.clip(); c.clearRect(px0, py0, pw, ph);
    const ax0 = Math.max(0, x0 - 2), ax1 = Math.min(GW - 1, x1 + 2), ay0 = Math.max(0, y0 - 2), ay1 = Math.min(GH - 1, y1 + 2);
    const layers = [[1, 9.5, '#a8e6f0'], [1, 7, '#62b9ea'], [2, 9.5, '#ffb54d'], [2, 7, '#f2652f'], [3, 9, '#b5dfae'], [4, 8.6, '#5b5f69'], [4, 7.3, '#a3a8b2']];
    for (const [id, rad, col] of layers) {
      c.fillStyle = col; c.beginPath(); let any = false;
      for (let gy = ay0; gy <= ay1; gy++) for (let gx = ax0; gx <= ax1; gx++) {
        if (terr[gy * GW + gx] !== id) continue;
        const cx = gx * CELL + 5, cy = gy * CELL + 5; c.moveTo(cx + rad, cy); c.arc(cx, cy, rad, 0, 6.2832); any = true;
      }
      if (any) c.fill();
    }
    for (let gy = ay0; gy <= ay1; gy++) for (let gx = ax0; gx <= ax1; gx++) {
      const i = gy * GW + gx, t = terr[i]; if (!t) continue;
      const cx = gx * CELL + 5, cy = gy * CELL + 5, h = hh(gx, gy);
      if (t === 1 && h < .05) { c.fillStyle = 'rgba(60,150,215,.35)'; c.beginPath(); c.ellipse(cx, cy, 14, 9, 0, 0, 7); c.fill(); }
      if (t === 2 && h < .1) { c.fillStyle = '#ffd36b'; c.beginPath(); c.arc(cx, cy, 2.4, 0, 7); c.fill(); }
      if (t === 3 && h < .16) { E(c, cx, cy, 8.5, 8, '#4e9f5d', 1.6, '#2f6b3b'); E(c, cx - 2.5, cy - 2.5, 3, 2.6, '#6dbd78', 0); }
      if (t === 4 && h < .3 && whp[i] >= 70) { c.fillStyle = '#8d929c'; c.beginPath(); c.ellipse(cx + (h - .15) * 14, cy + (h - .15) * 6, 3.4, 2.3, 0, 0, 7); c.fill(); }
      if (t === 4 && whp[i] < 70) { c.strokeStyle = '#3a3d45'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(cx - 4, cy - 3); c.lineTo(cx, cy + 1); c.lineTo(cx + 4, cy - 2); c.stroke(); }
    }
    c.restore();
    waterCells(terr, x0, y0, x1, y1);
    terrChanged = true;
  }

  // immediate=false: Änderung aus dem Kampf (world.events), Upload darf gedrosselt werden
  function markTerrainDirty(gx0, gy0, gx1, gy1, immediate = true) {
    if (immediate) terrForce = true;
    for (const r of dirtyRects) if (r.x0 <= gx0 && r.y0 <= gy0 && r.x1 >= gx1 && r.y1 >= gy1) return;
    if (dirtyRects.length >= MAX_RECTS) {
      const b = { x0: gx0, y0: gy0, x1: gx1, y1: gy1 };
      for (const r of dirtyRects) { b.x0 = Math.min(b.x0, r.x0); b.y0 = Math.min(b.y0, r.y0); b.x1 = Math.max(b.x1, r.x1); b.y1 = Math.max(b.y1, r.y1); }
      dirtyRects.length = 0; dirtyRects.push(b);
    } else dirtyRects.push({ x0: gx0, y0: gy0, x1: gx1, y1: gy1 });
  }

  // Größe von Welt oder Auflösung geändert: Gelände-Canvas und Decals neu anlegen
  function ensureWorld(world, cam) {
    const want = Math.min(2.5, Math.max(1, cam.fit * dpr * 2), MAX_TEX / world.W, MAX_TEX / world.H);
    // abrunden (nicht runden): W·res und H·res bleiben ≤ MAX_TEX, auch auf HiDPI-Bildschirmen
    const r = Math.max(.25, Math.floor(want * 4) / 4);
    if (world.W === worldW && world.H === worldH && world.GW === GW && world.GH === GH && r === res) return;
    worldW = world.W; worldH = world.H; GW = world.GW; GH = world.GH; res = r;
    tcv.width = Math.ceil(worldW * res); tcv.height = Math.ceil(worldH * res);
    if (terrTex) terrTex.destroy(true);
    terrTex = PIXI.Texture.from(tcv);
    terrSprite.texture = terrTex; terrSprite.scale.set(1 / res);
    makeWater();
    fx.resize(worldW, worldH, res);   // leert die Decals
    dirtyRects.length = 0; dirtyRects.push({ x0: 0, y0: 0, x1: GW - 1, y1: GH - 1 }); terrForce = true;
    const ur = clamp(Math.round(cam.fit * dpr * 2 * 2) / 2, 1, 4);
    if (!rigs || rigs.resolution !== ur) { if (rigs) rigs.destroy(); rigs = bakeRigTextures(app.renderer, ur); resetCorpseQuads(); }
  }

  /* ---------- Einheiten ----------
     Jede sichtbare Einheit bekommt pro Bild einen Container aus dem Pool (Reihenfolge = y-Sortierung)
     mit den Rig-Teilen body, pupilL, pupilR, lid, headgear, weapon. Der Schatten (mit Teamring) liegt
     in einer eigenen Ebene unter allen Körpern. Pro Bild werden nur Texturen, Anker, Lage, Drehung,
     Sichtbarkeit und tint gesetzt; die Pose kommt aus poseUnit() in ein wiederverwendetes Objekt. */
  // Task 13: alle Teile, Schatten und HP-Leisten liegen als flache Vierecke in QuadBatches (quads.js), die
  // Lage jedes Teils rechnet bodies() selbst nach (Matrizen wie die früheren Container und Sprites), in derselben
  // Zeichenreihenfolge wie vorher (Einheiten nach y, je Einheit die Teile in Rig-Reihenfolge).
  const shadowQ = createQuadBatch('shadowQuads'), links = createQuadBatch('shieldLinks');
  L.shadows.addChild(shadowQ, links);
  const groundQ = createQuadBatch('groundQuads'), groundBars = createQuadBatch('groundBars');
  L.ground.addChild(groundQ, groundBars);
  const airQ = createQuadBatch('airQuads'), airBars = createQuadBatch('airBars');
  L.air.addChild(airQ, airBars);
  const UM = newMat(), GM = newMat(), PM = newMat(), TM = newMat();   // Einheit, Gruppe, Teil, Hilfe
  // Fliegende Leichen, Teile und Brocken liegen über den Bodentruppen (eigene Sprites), ruhende in der
  // Ebene corpses (Leichen und Teile in der QuadBatch corpseQ, Brocken als Sprites darüber).
  const flySprites = new PIXI.Container(), projQ = createQuadBatch('projQuads');
  L.projectiles.addChild(flySprites, projQ);
  const flyPool = makePool(flySprites);
  const corpseRoot = new PIXI.Container(), debrisSprites = new PIXI.Container();
  L.corpses.addChild(corpseRoot, debrisSprites);
  const debrisPool = makePool(debrisSprites);

  /* ---------- Gebackene Hilfstexturen: Schattenstufen, Teamring, Steine ---------- */
  const canvasTex = (w, h, paint) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    paint(cv.getContext('2d')); return PIXI.Texture.from(cv);
  };
  // 3 Schattenstufen als weiße Kreise (BLOB px), per Skalierung zur Ellipse und per tint gefärbt:
  // scharf (gefüllt), weich (Rand läuft aus), sehr weich (von der Mitte an auslaufend)
  const BLOB = 64;
  const softTex = [0, 1, 2].map(level => canvasTex(BLOB, BLOB, c => {
    if (level === 0) c.fillStyle = '#fff';
    else {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 31);
      if (level === 1) { g.addColorStop(0, '#fff'); g.addColorStop(.5, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
      else { g.addColorStop(0, '#fff'); g.addColorStop(.35, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
      c.fillStyle = g;
    }
    c.beginPath(); c.arc(32, 32, 31, 0, TAU); c.fill();
  }));
  // Teamring der weichen Schatten (Flieger, Fliegende): Ellipse wie im Rig (1.12 r × 0.42 r, Strich 3) für r = 10
  const RING_RES = 4, RING_R = 10;
  const ringTex = canvasTex(Math.ceil((RING_R * 2.24 + 6) * RING_RES), Math.ceil((RING_R * .84 + 6) * RING_RES), c => {
    c.setTransform(RING_RES, 0, 0, RING_RES, c.canvas.width / 2, c.canvas.height / 2);
    c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.ellipse(0, 0, RING_R * 1.12, RING_R * .42, 0, 0, TAU); c.stroke();
  });
  // Zielkreis der Bomben, Mörsergranaten und Felsbrocken (Nachtrag 7, #47): flache Ellipse (TARGET_R × TARGET_R · .45) im
  // Sticker-Stil, dunkler Rand O mit hellem Innenstrich und vier kurzen Kerben; per tint gefärbt (der Rand bleibt dunkel)
  const TARGET_RES = 4, TARGET_R = 20, TARGET_SY = .45;
  const targetTex = canvasTex(Math.ceil((TARGET_R * 2 + 8) * TARGET_RES), Math.ceil((TARGET_R * 2 * TARGET_SY + 8) * TARGET_RES), c => {
    c.setTransform(TARGET_RES, 0, 0, TARGET_RES, c.canvas.width / 2, c.canvas.height / 2);
    c.lineCap = 'round';
    const ring = (w, col) => {
      c.strokeStyle = col; c.lineWidth = w;
      c.beginPath(); c.ellipse(0, 0, TARGET_R, TARGET_R * TARGET_SY, 0, 0, TAU); c.stroke();
      c.beginPath();
      for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ex = x * TARGET_R, ey = y * TARGET_R * TARGET_SY;
        c.moveTo(ex * .72, ey * .72); c.lineTo(ex * 1.12, ey * 1.12);
      }
      c.stroke();
    };
    ring(3, O); ring(1.3, '#fff');
  });
  const TARGET_TINT = 0xff8a7a;
  // Mauerbrocken: 3 kleine graue Steine (Radius 2.6–3.6 Welt-px)
  const STONE_RES = 4;
  const stoneTex = [2.6, 3.1, 3.6].map((r, k) => canvasTex(Math.ceil((r * 2 + 3) * STONE_RES), Math.ceil((r * 2 + 3) * STONE_RES), c => {
    c.setTransform(STONE_RES, 0, 0, STONE_RES, c.canvas.width / 2, c.canvas.height / 2);
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU, q = r * (.75 + .25 * hh(i + k * 7, k + 3));
      if (i) c.lineTo(Math.cos(a) * q, Math.sin(a) * q * .85); else c.moveTo(Math.cos(a) * q, Math.sin(a) * q * .85);
    }
    c.closePath(); c.fillStyle = k === 1 ? '#8d929c' : '#a3a8b2'; c.fill();
    c.lineWidth = 1; c.lineJoin = 'round'; c.strokeStyle = '#5b5f69'; c.stroke();
  }));
  // Schweißtropfen der Fliehenden (Spez. #27): hellblauer Tropfen mit Umriss und Glanzpunkt, DROP_H Welt-px hoch
  // (Spitze oben), Drehpunkt in der Mitte
  const DROP_RES = 4, DROP_H = 5;
  const dropTex = canvasTex(Math.ceil((DROP_H * .7 + 2) * DROP_RES), Math.ceil((DROP_H + 2) * DROP_RES), c => {
    c.setTransform(DROP_RES, 0, 0, DROP_RES, c.canvas.width / 2, c.canvas.height / 2);
    const h = DROP_H / 2, w = DROP_H * .33;
    c.beginPath(); c.moveTo(0, -h); c.quadraticCurveTo(w * .9, h * .05, w, h * .35); c.arc(0, h * .35, w, 0, Math.PI);
    c.quadraticCurveTo(-w * .9, h * .05, 0, -h); c.closePath();
    c.fillStyle = '#8fd3ff'; c.fill(); c.lineWidth = .8; c.lineJoin = 'round'; c.strokeStyle = O; c.stroke();
    c.beginPath(); c.ellipse(-w * .35, h * .3, w * .22, w * .32, 0, 0, TAU); c.fillStyle = '#fff'; c.fill();
  });
  // Tropfen der Höhe hgt an (x, y) in der Matrix P, rinnt über die Phase q (pose.sweat) um slide herab, blendet
  // am Anfang ein und am Ende aus
  function sweatDrop(Q, P, x, y, hgt, slide, q) {
    const a = q < .12 ? q / .12 : q > .75 ? (1 - q) / .25 : 1, k = hgt / DROP_H / DROP_RES;
    Q.addPart(dropTex, P, x, y + slide * q, 0, k, k, .5, .5, 0xffffff, a);
  }
  // Fledermausform des Vampirs (Spez. #32, abilities.stepBat): 5 bis 7 kleine Fledermäuse (BAT_W Welt-px Spannweite) im
  // Sticker-Stil, zwei Bilder (Flügel oben, unten), Drehpunkt in der Mitte. batSwarm setzt sie um die Lage der Einheit:
  // jede auf einer eigenen flachen Bahn (Radius BAT_ORBIT, gegeneinander versetzt), die um die Mitte kreist und auf und
  // ab flattert. Teamfarbe zeigt der Teamring am Boden (shadows). Beim Verwandeln (0 < batT < 1) blenden sie mit batT ein
  // bzw. aus, und der Körper schrumpft (bodies).
  const BAT_RES = 4, BAT_W = 9, BAT_ORBIT = 11, BAT_HZ = .35, BAT_FLAP = 9;
  const batTex = [0, 1].map(f => canvasTex(Math.ceil((BAT_W + 3) * BAT_RES), Math.ceil((BAT_W * .75 + 3) * BAT_RES), c => {
    c.setTransform(BAT_RES, 0, 0, BAT_RES, c.canvas.width / 2, c.canvas.height / 2);
    c.lineJoin = 'round'; c.lineCap = 'round';
    const h = BAT_W / 2, up = f === 0, ty = up ? -2.6 : 1.6;
    // Flügel: Haut mit drei Bögen am unteren Rand, links und rechts gespiegelt
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(0, -.6); c.quadraticCurveTo(s * h * .55, ty - .4, s * h, ty);
      c.quadraticCurveTo(s * h * .8, ty + 1.2, s * h * .62, ty + 1.1); c.quadraticCurveTo(s * h * .45, ty + 1.6, s * h * .3, ty + 1.3);
      c.quadraticCurveTo(s * h * .15, ty + 1.7, 0, .8); c.closePath();
      c.fillStyle = '#3d3150'; c.fill(); c.lineWidth = .7; c.strokeStyle = O; c.stroke();
    }
    // Körper mit Ohren, Glubschaugen
    c.beginPath(); c.moveTo(-.9, -1.1); c.lineTo(-.7, -2.1); c.lineTo(-.25, -1.3); c.lineTo(.25, -1.3); c.lineTo(.7, -2.1); c.lineTo(.9, -1.1); c.closePath();
    c.fillStyle = '#4a3c5e'; c.fill(); c.lineWidth = .6; c.strokeStyle = O; c.stroke();
    E(c, 0, 0, 1.25, 1.55, '#4a3c5e', .7);
    for (const s of [-1, 1]) { E(c, s * .48, -.45, .5, .55, '#fff', .45); E(c, s * .48 + .12, -.35, .24, .27, O, 0); }
  }));
  // Schwarm des Vampirs u in die QuadBatch Q (Welt-Koordinaten), Deckkraft a
  function batSwarm(Q, u, t, a) {
    const n = 5 + u.id % 3, cx = u.x, cy = u.y - u.z - 4, k = 1 / BAT_RES, dir = u.id % 2 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const q = u.seed + i * 2.399, ang = TAU * (BAT_HZ * t * dir) + q, rr = BAT_ORBIT * (.55 + .45 * ((i * .618) % 1));
      const x = cx + Math.cos(ang) * rr + (u.mx || 0) * .02 * i, y = cy + Math.sin(ang) * rr * .55 + Math.sin(BAT_FLAP * t + q * 3) * 2.2;
      const fr = ((t * BAT_FLAP * 1.6 + i * .5) | 0) % 2;
      Q.addPart(batTex[fr], null, x, y, Math.sin(t * 3 + q) * .25, k, k, .5, .5, 0xffffff, a);
    }
    stats.bats++;
  }
  // Task 6: Asche des Phönix (abilities.phoenixAsh): grauer Aschehaufen im Sticker-Stil (Umriss O) mit geschlossenen
  // Augen und Glutpunkten, darunter ein oranges Glühen, das bis zum Aufstehen wächst und flackert.
  const ASH_RES = 4, ASH_W = 18;
  const ashTex = canvasTex(Math.ceil((ASH_W + 4) * ASH_RES), Math.ceil((ASH_W * .7 + 4) * ASH_RES), c => {
    c.setTransform(ASH_RES, 0, 0, ASH_RES, c.canvas.width / 2, c.canvas.height / 2);
    c.lineJoin = 'round'; c.lineCap = 'round';
    const w = ASH_W / 2, h = ASH_W * .3;
    c.beginPath(); c.moveTo(-w, h * .6); c.quadraticCurveTo(-w * .75, -h * .8, -w * .15, -h * .95);
    c.quadraticCurveTo(w * .15, -h * 1.35, w * .4, -h * .75); c.quadraticCurveTo(w * .92, -h * .45, w, h * .6); c.closePath();
    c.fillStyle = '#5b5f69'; c.fill(); c.lineWidth = 1; c.strokeStyle = O; c.stroke();
    E(c, -w * .3, -h * .35, w * .28, h * .22, '#7d828c', 0);
    for (const [x, y] of [[-.5, .2], [.15, -.3], [.55, .25], [-.05, .35]]) E(c, x * w, y * h, 1.1, .9, '#ff8a3d', .5);
    for (const x of [-.18, .22]) { c.beginPath(); c.moveTo(x * w - 1.1, -h * .2); c.quadraticCurveTo(x * w, -h * .02, x * w + 1.1, -h * .2); c.lineWidth = .7; c.strokeStyle = O; c.stroke(); }
  });
  function ashPile(Q, u, t) {
    const q = 1 - Math.max(0, u.ashT) / PHOENIX.ASH_T, fl = .5 + .5 * Math.sin(t * 14 + u.seed * 3);
    const gr = (5 + 9 * q) * (.9 + .2 * fl) / 31;
    Q.addPart(softTex[1], null, u.x, u.y - u.z - 2, 0, gr, gr * .7, .5, .5, 0xff8a3d, .25 + .45 * q);
    const k = (.85 + .2 * q) / ASH_RES;
    Q.addPart(ashTex, null, u.x, u.y - u.z, 0, k, k, .5, .7, 0xffffff, 1);
  }
  // Stein je Brocken bleibt fest (die Liste wird verdichtet, Indizes wandern)
  const stoneOf = new WeakMap();
  let stoneNext = 0;

  const SH = {};   // Ergebnis von shadowParams, wiederverwendet
  // Schatten der Stufe SH.level als Ellipse rx × ry am Bodenpunkt (x, y)
  function blobShadow(x, y, rx, ry) {
    shadowQ.addPart(softTex[SH.level], null, x, y, 0, 2 * rx * SH.scale / BLOB, 2 * ry * SH.scale / BLOB, .5, .5, SHADOW_TINT, SH.alpha);
    stats.shadowLevels[SH.level]++;
  }

  const groundList = [], airList = [];
  const byY = (a, b) => a.y - b.y;
  const pose = {};   // wird für jede Einheit überschrieben (keine Allokation pro Bild)
  const stats = { drawn: 0, culled: 0, airUnits: 0, stunned: 0, bats: 0, stances: { stand: 0, down: 0, prone: 0, up: 0 }, corpses: 0, corpsesFlying: 0, parts: 0, partsFlying: 0,
    debris: 0, debrisFlying: 0, projShadows: 0, targets: 0, shadowLevels: [0, 0, 0] };
  const viewR = { x0: 0, y0: 0, x1: 0, y1: 0 };   // sichtbarer Weltausschnitt des Bilds (drawUnits)

  // Nächster verbundener Ritter (Schildwall) ohne Closure je Ritter und Bild
  let LK_W = null, LK_U = null, LK_F = null, LK_B = null, LK_D = 0;
  function linkTest(v) {
    const u = LK_U;
    if (v.id <= u.id || !v.wall || v.state !== 'ok' || !v.alive || factionOf(LK_W, v) !== LK_F) return;
    const e = (v.x - u.x) ** 2 + (v.y - u.y) ** 2; if (e < LK_D) { LK_D = e; LK_B = v; }
  }
  function drawUnits(world, cam, t) {
    const tm = world.teamMode;
    // Sichtbarer Weltausschnitt mit Rand für große Figuren, Balken und Krone
    // (unten mehr Rand: Körper werden bis gut 200 px über ihrem Bodenpunkt gezeichnet)
    // (seitlich 100: der Boss-Drache reicht mit Schweif und Flügeln gut 75 px über seinen Mittelpunkt hinaus)
    const vx0 = cam.x - 100, vy0 = cam.y - 80, vx1 = cam.x + cam.viewW / cam.zoom + 100, vy1 = cam.y + cam.viewH / cam.zoom + 220;
    viewR.x0 = vx0; viewR.y0 = vy0; viewR.x1 = vx1; viewR.y1 = vy1;
    groundList.length = 0; airList.length = 0;
    let top = null, culled = 0;
    const SC = stats.stances; SC.stand = SC.down = SC.prone = SC.up = 0;
    const hidden = overlay.hiddenTeam;   // Hotseat (Audit 18.11.): diese Seite nicht zeichnen (setOverlay)
    for (const u of world.units) {
      if (!u.alive) continue;
      if (hidden && u.team === hidden) continue;
      if (PRONE.has(u.type)) SC[u.stance]++;
      if (u.kills >= 3 && (!top || u.kills > top.kills)) top = u;
      if (u.x < vx0 || u.x > vx1 || u.y < vy0 || u.y > vy1) { culled++; continue; }
      (u.T.fly ? airList : groundList).push(u);
    }
    groundList.sort(byY); airList.sort(byY);
    stats.drawn = groundList.length + airList.length; stats.culled = culled; stats.airUnits = 0; stats.stunned = 0; stats.bats = 0;
    const inv = 1 / rigs.resolution;
    // Schatten und Teamringe liegen unter allen Körpern (shadowQ, danach Leichen, Brocken und Geschosse)
    stats.shadowLevels[0] = stats.shadowLevels[1] = stats.shadowLevels[2] = 0;
    shadows(groundList, tm, inv); shadows(airList, tm, inv);
    // Schildwall: verbundene Schilde sichtbar machen (nur stehende Ritter; geschleuderte und betäubte nicht)
    // (Striche als Vierecke mit geraden Enden, Breite 3, Deckkraft 0,5; vorher Graphics mit runden Enden)
    links.clear();
    for (const u of groundList) {
      if (!u.wall || u.state !== 'ok') continue;
      LK_W = world; LK_U = u; LK_F = factionOf(world, u); LK_B = null; LK_D = 42 * 42;
      query(world, u.x, u.y, 42, linkTest);
      const b = LK_B; LK_B = null; LK_U = null; LK_W = null;
      if (b) links.line(u.x + u.face * u.T.r * .8, u.y - u.z, b.x + b.face * b.T.r * .8, b.y - b.z, 3, tm ? C(TEAMS[u.team].c) : 0x6f7a8c, .5);
    }
    // Schrottplatz: Schildkuppel (Ring um die Kuppel-Einheit, blinkt bei Treffern) und Bot-Schild beim Treffer
    for (const u of groundList) {
      if (u.domeHp > 0) ring(u.x, u.y - 6, DOME.R, 18, 2.5, tm ? C(TEAMS[u.team].c) : 0x5fb8e8, .2 + .35 * u.domeHp / DOME.HP);
      if (u.shdHit > 0 && u.shd > 0) ring(u.x, u.y - u.z - u.T.r * .6, u.T.r * 1.25, 10, 2, 0x7fd8ff, .7 * Math.min(1, u.shdHit * 4));
    }
    nBoss = 0;
    bodies(groundList, groundQ, groundBars, t, tm, inv);
    bodies(airList, airQ, airBars, t, tm, inv);
    starPool.finish();
    drawCrown(top);
  }

  // Stufe 0 (am Boden): Rig-Schatten mit Teamring; höher: weicher Fleck plus Teamring in Teamfarbe
  function ring(x, y, R, n, w, tint, a) {
    let px = x + R, py = y;
    for (let i = 1; i <= n; i++) {
      const q = i / n * Math.PI * 2, nx = x + Math.cos(q) * R, ny = y + Math.sin(q) * R * .55;
      links.line(px, py, nx, ny, w, tint, a); px = nx; py = ny;
    }
  }
  // Urzeit: das T.-Rex-Ei hat ein eigenes Rig (u.type bleibt 'rex')
  const rigOf = u => rigs.get(u.T.egg ? 'rexei' : u.type);
  function shadows(list, tm, inv) {
    for (const u of list) {
      const rig = rigOf(u), r = rig.r, ti = tm ? TEAM_INDEX[u.team] || 0 : 0;
      shadowParams(u.z, SH);
      if (SH.level === 0) {
        const a = rig.anchors.shadow, k = inv * SH.scale;
        shadowQ.addPart(rig.tex.shadow[ti][0], null, u.x, u.y, 0, k, k, a.ax, a.ay, 0xffffff, SH.alpha / SHADOW_ALPHA);   // Textur trägt schon .13
        stats.shadowLevels[0]++;
        continue;
      }
      blobShadow(u.x, u.y + r * 1.05, r * .85, r * .28);
      if (ti) {
        const k = r / RING_R * SH.scale / RING_RES;
        shadowQ.addPart(ringTex, null, u.x, u.y + r, 0, k, k, .5, .5, C(TEAMS[u.team].c), SH.alpha / SHADOW_ALPHA);
      }
    }
  }

  // Teil eines Rigs (früher ein Sprite im Container der Einheit): Lage (x, y) im Rig, Anker a, Drehung rot,
  // Skalierung (sx, sy) (sonst 1/Auflösung), Elternmatrix P (Einheit oder Gruppe)
  function part(Q, P, tex, a, x, y, inv, rot = 0, tint = 0xffffff, alpha = 1, sx = inv, sy = inv) {
    Q.addPart(tex, P, x, y, rot, sx, sy, a.ax, a.ay, tint, alpha);
  }

  // Container-Transform (UM): Drehpunkt an den Füßen (Flieger: Körpermitte), damit Quetschen und Neigen
  // die Figur am Boden lassen; scale.x < 0 spiegelt nach links, die Neigung wirkt danach in Weltrichtung.
  // Höhe: gezeichnet bei y − z (Flieger in Flughöhe statt des alten Versatzes rig.offY). In der Luft dreht
  // sich die Figur um ihre Mitte (p.spin), betäubt taumelt sie um die Füße und zwei Sternchen kreisen.
  // Liegen (p.prone 0..1): platt um die Füße gestaucht (p.sx, p.sy), r · PRONE_DROP tiefer, um p.lie
  // vorgeneigt; die Waffe dreht um p.weaponLie zurück (flach nach vorn) und rückt nach vorn unten
  // (PRONE_GUN), der Rückstoß folgt ihrer Achse. Teile in Rig-Reihenfolge: Waffe hinten (BACK_WEAPON),
  // Körper, Pupillen, Lid (nur beim Blinzeln), Kopfbedeckung, Waffe vorn (Römer: Schild im Block zuletzt, vor
  // dem Körper; sonst als Erstes, seitlich hinter dem Körper).
  function bodies(list, Q, bars, t, tm, inv) {
    Q.clear(); bars.clear();
    for (const u of list) {
      if (u.ashT > 0) { ashPile(Q, u, t); continue; }   // Task 6: Asche statt Figur, ohne Leiste
      const T = u.T, rig = rigOf(u), p = poseUnit(u, t, pose, rig.boss ? memOf(u) : undefined);
      if (u.growT > 0 && !T.egg) { const g = T.r / UNITS[u.type].r; p.sx *= g; p.sy *= g; }   // Jungtier: kleiner gezeichnet
      // Vampir in Fledermausform (ganz: nur der Schwarm; beim Verwandeln schrumpft der Körper, der Schwarm blendet ein)
      if (u.batT > 0) {
        batSwarm(Q, u, t, u.batT);
        if (u.batT >= 1) { bar(bars, u, T, rig, u.y - u.z, 0); continue; }
        const k = 1 - .6 * u.batT; p.sx *= k; p.sy *= k;
      }
      const vi = tm && rig.teamed ? TEAM_INDEX[u.team] || 0 : 0, fr = p.frame, face = u.face < 0 ? -1 : 1;
      // Ausweich-Hüpfer (dodge.js): Figur auf einem flachen Bogen angehoben, der Schatten bleibt am Boden
      const A = rig.anchors, X = rig.tex, sy = u.y - u.z - (u.hopT > 0 ? Math.sin(Math.PI * u.hopT / DODGE.HOP_T) * DODGE.HOP_H : 0);
      const pr = p.prone;
      // Drehung wirkt nach der Spiegelung (Weltrichtung): spin > 0 dreht im Uhrzeigersinn (Flug nach rechts)
      const rot = p.tilt + p.spin + p.lie;
      if (p.air) { mat(UM, u.x, sy, rot, p.sx * face, p.sy); stats.airUnits++; }
      else mat(UM, u.x + face * rig.pivotX, sy + rig.pivotY + p.bob + pr * rig.r * PRONE_DROP, rot, p.sx * face, p.sy, rig.pivotX, rig.pivotY);
      if (p.dizzy && u.stunT > .05) {
        stats.stunned++;
        for (let i = 0; i < 2; i++) {
          const a = TAU * 1.6 * t + u.seed + i * Math.PI;
          const s = starPool.next();
          s.texture = softTex[0]; s.position.set(u.x + Math.cos(a) * T.r * .8, sy - T.r * 1.3 + Math.sin(a) * T.r * .25);
          s.rotation = 0; s.scale.set(1.5 / 31); s.tint = 0xffd84d; s.alpha = .95;
        }
      }
      if (rig.boss) {
        // Boss-Sticker: eigene Teile statt der normalen Rig-Teile
        drawBoss(Q, u, p, rig, vi, tm ? TEAM_INDEX[u.team] || 0 : 0, face, inv);
        bar(bars, u, T, rig, sy, 0);
        continue;
      }
      const back = rig.weapon && BACK_WEAPON.has(u.type);
      if (back) weaponPart(Q, rig, p, vi, pr, inv);
      // Römer ohne Block: Schild seitlich hinter dem Körper
      if (rig.shield && !p.shieldFront) shieldPart(Q, rig, p, vi, inv);
      let f = X.body[vi]; part(Q, UM, f[fr] || f[0], A.body, 0, 0, inv);
      if (rig.pupilL) {
        // Pupillen in Augenradien versetzt; lokal ungespiegelt, daher Blick-x mal Blickrichtung (Angst: kleiner)
        const e = rig.eyes, ox = p.lookX * face * rig.eyeR, oy = p.lookY * rig.eyeR, k = inv * p.pupil;
        part(Q, UM, rig.pupilL, A.pupilL, e.L[0] + ox, e.L[1] + oy, inv, 0, 0xffffff, 1, k, k);
        part(Q, UM, rig.pupilR, A.pupilR, e.R[0] + ox, e.R[1] + oy, inv, 0, 0xffffff, 1, k, k);
      }
      if (rig.lid && p.blink) part(Q, UM, rig.lid, A.lid, 0, 0, inv, 0, rig.lidTint[tm ? TEAM_INDEX[u.team] || 0 : 0]);
      if (rig.headgear) { f = X.headgear[vi]; part(Q, UM, f[fr] || f[0], A.headgear, 0, 0, inv); }
      // Angst (Flucht): hochgezogene Brauen über der Kopfbedeckung, Schweißtropfen am Hinterkopf
      if (p.fear) {
        if (rig.brow) part(Q, UM, rig.brow, A.brow, 0, 0, inv);
        sweatDrop(Q, UM, -rig.r * .85, -rig.r * .6, rig.r * .65, rig.r * .5, p.sweat);
      }
      if (rig.weapon && !back) weaponPart(Q, rig, p, vi, pr, inv);
      // Römer im Block: Schild vor dem Körper, über der Waffe
      if (rig.shield && p.shieldFront) shieldPart(Q, rig, p, vi, inv);
      bar(bars, u, T, rig, sy, pr);
    }
  }
  // Rückstoß entlang der Waffenachse nach hinten, Schwung um den Griff; Bild p.weaponFrame (Römer: Speer in
  // der Hand), beim Wurf um p.weaponLift · r angehoben
  function weaponPart(Q, rig, p, vi, pr, inv) {
    const a = rig.anchors.weapon, k = p.recoil, set = rig.tex.weapon[vi];
    const ax = rig.axis + p.weaponLie, gx = pr * PRONE_GUN[0] * rig.r, gy = pr * PRONE_GUN[1] * rig.r - p.weaponLift * rig.r;
    part(Q, UM, set[p.weaponFrame] || set[0], a, a.x + gx - Math.cos(ax) * k, a.y + gy - Math.sin(ax) * k, inv, p.weaponRot * rig.swing + p.weaponLie);
  }
  // Schild (Römer) um seine Mitte: Lage, Drehung und Breite aus der Pose (pose.SHIELD_FRONT / SHIELD_SIDE)
  function shieldPart(Q, rig, p, vi, inv) {
    part(Q, UM, rig.tex.shield[vi][0], rig.anchors.shield, p.shieldX * rig.r, p.shieldY * rig.r, inv, p.shieldRot, 0xffffff, 1, inv * p.shieldSx, inv);
  }

  // HP-Leiste über der Figur (rig.barTop: Oberkante der Zeichnung, Bosse höher und breiter); liegend tiefer
  function bar(bars, u, T, rig, sy, pr) {
    const H = u.frogFrom !== null ? UNITS[u.frogFrom].hp : T.hp;   // Task 6: der Frosch zeigt die LP seines alten Typs
    if (!(u.hp < H && H > 10)) return;
    const w = Math.max(12, rig.r * 1.6), y = sy + rig.barTop * (1 - .375 * pr) - 4;
    bars.rect(u.x - w / 2, y, w, 3, 0x2a2a33, .25);
    bars.rect(u.x - w / 2, y, w * Math.max(0, u.hp / H), 3, u.hp / H > .4 ? 0x2fbf6b : 0xe5574f, 1);
  }

  /* ---------- Boss-Sticker (Task 12c, Spez. #23) ----------
     Panzer, Hubschrauber, Drache: jedes Teil ist ein Quad in derselben QuadBatch wie die übrigen Einheiten
     (gleiche y-Sortierung wie alle), gesetzt mit bp() aus Atlas-Textur, Lage, Drehung und Spiegelung der
     Teilegruppe (Matrix P). Kein eigener Teilebaum, keine Pool-Container. Die Pose kommt aus poseUnit mit einem Gedächtnis je Einheit (memOf: Turm weich, Ketten-
     weg, Flügelphase, Heli-Neigung, Schweif); die Einheit selbst bleibt unberührt.
       Panzer: Wanne, Ketten (Bild = Kettenphase), Turmgruppe mit waagrechter Kuppel, waagrecht gespiegelt
               zur Seite des Ziels (Breite turretFlip, beim Umdrehen schmal und etwas höher), darin das Rohr
               um den Schildzapfen gedreht (turretRot, Rückstoß entlang des Rohrs), Turm, Augen
       Heli:   Rumpf (neigt sich um die Mündung, rig.pivotX/Y), Kanone, Heckrotor (tailRotor), Augen,
               Rotorgruppe am Mast (senkrecht gestaucht) mit Unschärfe-Scheibe, Nachzieh-Blatt und Blättern
     Die Mündungen (Rohrspitze, Kinnkanone, Maul) liegen damit dort, wo muzzle.tipOffset sie berechnet;
     von dort starten auch die Schüsse der Logik (muzzle.bossMuzzle in combat.fire/breath).
       Drache: hinterer Flügel (dunkler), Schweif (tailSwing), Rumpf, Hals, Kopfgruppe (headRot) mit Augen,
               vorderer Flügel; Flügelschlag aus wing = sin(2π·wingPhase) */
  const mems = new WeakMap();
  function memOf(u) { let m = mems.get(u); if (!m) { m = bossMemory(); mems.set(u, m); } return m; }
  const HD = {};   // dragonHead, wiederverwendet
  const WING_ROT = .55, WING_SQUASH = .18, FAR_WING = 0xa9b8b3, GHOST = .35;
  // Prüfwerte der zuletzt gezeichneten Bosse (debugRig().bosses), feste Objekte; tipM/tipLx/tipLy: Matrix
  // des Teils mit der Mündung und die Mündung darin (Sprite-Pixel ab Ursprung), für die Mündung aus den Teilen
  const BOSS_DBG = 24, bossDbg = [];
  for (let i = 0; i < BOSS_DBG; i++) bossDbg.push({ id: 0, type: '', turretFlip: 0, turretRot: 0, rotorRot: 0, tailRotor: 0, wingPhase: 0, tailSwing: 0, headRot: 0, track: 0, tilt: 0, recoil: 0, frame: 0,
    fireT: 0, drawn: { x: 0, y: 0 }, logic: { x: 0, y: 0 }, hasLogic: false, tipM: newMat(), hasTip: false, tipLx: 0, tipLy: 0 });
  let nBoss = 0;

  // Boss-Teil name aus dem Atlas (Teamvariante nur bei Team-Teilen), Bild f, an (x, y) in der Gruppe P,
  // gedreht um rot; Skalierung (sx, sy) sonst 1/Auflösung.
  function bp(Q, P, rig, name, vi, f, x, y, rot, inv, sx = inv, sy = inv, tint = 0xffffff, alpha = 1) {
    const set = rig.tex[name], v = set[vi] || set[0];
    part(Q, P, v[f] || v[0], rig.anchors[name], x, y, inv, rot, tint, alpha, sx, sy);
  }
  // Augen in einer Gruppe P, die lokal um rot gedreht und um fx (waagrecht) gespiegelt ist: der Blick
  // (Weltrichtung lookX/lookY) wird in die Gruppe zurückgerechnet
  function bossEyes(Q, P, rig, p, face, rot, fx, ti, inv) {
    const lx = p.lookX * face, ly = p.lookY, c = Math.cos(rot), s = Math.sin(rot), e = rig.eyes, A = rig.anchors;
    const ox = (lx * c + ly * s) * fx * rig.eyeR, oy = (-lx * s + ly * c) * rig.eyeR, k = inv * p.pupil;
    part(Q, P, rig.pupilL, A.pupilL, e.L[0] + ox, e.L[1] + oy, inv, 0, 0xffffff, 1, k, k);
    part(Q, P, rig.pupilR, A.pupilR, e.R[0] + ox, e.R[1] + oy, inv, 0, 0xffffff, 1, k, k);
    if (p.blink) part(Q, P, rig.lid, A.lid, 0, 0, inv, 0, rig.lidTint[ti]);
    // Angst (Flucht): nur kleine Pupillen und ein Schweißtropfen neben dem hinteren Auge, keine Brauen
    if (p.fear) sweatDrop(Q, P, e.L[0] - rig.eyeR * 1.6, e.L[1] - rig.eyeR * .5, rig.eyeR * 1.4, rig.eyeR * 1.2, p.sweat);
  }
  // Teile von hinten nach vorn: Panzer Wanne, Ketten, Turmgruppe (Rohr,
  // Turm, Augen); Heli Rumpf, Kanone, Heckrotor, Augen, Rotorgruppe (Scheibe, Nachzieh-Blatt, Blätter);
  // Drache hinterer Flügel, Schweif, Rumpf, Hals, Kopfgruppe (Kopf, Augen), vorderer Flügel.
  function drawBoss(Q, u, p, rig, vi, ti, face, inv) {
    if (u.type === 'elefant') { drawElephant(Q, p, rig, vi, ti, face, inv); return; }   // Task 5
    const type = u.type, R = rig.r, d = nBoss < BOSS_DBG ? bossDbg[nBoss++] : null;
    let tlx = 0, tly = 0;
    // Matrix des Mündungsteils (Eltern P, Lage, Drehung, Maßstab inv) für debugRig
    const tip = (P, x, y, rot, s) => { if (d) { mul(d.tipM, P, mat(PM, x, y, rot, s, s)); d.hasTip = true; } };
    if (type === 'panzer') {
      const G = BOSS_GEO.panzer;
      bp(Q, UM, rig, 'body', vi, 0, 0, 0, 0, inv);
      bp(Q, UM, rig, 'treads', 0, p.frame, 0, 0, 0, inv);
      // Turm: Kuppel bleibt waagrecht, Breite = Seite des Ziels (lokal turretFlip · face), beim Umdrehen
      // schmal und etwas höher; Rohr um den Schildzapfen um turretRot, Rückstoß entlang des Rohrs
      const fl = p.turretFlip * face, e = p.turretRot, ce = Math.cos(e), se = Math.sin(e);
      mul(GM, UM, mat(GM, G.turret[0] * R, G.turret[1] * R, 0, fl, 1 + TURN_SQUASH * (1 - Math.abs(p.turretFlip))));
      const wx = G.trunnion[0] * R - p.recoil * ce, wy = G.trunnion[1] * R - p.recoil * se;
      bp(Q, GM, rig, 'weapon', vi, 0, wx, wy, e, inv); tip(GM, wx, wy, e, inv);
      bp(Q, GM, rig, 'turret', vi, 0, 0, 0, 0, inv);
      bossEyes(Q, GM, rig, p, face, 0, fl < 0 ? -1 : 1, ti, inv);
      tlx = (G.tip[0] - G.trunnion[0]) * R; tly = (G.tip[1] - G.trunnion[1]) * R;
    } else if (type === 'heli') {
      const G = BOSS_GEO.heli;
      bp(Q, UM, rig, 'body', vi, 0, 0, 0, 0, inv);
      bp(Q, UM, rig, 'weapon', vi, 0, G.gun[0] * R - p.recoil * .6, G.gun[1] * R, 0, inv); tip(UM, G.gun[0] * R - p.recoil * .6, G.gun[1] * R, 0, inv);
      bp(Q, UM, rig, 'tailRotor', 0, 0, G.tailRotor[0] * R, G.tailRotor[1] * R, p.tailRotor, inv);
      bossEyes(Q, UM, rig, p, face, 0, 1, ti, inv);
      mul(GM, UM, mat(GM, G.mast[0] * R, G.mast[1] * R, 0, 1, G.rotorFlat));
      bp(Q, GM, rig, 'rotorDisc', 0, 0, 0, 0, 0, inv);
      bp(Q, GM, rig, 'rotorBlades', 0, 0, 0, 0, p.rotorRot - GHOST, inv, inv, inv, 0xffffff, .3);
      bp(Q, GM, rig, 'rotorBlades', 0, 0, 0, 0, p.rotorRot, inv);
      tlx = G.gunTip[0] * R; tly = G.gunTip[1] * R;
    } else {
      const G = BOSS_GEO.drache, w = p.wing;
      bp(Q, UM, rig, 'wing', 0, 0, G.wingB[0] * R, G.wingB[1] * R, WING_ROT * w + .08, inv, inv * .9, inv * .9 * (1 - WING_SQUASH * w), FAR_WING);
      bp(Q, UM, rig, 'tail', 0, 0, G.tail[0] * R, G.tail[1] * R, p.tailSwing, inv);
      bp(Q, UM, rig, 'body', 0, 0, 0, 0, 0, inv);
      dragonHead(p.headRot, HD);
      bp(Q, UM, rig, 'neck', 0, 0, G.neck[0] * R, G.neck[1] * R, HD.na, inv);
      mul(GM, UM, mat(GM, HD.jx * R, HD.jy * R, p.headRot, 1, 1));
      bp(Q, GM, rig, 'head', 0, 0, 0, 0, 0, inv); tip(GM, 0, 0, 0, inv);
      bossEyes(Q, GM, rig, p, face, p.headRot, 1, ti, inv);
      bp(Q, UM, rig, 'wing', 0, 0, G.wingF[0] * R, G.wingF[1] * R, WING_ROT * w - .1, inv, inv, inv * (1 - WING_SQUASH * w));
      tlx = G.mouth[0] * R; tly = G.mouth[1] * R;
    }
    if (d) {
      d.id = u.id; d.type = type; d.turretFlip = p.turretFlip; d.turretRot = p.turretRot; d.rotorRot = p.rotorRot; d.tailRotor = p.tailRotor;
      d.wingPhase = p.wingPhase; d.tailSwing = p.tailSwing; d.headRot = p.headRot; d.track = p.track;
      d.tilt = p.tilt; d.recoil = p.recoil; d.frame = p.frame; d.fireT = u.fireT;
      // Mündung: aus der Pose gerechnet (drawn), wie die Logik jetzt schießen würde (logic), Teil (debugRig)
      drawnMuzzle(u, p, d.drawn);
      d.hasLogic = !!u.tg;
      if (u.tg) { bossMuzzle(u, u.tg.x, u.tg.y, d.logic); d.logic.x += u.x; d.logic.y += u.y - (u.z || 0); }
      d.tipLx = tlx * rigs.resolution; d.tipLy = tly * rigs.resolution;
    }
  }

  // --- Task 5: Elefant (Boss-Sticker, rig.ELE_GEO) --- Körper (Bild = Schritt), Decke in Teamfarbe, Kopfgruppe am
  // Hals (nickt um headRot) mit Kopf, Ohr (wedelt mit wing: dreht und wird schmaler), Rüssel (tailSwing) und Augen
  function drawElephant(Q, p, rig, vi, ti, face, inv) {
    const G = BOSS_GEO.elefant, R = rig.r, w = p.wing;
    bp(Q, UM, rig, 'body', 0, p.frame, 0, 0, 0, inv);
    bp(Q, UM, rig, 'blanket', vi, 0, 0, 0, 0, inv);
    mul(GM, UM, mat(GM, G.head[0] * R, G.head[1] * R, p.headRot, 1, 1));
    bp(Q, GM, rig, 'head', 0, 0, 0, 0, 0, inv);
    bp(Q, GM, rig, 'ear', 0, 0, G.ear[0] * R, G.ear[1] * R, .1 * w, inv, inv * (1 - .14 * (1 + w) / 2), inv);
    bp(Q, GM, rig, 'trunk', 0, 0, G.trunk[0] * R, G.trunk[1] * R, p.tailSwing, inv);
    bossEyes(Q, GM, rig, p, face, p.headRot, 1, ti, inv);
  }

  // Heldenkrone über der lebenden Einheit mit den meisten Siegen (ab 3)
  const crownG = new PIXI.Graphics();
  const crownT = new PIXI.Text('', { fontFamily: 'Nunito, system-ui, sans-serif', fontWeight: '800', fontSize: 11, fill: O, stroke: '#ffffff', strokeThickness: 3 });
  crownT.anchor.set(0, .8); crownT.resolution = 4;
  function drawCrown(top) {
    crownG.clear();
    crownT.visible = !!top;
    if (!top) return;
    const x = top.x, y = top.y - top.z + rigs.get(top.type).crownTop - 14;
    crownG.lineStyle({ width: 1.3, color: C(O), join: PIXI.LINE_JOIN.ROUND }).beginFill(0xffc533);
    crownG.drawPolygon([x - 7, y + 5, x - 8.5, y - 4, x - 3.5, y, x, y - 6, x + 3.5, y, x + 8.5, y - 4, x + 7, y + 5]);
    crownG.endFill();
    const s = String(top.kills);
    if (crownT.text !== s) crownT.text = s;
    crownT.position.set(x + 11, y + 5);
  }

  /* ---------- Leichen, Teile, Brocken ----------
     Ruhende Leichen und Teile (auch rutschende mit z = 0) sind Quads in der QuadBatch corpseQ in der Ebene
     corpses, jedes Bild neu in Listenreihenfolge gefüllt (Task 13). Fliegende (state 'fly' mit z > 0 oder
     Steigen) sind normale Sprites über den Bodentruppen und werfen einen Schatten. Aussehen aus
     pose.corpseLook: liegend flach (.55) und grau getönt, fade → Deckkraft, float wippt, sink und ash verblassen. */
  // Ruhende Leichen und Teile: eine QuadBatch, in Listenreihenfolge
  const corpseQ = createQuadBatch('corpseQuads');
  corpseRoot.addChild(corpseQ);
  function resetCorpseQuads() { corpseQ.clear(); }

  const LK = {};   // Ergebnis von corpseLook, wiederverwendet
  function drawCorpses(world, t, tm, inv) {
    let nb = 0, nbf = 0, np = 0, npf = 0;
    const list = world.corpses, V = viewR;
    corpseQ.clear();
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.x < V.x0 || c.x > V.x1 || c.y < V.y0 || c.y > V.y1) continue;
      const rig = rigs.get(c.type); if (!rig) continue;
      const body = c.kind === 'body';
      // Teile: Kopfbedeckung bzw. Waffen-Teil des Rigs (Schild des Ritters), eigenes Rig-Teil gleichen Namens
      // (Schild des Römers); Bosse über rig.partMap (Panzerturm mit Rohr, Heli-Rotor), die liegende Leiche aus
      // rig.corpseBody (Drache: ganze Figur)
      const name = body ? rig.corpseBody : (rig.partMap && rig.partMap[c.part]) || (c.part === 'headgear' ? 'headgear' : c.part === 'shield' && rig.shield ? 'shield' : 'weapon');
      const set = rig.tex[name];
      if (!set) continue;
      const vi = tm && rig.teamed ? TEAM_INDEX[c.team] || 0 : 0, tex = (set[vi] || set[0])[0];
      corpseLook(c, t, LK);
      if (LK.alpha <= .01) continue;
      const flying = c.state === 'fly' && (c.z > .5 || c.vz > 0);
      const a = body ? rig.anchors[name] : HALF;
      if (!flying) corpseQ.addPart(tex, null, c.x, c.y - c.z + LK.dy, LK.rot, c.face < 0 ? -inv : inv, inv * LK.sy, a.ax, a.ay, LK.tint, LK.alpha);
      else {
        const sp = flyPool.next();
        sp.texture = tex; sp.anchor.set(a.ax, a.ay);
        sp.position.set(c.x, c.y - c.z + LK.dy); sp.rotation = LK.rot;
        sp.scale.set(c.face < 0 ? -inv : inv, inv * LK.sy); sp.tint = LK.tint; sp.alpha = LK.alpha;
        const r = rig.r;
        shadowParams(c.z, SH);
        if (body) blobShadow(c.x, c.y + r * 1.05, r * .85, r * .28); else blobShadow(c.x, c.y, r * .45, r * .18);
      }
      if (body) { if (flying) nbf++; else nb++; } else if (flying) npf++; else np++;
    }
    stats.corpses = nb; stats.corpsesFlying = nbf; stats.parts = np; stats.partsFlying = npf;
  }

  function drawDebris(world) {
    let n = 0, nf = 0;
    const list = world.debris, V = viewR, inv = 1 / STONE_RES;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d.x < V.x0 || d.x > V.x1 || d.y < V.y0 || d.y > V.y1) continue;
      let k = stoneOf.get(d);
      if (k === undefined) { k = stoneNext++ % 3; stoneOf.set(d, k); }
      const flying = !d.rest && (d.z > .5 || d.vz > 0);
      const sp = flying ? flyPool.next() : debrisPool.next();
      sp.texture = stoneTex[k]; sp.anchor.set(.5); sp.position.set(d.x, d.y - d.z); sp.rotation = d.rot;
      sp.scale.set(inv); sp.tint = 0xffffff; sp.alpha = d.fade > 0 ? Math.min(1, d.fade / DEBRIS_FADE) : 1;
      if (flying) { shadowParams(d.z, SH); blobShadow(d.x, d.y + 1, 3, 1.2); nf++; } else n++;
    }
    debrisPool.finish();
    stats.debris = n; stats.debrisFlying = nf;
  }

  /* ---------- Geschosse ----------
     Lage auf dem Bildschirm (y − z) und Flugwinkel aus pose.projScreen; Bögen werfen einen Schatten am
     Bodenpunkt ihrer Bahn, der mit der Höhe kleiner und weicher wird. */
  const PS = {};
  const PROJ_SHADOW = { arrow: 3, firearrow: 3, pilum: 5, bomb: 4, mortar: 4.5, shell: 3.5 };
  PROJ_SHADOW.boulder = 5.5;   // Task 6
  // Gezeichnet aus Strichen (weiße Textur, gedreht) und Scheiben (softTex[0], Radius 31 px) in projQ wie
  // früher mit Graphics: Pfeil, Speer, Bombe/Mörser (Rand O + Füllung, Bombe mit Lunte), Kugel, Rakete, Granate, Feuerball
  function disc(x, y, r, col) { projQ.addPart(softTex[0], null, x, y, 0, r / 31, r / 31, .5, .5, col, 1); }
  function drawProjectiles(world) {
    projQ.clear();
    let ns = 0, nt = 0;
    const OC = C(O);
    for (const p of world.proj) {
      projScreen(p, PS);
      const x = PS.x, y = PS.y, ca = Math.cos(PS.a), sa = Math.sin(PS.a);
      if (p.arc) {
        const q = p.t < p.dur ? p.t / p.dur : 1, rx = PROJ_SHADOW[p.kind] || 3;
        // Zielkreis am Einschlagpunkt (Nachtrag 7, #47): blendet über den Flug ruhig ein und zieht sich leicht zusammen
        if (DODGE_KINDS.has(p.kind) && p.R > 0) {
          const k = Math.min(18, p.R * .45) * (1.12 - .12 * q) / TARGET_R / TARGET_RES, a = .3 + .5 * Math.min(1, q * 1.6);
          shadowQ.addPart(targetTex, null, p.x1, p.y1, 0, k, k, .5, .5, TARGET_TINT, a); nt++;
        }
        shadowParams(p.z, SH);
        blobShadow(p.x0 + (p.x1 - p.x0) * q, p.y0 + (p.y1 - p.y0) * q, rx, rx * .4); ns++;
      }
      if (p.kind === 'arrow') projQ.line(x - ca * 5, y - sa * 5, x + ca * 5, y + sa * 5, 1.5, 0x8a5a2b);
      else if (p.kind === 'firearrow') {
        // Brandpfeil: Pfeil mit glühender Spitze (die Flammenspur kommt aus fxcore.update)
        projQ.line(x - ca * 5, y - sa * 5, x + ca * 5, y + sa * 5, 1.5, 0x8a5a2b);
        disc(x + ca * 5, y + sa * 5, 2.6, 0xff8a3d); disc(x + ca * 5, y + sa * 5, 1.4, 0xffe066);
      }
      else if (p.kind === 'pilum') {
        // Römerspeer: dünner Holzschaft, langer Eisenschaft und helle Spitze, mit Umriss; entlang der Bahn
        // geneigt wie der Pfeil, aber fast doppelt so lang
        projQ.line(x - ca * 9.6, y - sa * 9.6, x + ca * 9.6, y + sa * 9.6, 2.8, OC);
        projQ.line(x - ca * 9, y - sa * 9, x + ca * 1.5, y + sa * 1.5, 1.3, 0xc9a26b);
        projQ.line(x + ca * 1.5, y + sa * 1.5, x + ca * 7, y + sa * 7, 1, 0x9aa3ae);
        projQ.line(x + ca * 6.6, y + sa * 6.6, x + ca * 9.2, y + sa * 9.2, 1.7, 0xe6ebf0);
      }
      else if (p.kind === 'bomb' || p.kind === 'mortar') {
        disc(x, y, 4.5, OC); disc(x, y, 3.5, 0x2f3340);
        if (p.kind === 'bomb') disc(x + 2, y - 4, 1.6, 0xffb800);
      } else if (p.kind === 'bullet') projQ.line(x - ca * 7, y - sa * 7, x + ca * 3, y + sa * 3, 1.6, 0xe0a020);
      else if (p.kind === 'rocket') {
        disc(x - ca * 6, y - sa * 6, 3, 0xff8a3d);
        projQ.line(x - ca * 4, y - sa * 4, x + ca * 4, y + sa * 4, 3.4, OC);
      } else if (p.kind === 'shell') disc(x, y, 3.2, 0x2f3340);
      // Task 6: Felsbrocken des Zyklopen (grauer Stein mit Umriss und Glanz), Hexenzauber (grüne Kugel mit hellem Kern)
      else if (p.kind === 'boulder') { disc(x, y, 5.6, OC); disc(x, y, 4.5, 0x9aa0aa); disc(x - 1.4, y - 1.5, 1.6, 0xc3c8cf); }
      else if (p.kind === 'hex') { disc(x, y, 4.4, 0x3f9a4a); disc(x, y, 2.9, 0x9df58a); disc(x, y, 1.3, 0xeaffd8); }
      else { disc(x, y, 6, 0xff8a3d); disc(x, y, 3.5, 0xffe066); }
    }
    stats.projShadows = ns; stats.targets = nt;
  }

  // Sternchen über betäubten Figuren (Zustand der Welt, kein Effekt aus Ereignissen): Scheiben aus softTex[0]
  const starSprites = new PIXI.Container();
  L.fx.addChild(starSprites);
  const starPool = makePool(starSprites);

  /* ---------- Ereignisse ----------
     Gelände-Änderungen aus dem Kampf markieren das Gelände (Upload gedrosselt); alles andere sind Effekte. */
  function consume(events) {
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.type === 'terrain' && e.kind !== 'ash') markTerrainDirty(e.gx0, e.gy0, e.gx1, e.gy1, false);
    }
    fx.consume(events);
  }


  /* ---------- Overlay: Pinsel und Missionszone ---------- */
  const overlay = { brushX: 0, brushY: 0, brushR: 0, erase: false, missionZoneX: null, battleMidX: null };
  const overG = new PIXI.Graphics();
  L.overlay.addChild(sideB, sideR, crownG, crownT, overG);   // Seitennamen der Schlacht über dem Gelände
  function setOverlay(o) { Object.assign(overlay, o); }

  function drawOverlay(world) {
    zoneG.clear();
    const zx = overlay.missionZoneX;
    zoneText.visible = zx != null;
    if (zx != null) {
      zoneG.lineStyle(0).beginFill(0x4d82f0, .05).drawRect(0, 0, zx, world.H).endFill();
      zoneG.lineStyle(2, 0x4d82f0, .55);
      for (let y = 0; y < world.H; y += 20) zoneG.moveTo(zx, y).lineTo(zx, Math.min(world.H, y + 10));
      zoneText.position.set(zx - 10, world.H * .5 + 5);
    }
    const mx = overlay.battleMidX;
    sideB.visible = sideR.visible = mx != null;
    if (mx != null) {
      zoneG.lineStyle(0).beginFill(0x3f7cff, .04).drawRect(0, 0, mx, world.H).endFill();
      zoneG.beginFill(0xff4d4d, .04).drawRect(mx, 0, world.W - mx, world.H).endFill();
      zoneG.lineStyle(2, 0x2a2a33, .4);
      for (let y = 0; y < world.H; y += 20) zoneG.moveTo(mx, y).lineTo(mx, Math.min(world.H, y + 10));
      sideB.position.set(mx - 10, world.H * .5 + 5); sideR.position.set(mx + 10, world.H * .5 + 5);
    }
    // Reichweiten der Gegner in der Planung (Audit 18.11.): { x, y, r } je Fernkämpfer, blass rot
    const rg = overlay.ranges;
    if (rg && rg.length) {
      zoneG.lineStyle(1.2, 0xe5574f, .28);
      for (const c of rg) zoneG.beginFill(0xff4d4d, .025).drawCircle(c.x, c.y, c.r).endFill();
    }
    overG.clear();
    if (overlay.brushR > 0) {
      const er = overlay.erase;
      overG.lineStyle(1.6, er ? 0xff6f91 : 0x4d82f0).beginFill(er ? 0xff7896 : 0x4d82f0, er ? .10 : .07)
        .drawCircle(overlay.brushX, overlay.brushY, overlay.brushR).endFill();
    }
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { zoneText.dirty = true; sideB.dirty = true; sideR.dirty = true; crownT.dirty = true; }).catch(() => {});

  /* ---------- Bild ---------- */
  // draw = prepare (Szene setzen, JS) + present (PIXI zeichnet); getrennt für __bench.measure
  function draw(world, cam, t) { prepare(world, cam, t); present(); }
  function present() { app.renderer.render(app.stage); }
  // Wartet, bis die GPU fertig ist (nur für Messungen)
  function gpuFinish() { const gl = app.renderer.gl; if (gl) gl.finish(); }
  // Anzeigeobjekte je Ebene (alle Nachfahren, auch unsichtbare) und davon sichtbare (für Messungen)
  function countObjects() {
    const all = {}, vis = {};
    const walk = (o, v, k) => {
      for (const c of o.children || []) { all[k]++; const cv = v && c.visible !== false; if (cv) vis[k]++; walk(c, cv, k); }
    };
    for (const k of LAYERS) { all[k] = 0; vis[k] = 0; walk(L[k], L[k].visible, k); }
    return { all, visible: vis };
  }
  // ms je Teil von prepare im letzten Bild (für __bench.measure)
  const prepMs = { terrain: 0, units: 0, corpses: 0, proj: 0, fx: 0 };
  function prepare(world, cam, t) {
    let t0 = performance.now(), t1;
    const lap = k => { t1 = performance.now(); prepMs[k] = t1 - t0; t0 = t1; };
    ensureWorld(world, cam);
    for (const r of dirtyRects) drawTerrain(world, r.x0, r.y0, r.x1, r.y1);
    dirtyRects.length = 0;
    if (terrChanged && (terrForce || t - terrUpT >= TERR_UPLOAD || t < terrUpT)) {
      terrTex.update(); terrUpT = t; terrChanged = false; terrForce = false;
      if (waterDirty) { waterTex.baseTexture.update(); waterDirty = false; waterAny = world.terr.indexOf(1) >= 0; }
    }
    waterMesh.visible = waterAny;
    // alle Zeitfaktoren im Shader sind Vielfache von .15: Periode 2π / .15 s, nahtlos
    if (waterAny) waterMesh.shader.uniforms.uTime = t % WATER_PERIOD;
    drawOverlay(world);
    shadowQ.clear();
    lap('terrain');
    drawUnits(world, cam, t);
    lap('units');
    const inv = 1 / rigs.resolution;
    drawCorpses(world, t, world.teamMode, inv);
    drawDebris(world);
    lap('corpses');
    drawProjectiles(world);
    flyPool.finish();
    lap('proj');
    const off = fx.frame(t, world.time);   // Partikel, Decal-Upload, Wackeln (Echtzeit); Decals altern mit der Spielzeit
    scene.scale.set(cam.zoom);
    scene.position.set((off.x - cam.x) * cam.zoom, (off.y - cam.y) * cam.zoom);
    if (paperW !== world.W || paperH !== world.H) {
      paperW = world.W; paperH = world.H;
      paper.clear().beginFill(0xffffff).drawRect(0, 0, paperW, paperH).endFill();
      paper.lineStyle(2, PAPER_LINE, 1, 1).drawRect(0, 0, paperW, paperH);
    }
    // Rand nur, wenn die Welt sichtbar kleiner ist als die Ansicht (sonst bliebe beim Wackeln ein grauer Saum)
    const e = cam.viewW / cam.zoom > world.W + 8 || cam.viewH / cam.zoom > world.H + 8;
    if (e !== edge) { edge = e; app.renderer.background.color = e ? EDGE_BG : 0xffffff; paper.visible = e; }
    lap('fx');
  }

  function resize(viewW, viewH) { app.renderer.resize(viewW, viewH); }

  // Für Prüfungen (?debug: window.__kritzel.renderer.debugRig()): Atlas, Pool, gezeichnet/ausgelassen
  function debugRig() {
    return { resolution: rigs && rigs.resolution, atlasPages: rigs && rigs.pages, bakeMs: rigs && rigs.bakeMs, drawn: stats.drawn, culled: stats.culled,
      groundQuads: groundQ.count, airQuads: airQ.count, shadowQuads: shadowQ.count, types: rigs ? [...rigs.keys()] : [],
      // Boss-Sticker (Task 12c): Pose der im letzten Bild gezeichneten Bosse (turretRot, rotorRot, wingPhase,
      // tailSwing, headRot, track, tilt, recoil, frame), um zu prüfen, dass sie sich mit der Zeit ändern
      // tip = Mündung aus den gezeichneten Sprites (Welt), drawn = aus der Pose (muzzle.tipOffset), logic = wo
      // die Logik jetzt schießen würde (muzzle.bossMuzzle; im Schuss-Moment gleich drawn)
      bosses: bossDbg.slice(0, nBoss).map(d => {
        const M = d.tipM, g = d.hasTip ? { x: M[0] * d.tipLx + M[2] * d.tipLy + M[4], y: M[1] * d.tipLx + M[3] * d.tipLy + M[5] } : null;
        const r1 = v => Math.round(v * 10) / 10;
        return { id: d.id, type: d.type, turretFlip: d.turretFlip, turretRot: d.turretRot, rotorRot: d.rotorRot, tailRotor: d.tailRotor,
          wingPhase: d.wingPhase, tailSwing: d.tailSwing, headRot: d.headRot, track: d.track, tilt: d.tilt, recoil: d.recoil, frame: d.frame, fireT: d.fireT,
          tip: g ? { x: r1(g.x), y: r1(g.y) } : null, drawn: { x: r1(d.drawn.x), y: r1(d.drawn.y) },
          logic: d.hasLogic ? { x: r1(d.logic.x), y: r1(d.logic.y) } : null };
      }) };
  }

  // Für Prüfungen (?debug: window.__kritzel.renderer.debugPhysics()): im letzten Bild gezeichnete Leichen
  // (liegend in corpseQ / fliegend), Teile, Brocken, Einheiten in der Luft und betäubt, Schatten je Stufe,
  // Haltung der lebenden MG-Schützen und Scharfschützen (stances: stand/down/prone/up, Spez. #22)
  function debugPhysics() {
    const pcUsed = corpseQ.count;
    return { corpses: stats.corpses, corpsesFlying: stats.corpsesFlying, parts: stats.parts, partsFlying: stats.partsFlying,
      debris: stats.debris, debrisFlying: stats.debrisFlying, airUnits: stats.airUnits, stunned: stats.stunned,
      stances: { ...stats.stances },
      projShadows: stats.projShadows, targets: stats.targets, shadowLevels: stats.shadowLevels.slice(), corpseQuads: pcUsed, pcUsed };
  }

  return { app, canvas: view, layers: L, fx, resize, markTerrainDirty, draw, prepare, present, gpuFinish, countObjects, prepMs, setOverlay, consume, debugRig, debugPhysics };
}
