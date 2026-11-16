// PixiJS-Renderer (PIXI 7.4.2 als globales PIXI). Zeichnet die Welt im Kamera-Ausschnitt.
// Ebenen in Zeichenreihenfolge: terrain, decals, corpses, light, shadows, ground, projectiles, air, fx, overlay.
// Liest die Welt nur und zeichnet ihre Objekte. Effekte (Partikel, Decals, Bodenlicht, Wackeln) gehören
// fx.js: consume(events) reicht world.events weiter, renderer.fx ist die Effekt-Schnittstelle.
// Höhenachse: Bildschirm-y = y − z für Einheiten, Leichen, Teile, Brocken und Geschosse; Schatten bleiben
// am Boden (y) und werden mit der Höhe größer, blasser und weicher (pose.shadowParams, Spez. #14).
/* global PIXI */
import { TEAMS, CELL } from '../data.js';
import { query, factionOf } from '../world.js';
import { DEBRIS_FADE } from '../physics.js';
import { bakeRigTextures, poseUnit, TEAM_INDEX, E, BOSS_GEO } from './rig.js';
import { shadowParams, corpseLook, projScreen, SHADOW_ALPHA, PRONE_DROP, PRONE_GUN, bossMemory, dragonHead, drawnMuzzle } from './pose.js';
import { bossMuzzle, TURN_SQUASH } from '../muzzle.js';
import { PRONE } from '../combat.js';
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
  const fx = createFx({ layers: L, app });   // Effekte: Decals, Bodenlicht, Partikel, Wackeln

  /* ---------- Gelände (Offscreen-Canvas, Code aus drawTerrain) ---------- */
  const zoneG = new PIXI.Graphics();
  const zoneText = new PIXI.Text('deine Seite', { fontFamily: 'Nunito, system-ui, sans-serif', fontWeight: '800', fontSize: 15, fill: 0x4d82f0 });
  zoneText.alpha = .8; zoneText.anchor.set(1, .75); zoneText.resolution = 3;
  const tcv = document.createElement('canvas'), tctx = tcv.getContext('2d');
  let terrTex = null;
  const terrSprite = new PIXI.Sprite();
  L.terrain.addChild(zoneG, zoneText, terrSprite);   // Zone liegt wie früher unter dem Gelände

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
    const r = Math.round(want * 4) / 4;
    if (world.W === worldW && world.H === worldH && world.GW === GW && world.GH === GH && r === res) return;
    worldW = world.W; worldH = world.H; GW = world.GW; GH = world.GH; res = r;
    tcv.width = Math.ceil(worldW * res); tcv.height = Math.ceil(worldH * res);
    if (terrTex) terrTex.destroy(true);
    terrTex = PIXI.Texture.from(tcv);
    terrSprite.texture = terrTex; terrSprite.scale.set(1 / res);
    fx.resize(worldW, worldH, res);   // leert die Decals
    dirtyRects.length = 0; dirtyRects.push({ x0: 0, y0: 0, x1: GW - 1, y1: GH - 1 }); terrForce = true;
    const ur = clamp(Math.round(cam.fit * dpr * 2 * 2) / 2, 1, 4);
    if (!rigs || rigs.resolution !== ur) { if (rigs) rigs.destroy(); rigs = bakeRigTextures(app.renderer, ur); resetCorpsePCs(); }
  }

  /* ---------- Einheiten ----------
     Jede sichtbare Einheit bekommt pro Bild einen Container aus dem Pool (Reihenfolge = y-Sortierung)
     mit den Rig-Teilen body, pupilL, pupilR, lid, headgear, weapon. Der Schatten (mit Teamring) liegt
     in einer eigenen Ebene unter allen Körpern. Pro Bild werden nur Texturen, Anker, Lage, Drehung,
     Sichtbarkeit und tint gesetzt; die Pose kommt aus poseUnit() in ein wiederverwendetes Objekt. */
  // Task 13: alle Teile, Schatten und HP-Leisten liegen als flache Vierecke in QuadBatches (quads.js), die
  // Lage jedes Teils rechnet bodies() selbst nach (Matrizen wie die früheren Container und Sprites), in derselben
  // Zeichenreihenfolge wie vorher (Einheiten nach y, je Einheit die Teile in Rig-Reihenfolge).
  const shadowQ = createQuadBatch('shadowQuads'), links = new PIXI.Graphics();
  L.shadows.addChild(shadowQ, links);
  const groundQ = createQuadBatch('groundQuads'), groundBars = createQuadBatch('groundBars');
  L.ground.addChild(groundQ, groundBars);
  const airQ = createQuadBatch('airQuads'), airBars = createQuadBatch('airBars');
  L.air.addChild(airQ, airBars);
  const UM = newMat(), GM = newMat(), PM = newMat(), TM = newMat();   // Einheit, Gruppe, Teil, Hilfe
  // Fliegende Leichen, Teile und Brocken liegen über den Bodentruppen (eigene Sprites), ruhende in der
  // Ebene corpses (Leichen im ParticleContainer, Brocken als Sprites darüber).
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
  const stats = { drawn: 0, culled: 0, airUnits: 0, stunned: 0, stances: { stand: 0, down: 0, prone: 0, up: 0 }, corpses: 0, corpsesFlying: 0, parts: 0, partsFlying: 0,
    debris: 0, debrisFlying: 0, projShadows: 0, shadowLevels: [0, 0, 0] };
  const viewR = { x0: 0, y0: 0, x1: 0, y1: 0 };   // sichtbarer Weltausschnitt des Bilds (drawUnits)

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
    for (const u of world.units) {
      if (!u.alive) continue;
      if (PRONE.has(u.type)) SC[u.stance]++;
      if (u.kills >= 3 && (!top || u.kills > top.kills)) top = u;
      if (u.x < vx0 || u.x > vx1 || u.y < vy0 || u.y > vy1) { culled++; continue; }
      (u.T.fly ? airList : groundList).push(u);
    }
    groundList.sort(byY); airList.sort(byY);
    stats.drawn = groundList.length + airList.length; stats.culled = culled; stats.airUnits = 0; stats.stunned = 0;
    const inv = 1 / rigs.resolution;
    // Schatten und Teamringe liegen unter allen Körpern (shadowQ, danach Leichen, Brocken und Geschosse)
    stats.shadowLevels[0] = stats.shadowLevels[1] = stats.shadowLevels[2] = 0;
    shadows(groundList, tm, inv); shadows(airList, tm, inv);
    // Schildwall: verbundene Schilde sichtbar machen (nur stehende Ritter; geschleuderte und betäubte nicht)
    links.clear();
    for (const u of groundList) {
      if (!u.wall || u.state !== 'ok') continue;
      const f = factionOf(world, u); let b = null, bd = 42 * 42;
      query(world, u.x, u.y, 42, v => {
        if (v.id <= u.id || !v.wall || v.state !== 'ok' || !v.alive || factionOf(world, v) !== f) return;
        const e = (v.x - u.x) ** 2 + (v.y - u.y) ** 2; if (e < bd) { bd = e; b = v; }
      });
      if (b) {
        links.lineStyle({ width: 3, color: tm ? C(TEAMS[u.team].c) : 0x6f7a8c, alpha: .5, cap: PIXI.LINE_CAP.ROUND });
        links.moveTo(u.x + u.face * u.T.r * .8, u.y - u.z); links.lineTo(b.x + b.face * b.T.r * .8, b.y - b.z);
      }
    }
    nBoss = 0;
    bodies(groundList, groundQ, groundBars, t, tm, inv);
    bodies(airList, airQ, airBars, t, tm, inv);
    starPool.finish();
    drawCrown(top);
  }

  // Stufe 0 (am Boden): Rig-Schatten mit Teamring; höher: weicher Fleck plus Teamring in Teamfarbe
  function shadows(list, tm, inv) {
    for (const u of list) {
      const rig = rigs.get(u.type), r = rig.r, ti = tm ? TEAM_INDEX[u.team] || 0 : 0;
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
  // Körper, Pupillen, Lid (nur beim Blinzeln), Kopfbedeckung, Waffe vorn.
  function bodies(list, Q, bars, t, tm, inv) {
    Q.clear(); bars.clear();
    for (const u of list) {
      const T = u.T, rig = rigs.get(u.type), p = poseUnit(u, t, pose, rig.boss ? memOf(u) : undefined);
      const vi = tm && rig.teamed ? TEAM_INDEX[u.team] || 0 : 0, fr = p.frame, face = u.face < 0 ? -1 : 1;
      const A = rig.anchors, X = rig.tex, sy = u.y - u.z;
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
      let f = X.body[vi]; part(Q, UM, f[fr] || f[0], A.body, 0, 0, inv);
      if (rig.pupilL) {
        // Pupillen in Augenradien versetzt; lokal ungespiegelt, daher Blick-x mal Blickrichtung
        const e = rig.eyes, ox = p.lookX * face * rig.eyeR, oy = p.lookY * rig.eyeR;
        part(Q, UM, rig.pupilL, A.pupilL, e.L[0] + ox, e.L[1] + oy, inv);
        part(Q, UM, rig.pupilR, A.pupilR, e.R[0] + ox, e.R[1] + oy, inv);
      }
      if (rig.lid && p.blink) part(Q, UM, rig.lid, A.lid, 0, 0, inv, 0, rig.lidTint[tm ? TEAM_INDEX[u.team] || 0 : 0]);
      if (rig.headgear) { f = X.headgear[vi]; part(Q, UM, f[fr] || f[0], A.headgear, 0, 0, inv); }
      if (rig.weapon && !back) weaponPart(Q, rig, p, vi, pr, inv);
      bar(bars, u, T, rig, sy, pr);
    }
  }
  // Rückstoß entlang der Waffenachse nach hinten, Schwung um den Griff
  function weaponPart(Q, rig, p, vi, pr, inv) {
    const a = rig.anchors.weapon, k = p.recoil;
    const ax = rig.axis + p.weaponLie, gx = pr * PRONE_GUN[0] * rig.r, gy = pr * PRONE_GUN[1] * rig.r;
    part(Q, UM, rig.tex.weapon[vi][0], a, a.x + gx - Math.cos(ax) * k, a.y + gy - Math.sin(ax) * k, inv, p.weaponRot * rig.swing + p.weaponLie);
  }

  // HP-Leiste über der Figur (rig.barTop: Oberkante der Zeichnung, Bosse höher und breiter); liegend tiefer
  function bar(bars, u, T, rig, sy, pr) {
    if (!(u.hp < T.hp && T.hp > 10)) return;
    const w = Math.max(12, rig.r * 1.6), y = sy + rig.barTop * (1 - .375 * pr) - 4;
    bars.rect(u.x - w / 2, y, w, 3, 0x2a2a33, .25);
    bars.rect(u.x - w / 2, y, w * Math.max(0, u.hp / T.hp), 3, u.hp / T.hp > .4 ? 0x2fbf6b : 0xe5574f, 1);
  }

  /* ---------- Boss-Sticker (Task 12c, Spez. #23) ----------
     Panzer, Hubschrauber, Drache: je Pool-Container einmal pro Typ ein eigener Teilebaum (makeBoss), der
     im Einheiten-Container liegt (gleiche y-Sortierung wie alle). Pro Bild nur Texturen, Lage, Drehung,
     Sichtbarkeit. Die Pose kommt aus poseUnit mit einem Gedächtnis je Einheit (memOf: Turm weich, Ketten-
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
    const ox = (lx * c + ly * s) * fx * rig.eyeR, oy = (-lx * s + ly * c) * rig.eyeR;
    part(Q, P, rig.pupilL, A.pupilL, e.L[0] + ox, e.L[1] + oy, inv);
    part(Q, P, rig.pupilR, A.pupilR, e.R[0] + ox, e.R[1] + oy, inv);
    if (p.blink) part(Q, P, rig.lid, A.lid, 0, 0, inv, 0, rig.lidTint[ti]);
  }
  // Teile in der Reihenfolge der früheren Teilebäume (makeBoss): Panzer Wanne, Ketten, Turmgruppe (Rohr,
  // Turm, Augen); Heli Rumpf, Kanone, Heckrotor, Augen, Rotorgruppe (Scheibe, Nachzieh-Blatt, Blätter);
  // Drache hinterer Flügel, Schweif, Rumpf, Hals, Kopfgruppe (Kopf, Augen), vorderer Flügel.
  function drawBoss(Q, u, p, rig, vi, ti, face, inv) {
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
     Ruhende Leichen und Teile (auch rutschende mit z = 0) liegen in PIXI.ParticleContainern in der Ebene
     corpses, einer je Atlas-Seite (ein ParticleContainer zeichnet nur eine BaseTexture). Er kennt kein
     visible: unbenutzte Sprites bekommen Größe und Deckkraft 0. Fliegende (state 'fly' mit z > 0 oder
     Steigen) sind normale Sprites über den Bodentruppen und werfen einen Schatten. Aussehen aus
     pose.corpseLook: liegend flach (.55) und grau getönt, fade → Deckkraft, float wippt, sink und ash verblassen. */
  // Ruhende Leichen und Teile: eine QuadBatch (Task 13; vorher ein ParticleContainer je Atlas-Seite), in Listenreihenfolge
  const corpseQ = createQuadBatch('corpseQuads');
  corpseRoot.addChild(corpseQ);
  function resetCorpsePCs() { corpseQ.clear(); }

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
      // Teile: Kopfbedeckung bzw. Waffen-Teil des Rigs (Schild des Ritters); Bosse über rig.partMap
      // (Panzerturm mit Rohr, Heli-Rotor), die liegende Leiche aus rig.corpseBody (Drache: ganze Figur)
      const name = body ? rig.corpseBody : (rig.partMap && rig.partMap[c.part]) || (c.part === 'headgear' ? 'headgear' : 'weapon');
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
  const PROJ_SHADOW = { arrow: 3, bomb: 4, mortar: 4.5, shell: 3.5 };
  // Gezeichnet aus Strichen (weiße Textur, gedreht) und Scheiben (softTex[0], Radius 31 px) in projQ wie
  // früher mit Graphics: Pfeil, Bombe/Mörser (Rand O + Füllung, Bombe mit Lunte), Kugel, Rakete, Granate, Feuerball
  function disc(x, y, r, col) { projQ.addPart(softTex[0], null, x, y, 0, r / 31, r / 31, .5, .5, col, 1); }
  function drawProjectiles(world) {
    projQ.clear();
    let ns = 0;
    const OC = C(O);
    for (const p of world.proj) {
      projScreen(p, PS);
      const x = PS.x, y = PS.y, ca = Math.cos(PS.a), sa = Math.sin(PS.a);
      if (p.arc) {
        const q = p.t < p.dur ? p.t / p.dur : 1, rx = PROJ_SHADOW[p.kind] || 3;
        shadowParams(p.z, SH);
        blobShadow(p.x0 + (p.x1 - p.x0) * q, p.y0 + (p.y1 - p.y0) * q, rx, rx * .4); ns++;
      }
      if (p.kind === 'arrow') projQ.line(x - ca * 5, y - sa * 5, x + ca * 5, y + sa * 5, 1.5, 0x8a5a2b);
      else if (p.kind === 'bomb' || p.kind === 'mortar') {
        disc(x, y, 4.5, OC); disc(x, y, 3.5, 0x2f3340);
        if (p.kind === 'bomb') disc(x + 2, y - 4, 1.6, 0xffb800);
      } else if (p.kind === 'bullet') projQ.line(x - ca * 7, y - sa * 7, x + ca * 3, y + sa * 3, 1.6, 0xe0a020);
      else if (p.kind === 'rocket') {
        disc(x - ca * 6, y - sa * 6, 3, 0xff8a3d);
        projQ.line(x - ca * 4, y - sa * 4, x + ca * 4, y + sa * 4, 3.4, OC);
      } else if (p.kind === 'shell') disc(x, y, 3.2, 0x2f3340);
      else { disc(x, y, 6, 0xff8a3d); disc(x, y, 3.5, 0xffe066); }
    }
    stats.projShadows = ns;
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
  const overlay = { brushX: 0, brushY: 0, brushR: 0, erase: false, missionZoneX: null };
  const overG = new PIXI.Graphics();
  L.overlay.addChild(crownG, crownT, overG);
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
    overG.clear();
    if (overlay.brushR > 0) {
      const er = overlay.erase;
      overG.lineStyle(1.6, er ? 0xff6f91 : 0x4d82f0).beginFill(er ? 0xff7896 : 0x4d82f0, er ? .10 : .07)
        .drawCircle(overlay.brushX, overlay.brushY, overlay.brushR).endFill();
    }
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { zoneText.dirty = true; crownT.dirty = true; }).catch(() => {});

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
    }
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
    const off = fx.frame(t);   // Partikel, Decal-Upload, Wackeln (klingt in Echtzeit ab)
    scene.scale.set(cam.zoom);
    scene.position.set((off.x - cam.x) * cam.zoom, (off.y - cam.y) * cam.zoom);
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
  // (liegend im ParticleContainer / fliegend), Teile, Brocken, Einheiten in der Luft und betäubt, Schatten je Stufe,
  // Haltung der lebenden MG-Schützen und Scharfschützen (stances: stand/down/prone/up, Spez. #22)
  function debugPhysics() {
    const pcUsed = corpseQ.count;
    return { corpses: stats.corpses, corpsesFlying: stats.corpsesFlying, parts: stats.parts, partsFlying: stats.partsFlying,
      debris: stats.debris, debrisFlying: stats.debrisFlying, airUnits: stats.airUnits, stunned: stats.stunned,
      stances: { ...stats.stances },
      projShadows: stats.projShadows, shadowLevels: stats.shadowLevels.slice(), corpseQuads: pcUsed, pcUsed };
  }

  return { app, canvas: view, layers: L, fx, resize, markTerrainDirty, draw, prepare, present, gpuFinish, countObjects, prepMs, setOverlay, consume, debugRig, debugPhysics };
}
