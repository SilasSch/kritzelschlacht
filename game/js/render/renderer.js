// PixiJS-Renderer (PIXI 7.4.2 als globales PIXI). Zeichnet die Welt im Kamera-Ausschnitt.
// Ebenen in Zeichenreihenfolge: terrain, decals, corpses, shadows, ground, projectiles, air, fx, overlay.
// Liest die Welt nur; Effekte entstehen aus world.events (event()).
/* global PIXI */
import { UNITS, TEAMS, CELL } from '../data.js';
import { query, factionOf } from '../world.js';
import { bakeUnitTextures, spriteSize, shade, E } from './rig.js';

const O = '#2a2a33';
const RM = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const LAYERS = ['terrain', 'decals', 'corpses', 'shadows', 'ground', 'projectiles', 'air', 'fx', 'overlay'];
const MAX_TEX = 4096;

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

  /* ---------- Gelände (Offscreen-Canvas, Code aus drawTerrain) ---------- */
  const zoneG = new PIXI.Graphics();
  const zoneText = new PIXI.Text('deine Seite', { fontFamily: 'Nunito, system-ui, sans-serif', fontWeight: '800', fontSize: 15, fill: 0x4d82f0 });
  zoneText.alpha = .8; zoneText.anchor.set(1, .75); zoneText.resolution = 3;
  const tcv = document.createElement('canvas'), tctx = tcv.getContext('2d');
  let terrTex = null;
  const terrSprite = new PIXI.Sprite();
  L.terrain.addChild(zoneG, zoneText, terrSprite);   // Zone liegt wie früher unter dem Gelände

  let tex = null;            // gebackene Einheiten-Texturen (rig.js)
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

  /* ---------- Decals (Offscreen-Canvas wie im alten Spiel: Flecken und Brandspuren) ----------
     Gleicher Zeichencode wie decal() der alten Datei (source-over auf 2D-Canvas), Upload wie beim Gelände,
     höchstens alle DECAL_UPLOAD s. */
  const DECAL_UPLOAD = .1;
  const dcv = document.createElement('canvas'), dctx = dcv.getContext('2d');
  let decalTex = null, decalDirty = false, decalForce = false, decalUpT = -1;
  const decalSprite = new PIXI.Sprite();
  L.decals.addChild(decalSprite);

  function decal(x, y, r, col, a) {
    if (!res) return;
    const c = dctx; c.setTransform(res, 0, 0, res, 0, 0); c.globalAlpha = a; c.fillStyle = col;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(x + rnd(-r, r) * .5, y + rnd(-r, r) * .3, r * rnd(.4, .8), r * rnd(.22, .42), 0, 0, 7); c.fill(); }
    c.globalAlpha = 1;
    decalDirty = true;
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
    dcv.width = tcv.width; dcv.height = tcv.height;   // leert die Decals
    if (decalTex) decalTex.destroy(true);
    decalTex = PIXI.Texture.from(dcv);
    decalSprite.texture = decalTex; decalSprite.scale.set(1 / res);
    decalDirty = false; decalForce = false;
    dirtyRects.length = 0; dirtyRects.push({ x0: 0, y0: 0, x1: GW - 1, y1: GH - 1 }); terrForce = true;
    const ur = clamp(Math.round(cam.fit * dpr * 2 * 2) / 2, 1, 4);
    if (!tex || tex.resolution !== ur) { if (tex) tex.destroy(); tex = bakeUnitTextures(app.renderer, ur); }
  }

  /* ---------- Einheiten ---------- */
  const shadowSprites = new PIXI.Container(), links = new PIXI.Graphics();
  L.shadows.addChild(shadowSprites, links);
  const groundSprites = new PIXI.Container(), groundBars = new PIXI.Graphics();
  L.ground.addChild(groundSprites, groundBars);
  const airSprites = new PIXI.Container(), airBars = new PIXI.Graphics();
  L.air.addChild(airSprites, airBars);
  const shadowPool = makePool(shadowSprites), groundPool = makePool(groundSprites), airPool = makePool(airSprites);
  const projG = new PIXI.Graphics();
  L.projectiles.addChild(projG);

  const groundList = [], airList = [];
  const byY = (a, b) => a.y - b.y;

  function drawUnits(world, t) {
    const tm = world.teamMode;
    groundList.length = 0; airList.length = 0;
    let top = null;
    for (const u of world.units) {
      if (!u.alive) continue;
      (u.T.fly ? airList : groundList).push(u);
      if (u.kills >= 3 && (!top || u.kills > top.kills)) top = u;
    }
    groundList.sort(byY); airList.sort(byY);
    // Schatten und Teamringe liegen unter allen Körpern
    for (const list of [groundList, airList]) for (const u of list) {
      const tx = tex.shadow(u.type, tm ? u.team : null), s = shadowPool.next();
      s.texture = tx; s.position.set(u.x, u.y); s.scale.set(spriteSize(u.T.r) / tx.width); s.alpha = 1;
    }
    shadowPool.finish();
    // Schildwall: verbundene Schilde sichtbar machen
    links.clear();
    for (const u of groundList) {
      if (!u.wall) continue;
      const f = factionOf(world, u); let b = null, bd = 42 * 42;
      query(world, u.x, u.y, 42, v => {
        if (v.id <= u.id || !v.wall || factionOf(world, v) !== f) return;
        const e = (v.x - u.x) ** 2 + (v.y - u.y) ** 2; if (e < bd) { bd = e; b = v; }
      });
      if (b) {
        links.lineStyle({ width: 3, color: tm ? C(TEAMS[u.team].c) : 0x6f7a8c, alpha: .5, cap: PIXI.LINE_CAP.ROUND });
        links.moveTo(u.x + u.face * u.T.r * .8, u.y); links.lineTo(b.x + b.face * b.T.r * .8, b.y);
      }
    }
    bodies(groundList, groundPool, groundBars, t, tm);
    bodies(airList, airPool, airBars, t, tm);
    drawCrown(top);
  }

  function bodies(list, pool, bars, t, tm) {
    bars.clear();
    for (const u of list) {
      const T = u.T, frame = u.moving || T.fly ? ((t * (T.fly ? 10 : 7) + u.seed) | 0) % 2 : 0;
      const tx = tex.get(u.type, tm ? u.team : null, u.face < 0, frame), s = pool.next();
      s.texture = tx; s.position.set(u.x, u.y); s.scale.set(spriteSize(T.r) / tx.width);
      s.alpha = u.hitT > 0 ? .55 : 1;
      if (u.hp < T.hp && T.hp > 10) {
        const w = Math.max(12, T.r * 1.6), y = u.y - T.r * (T.fly ? 2.1 : 1.6) - 4;
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
    const x = top.x, y = top.y - top.T.r * (top.T.fly ? 2.3 : 1.75) - 14;
    crownG.lineStyle({ width: 1.3, color: C(O), join: PIXI.LINE_JOIN.ROUND }).beginFill(0xffc533);
    crownG.drawPolygon([x - 7, y + 5, x - 8.5, y - 4, x - 3.5, y, x, y - 6, x + 3.5, y, x + 8.5, y - 4, x + 7, y + 5]);
    crownG.endFill();
    const s = String(top.kills);
    if (crownT.text !== s) crownT.text = s;
    crownT.position.set(x + 11, y + 5);
  }

  function drawProjectiles(world) {
    const g = projG; g.clear();
    for (const p of world.proj) {
      const q = p.t / p.dur, x = p.x0 + (p.x1 - p.x0) * q, y = p.y0 + (p.y1 - p.y0) * q - Math.sin(q * Math.PI) * p.h;
      if (p.kind === 'arrow') {
        const q2 = Math.min(1, q + .04), x2 = p.x0 + (p.x1 - p.x0) * q2, y2 = p.y0 + (p.y1 - p.y0) * q2 - Math.sin(q2 * Math.PI) * p.h, a = Math.atan2(y2 - y, x2 - x);
        g.lineStyle(1.5, 0x8a5a2b).moveTo(x - Math.cos(a) * 5, y - Math.sin(a) * 5).lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5);
      } else if (p.kind === 'bomb' || p.kind === 'mortar') {
        g.lineStyle(1, C(O)).beginFill(0x2f3340).drawCircle(x, y, 4).endFill();
        if (p.kind === 'bomb') g.lineStyle(0).beginFill(0xffb800).drawCircle(x + 2, y - 4, 1.6).endFill();
      } else if (p.kind === 'bullet') {
        const a = Math.atan2(p.y1 - p.y0, p.x1 - p.x0);
        g.lineStyle(1.6, 0xe0a020).moveTo(x - Math.cos(a) * 7, y - Math.sin(a) * 7).lineTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3);
      } else if (p.kind === 'rocket') {
        const a = Math.atan2(p.y1 - p.y0, p.x1 - p.x0);
        g.lineStyle(0).beginFill(0xff8a3d).drawCircle(x - Math.cos(a) * 6, y - Math.sin(a) * 6, 3).endFill();
        g.lineStyle(3.4, C(O)).moveTo(x - Math.cos(a) * 4, y - Math.sin(a) * 4).lineTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4);
      } else if (p.kind === 'shell') {
        g.lineStyle(0).beginFill(0x2f3340).drawCircle(x, y, 3.2).endFill();
      } else {
        g.lineStyle(0).beginFill(0xff8a3d).drawCircle(x, y, 6).endFill();
        g.beginFill(0xffe066).drawCircle(x, y, 3.5).endFill();
      }
    }
  }

  /* ==========================================================================
     FX: Partikel, Decals und Wackeln aus world.events (wandert später nach fx.js)
     ========================================================================== */
  let parts = [], shake = 0;
  const fxSprites = new PIXI.Container(), fxG = new PIXI.Graphics();
  L.fx.addChild(fxSprites, fxG, crownG, crownT);
  const fxPool = makePool(fxSprites);
  const dotTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.beginPath(); c.arc(32, 32, 31, 0, 7); c.fill();
    return PIXI.Texture.from(cv);
  })();
  const push = p => parts.push(p);
  const dots = (x, y, n, s, life, r0, r1, col) => {
    for (let i = 0; i < n; i++) push({ k: 'dot', x, y, vx: rnd(-s, s), vy: rnd(-s, s), life, max: life, r: rnd(r0, r1), col });
  };

  function event(e) {
    switch (e.type) {
      case 'terrain': markTerrainDirty(e.gx0, e.gy0, e.gx1, e.gy1, false); break;
      case 'death': {
        const T = UNITS[e.unitType]; if (!T) break;
        decal(e.x, e.y + T.r * .7, T.r * 1.1, shade(T.col, -.25), .13);
        dots(e.x, e.y, 5, 60, .5, 1.5, 3.5, T.col);
        push({ k: 'soul', x: e.x, y: e.y - T.r, vx: rnd(-8, 8), vy: -28, life: 1.3, max: 1.3, r: Math.min(9, T.r * .7 + 2) });
        break;
      }
      case 'blast': {
        const n = e.kind === 'fire' ? 14 : 18;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * 6.283, s = rnd(30, 170);
          push({ k: e.kind === 'fire' ? 'fire' : 'boom', x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(.3, .6), max: .6, r: rnd(3, 7) });
        }
        push({ k: 'ring', x: e.x, y: e.y, life: .35, max: .35, r: e.R });
        if (e.R > 0) decal(e.x, e.y, e.R * .75, '#3a3d45', .07);
        break;
      }
      case 'shot':
        if (e.kind === 'breath') {
          for (let i = 0; i < 4; i++) {
            const a = Math.atan2(e.ny, e.nx) + rnd(-.5, .5), s = rnd(140, 260);
            push({ k: 'fire', x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(.3, .5), max: .5, r: rnd(3, 6) });
          }
        } else if (e.kind === 'bullet' || e.kind === 'shell' || e.kind === 'rocket') {
          push({ k: 'flash', x: e.x + e.face * 3, y: e.y, life: .07, max: .07, r: e.kind === 'shell' ? 7 : 3.5 });
        }
        break;
      case 'hit':
        if (e.flank) push({ k: 'dot', x: e.x, y: e.y - 10, vx: rnd(-20, 20), vy: -40, life: .35, max: .35, r: 2.6, col: '#ffb800' });
        break;
      case 'charge': push({ k: 'ring', x: e.x, y: e.y, life: .25, max: .25, r: 16 }); break;
      case 'heal': push({ k: 'plus', x: e.x + rnd(-4, 4), y: e.y, vx: 0, vy: -30, life: .7, max: .7, r: 5 }); break;
      case 'miss':
        if (e.kind === 'arrow') push({ k: 'arrow', x: e.x, y: e.y, a: e.a, life: 2.5, max: 2.5, r: 0 });
        else dots(e.x, e.y, 1, 20, .25, 1.5, 1.5, '#b8a98a');
        break;
      case 'burn': push({ k: 'fire', x: e.x + rnd(-4, 4), y: e.y, vx: 0, vy: -40, life: .4, max: .4, r: 3 }); break;
      case 'wallHit': if (e.broken) dots(e.x, e.y, 3, 50, .5, 1.5, 3, '#8d929c'); break;
    }
    if (e.shake) shake = Math.max(shake, e.shake);
  }

  // Partikel altern lassen; Flugspuren von Feuerbällen und Raketen
  function stepFx(dt, world) {
    if (world && dt > 0) {
      for (const p of world.proj) {
        if (p.kind !== 'fire' && p.kind !== 'rocket') continue;
        const q = p.t / p.dur, x = p.x0 + (p.x1 - p.x0) * q, y = p.y0 + (p.y1 - p.y0) * q;
        if (p.kind === 'fire' && Math.random() < dt * 30) push({ k: 'fire', x, y, vx: rnd(-15, 15), vy: rnd(-15, 15), life: .25, max: .25, r: rnd(2, 4) });
        if (p.kind === 'rocket' && Math.random() < dt * 36) push({ k: 'smoke', x, y, vx: rnd(-8, 8), vy: rnd(-8, 8), life: .5, max: .5, r: rnd(2, 3.5) });
      }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      if (p.vx !== undefined) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.k !== 'soul' && p.k !== 'plus') { p.vx *= .9; p.vy *= .9; } }
    }
    if (parts.length > 1400) parts.splice(0, parts.length - 1400);
  }

  function dot(x, y, r, col, a) {
    const s = fxPool.next();
    s.texture = dotTex; s.position.set(x, y); s.scale.set(Math.max(.01, r) / 31); s.tint = C(col); s.alpha = a;
  }

  function drawFx() {
    const g = fxG; g.clear();
    for (const p of parts) {
      const a = p.life / p.max;
      switch (p.k) {
        case 'dot': dot(p.x, p.y, p.r, p.col, a); break;
        case 'boom': dot(p.x, p.y, p.r * (1.6 - a * .6), a > .55 ? 0xffd84d : a > .3 ? 0xff8a3d : 0x9aa0aa, a); break;
        case 'fire': dot(p.x, p.y, p.r * (.6 + a * .6), a > .6 ? 0xffe066 : a > .3 ? 0xff8a3d : 0xe5574f, a); break;
        case 'smoke': dot(p.x, p.y, p.r * (2 - a), 0x9aa0aa, a * .5); break;
        case 'flash': dot(p.x, p.y, p.r, 0xffe066, a); break;
        case 'ring': g.lineStyle(2, C(O), a * .8).drawCircle(p.x, p.y, Math.max(.1, p.r * (1.15 - a * .5))); break;
        case 'plus':
          g.lineStyle(0).beginFill(0x2fbf6b, a).drawRect(p.x - 1.5, p.y - 5, 3, 10).drawRect(p.x - 5, p.y - 1.5, 10, 3).endFill(); break;
        case 'arrow':
          g.lineStyle(1.4, 0x8a5a2b, Math.min(1, a * 2)).moveTo(p.x, p.y).lineTo(p.x - Math.cos(p.a) * 8, p.y - Math.sin(p.a) * 8); break;
        case 'soul': {
          const r = p.r, x = p.x + Math.sin(p.life * 6) * 2, y = p.y, al = a * .85;
          g.lineStyle(1.2, 0x9aa6b8, al).beginFill(0xffffff, al);
          g.moveTo(x - r, y + r * .6).arc(x, y, r, Math.PI, 0).lineTo(x + r, y + r * .6).lineTo(x + r * .35, y + r * .35)
            .lineTo(x, y + r * .7).lineTo(x - r * .35, y + r * .35).closePath().endFill();
          g.lineStyle(0).beginFill(C(O), al).drawRect(x - r * .35, y - r * .2, r * .18, r * .3).drawRect(x + r * .17, y - r * .2, r * .18, r * .3).endFill();
          break;
        }
      }
    }
    fxPool.finish();
  }

  function clearFx() {
    parts = []; shake = 0;
    dctx.setTransform(1, 0, 0, 1, 0, 0); dctx.clearRect(0, 0, dcv.width, dcv.height);
    decalDirty = true; decalForce = true;
  }
  /* ======================== Ende FX ======================== */

  /* ---------- Overlay: Pinsel und Missionszone ---------- */
  const overlay = { brushX: 0, brushY: 0, brushR: 0, erase: false, missionZoneX: null };
  const overG = new PIXI.Graphics();
  L.overlay.addChild(overG);
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
    if (decalDirty && (decalForce || t - decalUpT >= DECAL_UPLOAD || t < decalUpT)) {
      decalTex.update(); decalUpT = t; decalDirty = false; decalForce = false;
    }
    drawOverlay(world);
    drawUnits(world, t);
    drawProjectiles(world);
    drawFx();
    shake *= .85;
    const sx = RM ? 0 : (Math.random() - .5) * shake, sy = RM ? 0 : (Math.random() - .5) * shake;
    scene.scale.set(cam.zoom);
    scene.position.set((sx - cam.x) * cam.zoom, (sy - cam.y) * cam.zoom);
    app.renderer.render(app.stage);
  }

  function resize(viewW, viewH) { app.renderer.resize(viewW, viewH); }

  return { app, canvas: view, layers: L, resize, markTerrainDirty, draw, setOverlay, event, stepFx, clearFx };
}
