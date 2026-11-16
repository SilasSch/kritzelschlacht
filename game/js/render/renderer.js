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
import { bakeRigTextures, poseUnit, TEAM_INDEX, E } from './rig.js';
import { shadowParams, corpseLook, projScreen, SHADOW_ALPHA, PRONE_DROP, PRONE_GUN } from './pose.js';
import { PRONE } from '../combat.js';
import { createFx } from './fx.js';

const O = '#2a2a33';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const LAYERS = ['terrain', 'decals', 'corpses', 'light', 'shadows', 'ground', 'projectiles', 'air', 'fx', 'overlay'];
const MAX_TEX = 4096;
const TAU = Math.PI * 2;
// Zauberstab und Mörserrohr liegen wie in der alten Zeichnung hinter dem Körper (und damit unter dem Hut)
const BACK_WEAPON = new Set(['magier', 'moerser']);
const PC_MAX = 4000;                 // Sprites je Leichen-ParticleContainer (Logik deckelt bei 1500 + Verblassende)
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
  const shadowSprites = new PIXI.Container(), links = new PIXI.Graphics();
  L.shadows.addChild(shadowSprites, links);
  const groundUnits = new PIXI.Container(), groundBars = new PIXI.Graphics();
  L.ground.addChild(groundUnits, groundBars);
  const airUnits = new PIXI.Container(), airBars = new PIXI.Graphics();
  L.air.addChild(airUnits, airBars);
  const shadowPool = makePool(shadowSprites), groundPool = makeRigPool(groundUnits), airPool = makeRigPool(airUnits);
  // Fliegende Leichen, Teile und Brocken liegen über den Bodentruppen (eigene Sprites), ruhende in der
  // Ebene corpses (Leichen im ParticleContainer, Brocken als Sprites darüber).
  const flySprites = new PIXI.Container(), projG = new PIXI.Graphics();
  L.projectiles.addChild(flySprites, projG);
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
    const s = shadowPool.next();
    s.texture = softTex[SH.level]; s.anchor.set(.5); s.position.set(x, y); s.rotation = 0;
    s.scale.set(2 * rx * SH.scale / BLOB, 2 * ry * SH.scale / BLOB); s.tint = SHADOW_TINT; s.alpha = SH.alpha;
    stats.shadowLevels[SH.level]++;
  }

  // Pool von Einheiten-Containern; Kinder in Zeichenreihenfolge der Rig-Teile (Schatten liegt woanders)
  function makeRigPool(container) {
    const arr = [];
    let n = 0;
    return {
      next() {
        let r = arr[n];
        if (!r) {
          const c = new PIXI.Container();
          r = { c };
          // weaponB: Waffe hinter dem Körper (BACK_WEAPON), weapon: davor
          for (const k of ['weaponB', 'body', 'pupilL', 'pupilR', 'lid', 'headgear', 'weapon']) { const s = new PIXI.Sprite(); r[k] = s; c.addChild(s); }
          container.addChild(c); arr.push(r);
        }
        r.c.visible = true; n++;
        return r;
      },
      finish() { for (let i = n; i < arr.length; i++) arr[i].c.visible = false; n = 0; },
      get size() { return arr.length; },
    };
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
    const vx0 = cam.x - 80, vy0 = cam.y - 80, vx1 = cam.x + cam.viewW / cam.zoom + 80, vy1 = cam.y + cam.viewH / cam.zoom + 220;
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
    // Schatten und Teamringe liegen unter allen Körpern (shadowPool.finish in draw, nach Leichen und Geschossen)
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
    bodies(groundList, groundPool, groundBars, t, tm, inv);
    bodies(airList, airPool, airBars, t, tm, inv);
    starPool.finish();
    drawCrown(top);
  }

  // Stufe 0 (am Boden): Rig-Schatten mit Teamring; höher: weicher Fleck plus Teamring in Teamfarbe
  function shadows(list, tm, inv) {
    for (const u of list) {
      const rig = rigs.get(u.type), r = rig.r, ti = tm ? TEAM_INDEX[u.team] || 0 : 0;
      shadowParams(u.z, SH);
      if (SH.level === 0) {
        const a = rig.anchors.shadow, s = shadowPool.next();
        s.texture = rig.tex.shadow[ti][0]; s.anchor.set(a.ax, a.ay); s.position.set(u.x, u.y); s.rotation = 0;
        s.scale.set(inv * SH.scale); s.tint = 0xffffff; s.alpha = SH.alpha / SHADOW_ALPHA;   // Textur trägt schon .13
        stats.shadowLevels[0]++;
        continue;
      }
      blobShadow(u.x, u.y + r * 1.05, r * .85, r * .28);
      if (ti) {
        const s = shadowPool.next();
        s.texture = ringTex; s.anchor.set(.5); s.position.set(u.x, u.y + r); s.rotation = 0;
        s.scale.set(r / RING_R * SH.scale / RING_RES); s.tint = C(TEAMS[u.team].c); s.alpha = SH.alpha / SHADOW_ALPHA;
      }
    }
  }

  function part(s, tex, a, x, y, inv) {
    s.visible = true; s.texture = tex; s.anchor.set(a.ax, a.ay); s.position.set(x, y); s.scale.set(inv);
  }

  // Container-Transform: Drehpunkt an den Füßen (Flieger: Körpermitte), damit Quetschen und Neigen
  // die Figur am Boden lassen; scale.x < 0 spiegelt nach links, die Neigung wirkt danach in Weltrichtung.
  // Höhe: gezeichnet bei y − z (Flieger in Flughöhe statt des alten Versatzes rig.offY). In der Luft dreht
  // sich die Figur um ihre Mitte (p.spin), betäubt taumelt sie um die Füße und zwei Sternchen kreisen.
  // Liegen (p.prone 0..1): der Drehpunkt wandert von den Füßen zur Körpermitte, die um r · PRONE_DROP
  // sinkt, und die Figur kippt um p.lie (Kopf in Blickrichtung); die Waffe dreht um p.weaponLie zurück
  // (zeigt nach vorn) und rückt zum Kopf (PRONE_GUN), der Rückstoß folgt ihrer Achse.
  function bodies(list, pool, bars, t, tm, inv) {
    bars.clear();
    for (const u of list) {
      const T = u.T, rig = rigs.get(u.type), p = poseUnit(u, t, pose), slot = pool.next();
      const vi = tm && rig.teamed ? TEAM_INDEX[u.team] || 0 : 0, fr = p.frame, face = u.face < 0 ? -1 : 1;
      const c = slot.c, A = rig.anchors, X = rig.tex, sy = u.y - u.z;
      const pr = p.prone;
      if (p.air) { c.position.set(u.x, sy); c.pivot.set(0, 0); stats.airUnits++; }
      else if (pr > 0) {
        const py = rig.pivotY * (1 - pr);
        c.position.set(u.x, sy + py + p.bob + pr * rig.r * PRONE_DROP); c.pivot.set(0, py);
      } else { c.position.set(u.x, sy + rig.pivotY + p.bob); c.pivot.set(0, rig.pivotY); }
      c.scale.set(p.sx * face, p.sy);
      // Drehung wirkt nach der Spiegelung (Weltrichtung): spin > 0 dreht im Uhrzeigersinn (Flug nach rechts)
      c.rotation = p.tilt + p.spin + p.lie;
      if (p.dizzy && u.stunT > .05) {
        stats.stunned++;
        for (let i = 0; i < 2; i++) {
          const a = TAU * 1.6 * t + u.seed + i * Math.PI;
          const s = starPool.next();
          s.texture = softTex[0]; s.position.set(u.x + Math.cos(a) * T.r * .8, sy - T.r * 1.3 + Math.sin(a) * T.r * .25);
          s.rotation = 0; s.scale.set(1.5 / 31); s.tint = 0xffd84d; s.alpha = .95;
        }
      }
      let f = X.body[vi]; part(slot.body, f[fr] || f[0], A.body, 0, 0, inv);
      if (rig.pupilL) {
        // Pupillen in Augenradien versetzt; lokal ungespiegelt, daher Blick-x mal Blickrichtung
        const e = rig.eyes, ox = p.lookX * face * rig.eyeR, oy = p.lookY * rig.eyeR;
        part(slot.pupilL, rig.pupilL, A.pupilL, e.L[0] + ox, e.L[1] + oy, inv);
        part(slot.pupilR, rig.pupilR, A.pupilR, e.R[0] + ox, e.R[1] + oy, inv);
      } else { slot.pupilL.visible = false; slot.pupilR.visible = false; }
      if (rig.lid && p.blink) { part(slot.lid, rig.lid, A.lid, 0, 0, inv); slot.lid.tint = rig.lidTint[tm ? TEAM_INDEX[u.team] || 0 : 0]; }
      else slot.lid.visible = false;
      if (rig.headgear) { f = X.headgear[vi]; part(slot.headgear, f[fr] || f[0], A.headgear, 0, 0, inv); }
      else slot.headgear.visible = false;
      if (rig.weapon) {
        // Rückstoß entlang der Waffenachse nach hinten, Schwung um den Griff
        const back = BACK_WEAPON.has(u.type), w = back ? slot.weaponB : slot.weapon, a = A.weapon, k = p.recoil;
        (back ? slot.weapon : slot.weaponB).visible = false;
        const ax = rig.axis + p.weaponLie, gx = pr * PRONE_GUN[0] * rig.r, gy = pr * PRONE_GUN[1] * rig.r;
        part(w, X.weapon[vi][0], a, a.x + gx - Math.cos(ax) * k, a.y + gy - Math.sin(ax) * k, inv);
        w.rotation = p.weaponRot * rig.swing + p.weaponLie;
      } else { slot.weapon.visible = false; slot.weaponB.visible = false; }
      if (u.hp < T.hp && T.hp > 10) {
        const w = Math.max(12, T.r * 1.6), y = sy - T.r * (1.6 - .9 * pr) - 4;
        bars.beginFill(0x2a2a33, .25).drawRect(u.x - w / 2, y, w, 3).endFill();
        bars.beginFill(u.hp / T.hp > .4 ? 0x2fbf6b : 0xe5574f).drawRect(u.x - w / 2, y, w * Math.max(0, u.hp / T.hp), 3).endFill();
      }
    }
    pool.finish();
  }

  // Heldenkrone über der lebenden Einheit mit den meisten Siegen (ab 3)
  const crownG = new PIXI.Graphics();
  const crownT = new PIXI.Text('', { fontFamily: 'Nunito, system-ui, sans-serif', fontWeight: '800', fontSize: 11, fill: O, stroke: '#ffffff', strokeThickness: 3 });
  crownT.anchor.set(0, .8); crownT.resolution = 4;
  function drawCrown(top) {
    crownG.clear();
    crownT.visible = !!top;
    if (!top) return;
    const x = top.x, y = top.y - top.z - top.T.r * 1.75 - 14;
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
  const pcs = new Map();   // BaseTexture → { pc, arr, n }
  const PC_PROPS = { vertices: true, position: true, rotation: true, uvs: true, tint: true };
  function resetCorpsePCs() {
    pcs.forEach(g => { corpseRoot.removeChild(g.pc); g.pc.destroy({ children: true }); });
    pcs.clear();
  }
  function pcSprite(tex) {
    const base = tex.baseTexture;
    let g = pcs.get(base);
    if (!g) {
      const pc = new PIXI.ParticleContainer(PC_MAX, PC_PROPS, PC_MAX);
      corpseRoot.addChild(pc); g = { pc, arr: [], n: 0 }; pcs.set(base, g);
    }
    let sp = g.arr[g.n];
    if (!sp) {
      if (g.arr.length >= PC_MAX) return null;
      sp = new PIXI.Sprite(tex); g.pc.addChild(sp); g.arr.push(sp);
    }
    g.n++;
    return sp;
  }
  const finishPC = g => {
    for (let i = g.n; i < g.arr.length; i++) { const sp = g.arr[i]; if (sp.alpha !== 0) { sp.alpha = 0; sp.scale.set(0); } }
    g.n = 0;
  };

  const LK = {};   // Ergebnis von corpseLook, wiederverwendet
  function drawCorpses(world, t, tm, inv) {
    let nb = 0, nbf = 0, np = 0, npf = 0;
    const list = world.corpses, V = viewR;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.x < V.x0 || c.x > V.x1 || c.y < V.y0 || c.y > V.y1) continue;
      const rig = rigs.get(c.type); if (!rig) continue;
      const body = c.kind === 'body';
      // Teile: Kopfbedeckung bzw. Waffen-Teil des Rigs (Schild des Ritters, Rohr des Panzers)
      const set = body ? rig.tex.body : c.part === 'headgear' ? rig.tex.headgear : rig.tex.weapon;
      if (!set) continue;
      const vi = tm && rig.teamed ? TEAM_INDEX[c.team] || 0 : 0, tex = (set[vi] || set[0])[0];
      corpseLook(c, t, LK);
      if (LK.alpha <= .01) continue;
      const flying = c.state === 'fly' && (c.z > .5 || c.vz > 0);
      const sp = flying ? flyPool.next() : pcSprite(tex);
      if (!sp) continue;
      const a = body ? rig.anchors.body : HALF;
      sp.texture = tex; sp.anchor.set(a.ax, a.ay);
      sp.position.set(c.x, c.y - c.z + LK.dy); sp.rotation = LK.rot;
      sp.scale.set(c.face < 0 ? -inv : inv, inv * LK.sy); sp.tint = LK.tint; sp.alpha = LK.alpha;
      if (flying) {
        const r = rig.r;
        shadowParams(c.z, SH);
        if (body) blobShadow(c.x, c.y + r * 1.05, r * .85, r * .28); else blobShadow(c.x, c.y, r * .45, r * .18);
      }
      if (body) { if (flying) nbf++; else nb++; } else if (flying) npf++; else np++;
    }
    pcs.forEach(finishPC);
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
  function drawProjectiles(world) {
    const g = projG; g.clear();
    let ns = 0;
    for (const p of world.proj) {
      projScreen(p, PS);
      const x = PS.x, y = PS.y, ca = Math.cos(PS.a), sa = Math.sin(PS.a);
      if (p.arc) {
        const q = p.t < p.dur ? p.t / p.dur : 1, rx = PROJ_SHADOW[p.kind] || 3;
        shadowParams(p.z, SH);
        blobShadow(p.x0 + (p.x1 - p.x0) * q, p.y0 + (p.y1 - p.y0) * q, rx, rx * .4); ns++;
      }
      if (p.kind === 'arrow') {
        g.lineStyle(1.5, 0x8a5a2b).moveTo(x - ca * 5, y - sa * 5).lineTo(x + ca * 5, y + sa * 5);
      } else if (p.kind === 'bomb' || p.kind === 'mortar') {
        g.lineStyle(1, C(O)).beginFill(0x2f3340).drawCircle(x, y, 4).endFill();
        if (p.kind === 'bomb') g.lineStyle(0).beginFill(0xffb800).drawCircle(x + 2, y - 4, 1.6).endFill();
      } else if (p.kind === 'bullet') {
        g.lineStyle(1.6, 0xe0a020).moveTo(x - ca * 7, y - sa * 7).lineTo(x + ca * 3, y + sa * 3);
      } else if (p.kind === 'rocket') {
        g.lineStyle(0).beginFill(0xff8a3d).drawCircle(x - ca * 6, y - sa * 6, 3).endFill();
        g.lineStyle(3.4, C(O)).moveTo(x - ca * 4, y - sa * 4).lineTo(x + ca * 4, y + sa * 4);
      } else if (p.kind === 'shell') {
        g.lineStyle(0).beginFill(0x2f3340).drawCircle(x, y, 3.2).endFill();
      } else {
        g.lineStyle(0).beginFill(0xff8a3d).drawCircle(x, y, 6).endFill();
        g.beginFill(0xffe066).drawCircle(x, y, 3.5).endFill();
      }
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
  function draw(world, cam, t) {
    ensureWorld(world, cam);
    for (const r of dirtyRects) drawTerrain(world, r.x0, r.y0, r.x1, r.y1);
    dirtyRects.length = 0;
    if (terrChanged && (terrForce || t - terrUpT >= TERR_UPLOAD || t < terrUpT)) {
      terrTex.update(); terrUpT = t; terrChanged = false; terrForce = false;
    }
    drawOverlay(world);
    drawUnits(world, cam, t);
    const inv = 1 / rigs.resolution;
    drawCorpses(world, t, world.teamMode, inv);
    drawDebris(world);
    drawProjectiles(world);
    shadowPool.finish(); flyPool.finish();
    const off = fx.frame(t);   // Partikel, Decal-Upload, Wackeln (klingt in Echtzeit ab)
    scene.scale.set(cam.zoom);
    scene.position.set((off.x - cam.x) * cam.zoom, (off.y - cam.y) * cam.zoom);
    app.renderer.render(app.stage);
  }

  function resize(viewW, viewH) { app.renderer.resize(viewW, viewH); }

  // Für Prüfungen (?debug: window.__kritzel.renderer.debugRig()): Atlas, Pool, gezeichnet/ausgelassen
  function debugRig() {
    return { resolution: rigs && rigs.resolution, atlasPages: rigs && rigs.pages, bakeMs: rigs && rigs.bakeMs, drawn: stats.drawn, culled: stats.culled,
      groundPool: groundPool.size, airPool: airPool.size, types: rigs ? [...rigs.keys()] : [] };
  }

  // Für Prüfungen (?debug: window.__kritzel.renderer.debugPhysics()): im letzten Bild gezeichnete Leichen
  // (liegend im ParticleContainer / fliegend), Teile, Brocken, Einheiten in der Luft und betäubt, Schatten je Stufe,
  // Haltung der lebenden MG-Schützen und Scharfschützen (stances: stand/down/prone/up, Spez. #22)
  function debugPhysics() {
    let pcSprites = 0, pcUsed = 0;
    pcs.forEach(g => { pcSprites += g.arr.length; for (const sp of g.arr) if (sp.alpha > 0) pcUsed++; });
    return { corpses: stats.corpses, corpsesFlying: stats.corpsesFlying, parts: stats.parts, partsFlying: stats.partsFlying,
      debris: stats.debris, debrisFlying: stats.debrisFlying, airUnits: stats.airUnits, stunned: stats.stunned,
      stances: { ...stats.stances },
      projShadows: stats.projShadows, shadowLevels: stats.shadowLevels.slice(), particleContainers: pcs.size, pcSprites, pcUsed };
  }

  return { app, canvas: view, layers: L, fx, resize, markTerrainDirty, draw, setOverlay, consume, debugRig, debugPhysics };
}
