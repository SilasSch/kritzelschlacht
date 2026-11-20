// Effekte (Task 12, Spez. #14): zeichnet die Partikel aus fxcore.js, malt Decals (Krater, Asche, Flecken)
// und liefert das Bildschirmwackeln. createFx(renderer) mit renderer.layers (Ebenen des Renderers).
//   consume(events)  Ereignisse eines Bilds (world.events) → Partikel, Decals, Wackeln
//   update(dt[, world])  Partikel altern lassen (Spielzeit), Flugspuren der Geschosse aus world.proj
//   frame(t, simT)  pro Bild vor dem Rendern: Sprites setzen, Decals hochladen, Wackeln abklingen lassen (Echtzeit t)
//             und den Versatz { x, y } zurückgeben; die Decals altern mit der Spielzeit simT (world.time)
//   resize(W, H, res)  Weltgröße / Auflösung der Decal-Leinwand (leert sie)
//   autoLod(workMs, frameMs)  Arbeitszeit und Bildabstand (ms) an den Detailregler (fxcore.createLodGovernor); setLod(n | null) legt die
//             Stufe fest (null: wieder automatisch); lod = aktuelle Stufe (Task 13)
//   clear(), debug(), shake (Zahl)
// Partikel liegen in QuadBatches (quads.js, Task 13; vorher ParticleContainer), alle aus einem Atlas:
//   warm  (Ebene 'light', normal): warme Scheibe #ffb347 der Explosionen, auch auf Weiß sichtbar (0.35 → 0)
//   light (Ebene 'light', additiv): Bodenlicht der Explosionen (auf farbigem Boden)
//   halo  (Ebene 'fx', normal): kleiner warmer Halo um Mündungsblitze und Feuer (auch Flammenstrahl, Brand)
//   glow  (Ebene 'fx', additiv): weiches Glühen von Feuer, Explosion, Mündungsblitz, Flammenstrahl, Funken
//   main  (Ebene 'fx', normal): Kerne, Rauch, Staub, Tropfen, Ringe, Pluszeichen, Seelchen, Pfeile, Hitzeflimmern
// Keine Filter, kein Dauerglühen: alles Licht lebt höchstens so lange wie sein Partikel (Bodenlicht 0.25 s).
/* global PIXI */
import { createFxCore, createLodGovernor, createDecalAger, look, F, FRAME_R, FX_CAP, LOD_MAX } from './fxcore.js';
import { createQuadBatch } from './quads.js';

const RM = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const TAU = Math.PI * 2;
const O = '#2a2a33';
const CELL = 64, STRIDE = 68;                       // Atlas: 64-px-Felder mit 4 px Abstand
const N_FRAMES = FRAME_R.length;
const DECAL_UPLOAD = .1;                            // Decal-Upload höchstens alle 0,1 s
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
  // warm: warmes Licht, einmal gebacken; weiß (tint #ffb347), gleichmäßig bis zum Rand auf 0
  x = cx(F.warm); g = c.createRadialGradient(x, cy, 0, x, cy, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.45, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
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
  // streak: weißer Strich mit runden Enden (Querstrich und Splitter beim Schildblock, per tint gefärbt)
  x = cx(F.streak); c.strokeStyle = '#fff'; c.lineWidth = 9;
  c.beginPath(); c.moveTo(x - 25, cy); c.lineTo(x + 25, cy); c.stroke();
  // pilum: steckender Speer mit Umriss, Spitze rechts (Anker x = 1): Holzschaft, Eisenschaft, Spitze
  x = cx(F.pilum); c.lineCap = 'butt';
  c.strokeStyle = O; c.lineWidth = 9; c.beginPath(); c.moveTo(x - 30, cy); c.lineTo(x + 22, cy); c.stroke();
  c.strokeStyle = '#c9a26b'; c.lineWidth = 5; c.beginPath(); c.moveTo(x - 28.5, cy); c.lineTo(x + 2, cy); c.stroke();
  c.strokeStyle = '#9aa3ae'; c.lineWidth = 3.5; c.beginPath(); c.moveTo(x + 2, cy); c.lineTo(x + 21, cy); c.stroke();
  c.fillStyle = '#e6ebf0'; c.strokeStyle = O; c.lineWidth = 2; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(x + 18, cy - 5); c.lineTo(x + 30.5, cy); c.lineTo(x + 18, cy + 5); c.closePath(); c.fill(); c.stroke();
  // wave: dünner Ring für die großen Wellen der Fähigkeiten (bleibt auch bei 90 px Radius ein feiner Strich)
  c.strokeStyle = '#fff'; c.lineWidth = 1.8; c.beginPath(); c.arc(cx(F.wave), cy, 28, 0, TAU); c.stroke();
  // note: Achtelnote (Kopf, Hals, Fähnchen), per tint gefärbt
  x = cx(F.note); c.fillStyle = '#fff'; c.strokeStyle = '#fff'; c.lineCap = 'round';
  c.beginPath(); c.ellipse(x - 7, cy + 17, 10, 7.5, -.45, 0, TAU); c.fill();
  c.lineWidth = 5; c.beginPath(); c.moveTo(x + 2, cy + 15); c.lineTo(x + 2, cy - 27); c.stroke();
  c.lineWidth = 6; c.beginPath(); c.moveTo(x + 2, cy - 27); c.quadraticCurveTo(x + 20, cy - 18, x + 15, cy - 4); c.stroke();
  // bang: Ausrufezeichen (Schreck), per tint gefärbt
  x = cx(F.bang); c.fillStyle = '#fff';
  c.beginPath(); c.moveTo(x - 7, cy - 28); c.lineTo(x + 7, cy - 28); c.lineTo(x + 4, cy + 10); c.lineTo(x - 4, cy + 10); c.closePath(); c.fill();
  c.beginPath(); c.arc(x, cy + 22, 6, 0, TAU); c.fill();
}

export function createFx(renderer) {
  const L = renderer.layers;

  /* ---------- Atlas und Container ---------- */
  const acv = document.createElement('canvas');
  acv.width = STRIDE * N_FRAMES; acv.height = STRIDE;
  paintAtlas(acv.getContext('2d'));
  const base = new PIXI.BaseTexture(acv, { mipmap: PIXI.MIPMAP_MODES.OFF });
  const tex = FRAME_R.map((_, i) => new PIXI.Texture(base, new PIXI.Rectangle(i * STRIDE + 2, 2, CELL, CELL)));

  // Je Ebene eine QuadBatch (gezeichnet werden nur die belegten Vierecke, in Entstehungsreihenfolge)
  function makePC(layer, blend, name) {
    const q = createQuadBatch(name, blend);
    layer.addChild(q);
    return { q, n: 0, blend };
  }
  const under = makePC(L.light, PIXI.BLEND_MODES.NORMAL, 'fxUnder');  // am Boden unter den Figuren (Wasserringe, Nachtrag 7)
  const warm = makePC(L.light, PIXI.BLEND_MODES.NORMAL, 'fxWarm');   // warmes Licht unter dem additiven
  const light = makePC(L.light, PIXI.BLEND_MODES.ADD, 'fxLight');
  const halo = makePC(L.fx, PIXI.BLEND_MODES.NORMAL, 'fxHalo');
  const glow = makePC(L.fx, PIXI.BLEND_MODES.ADD, 'fxGlow');        // unter den Kernen: Kerne behalten ihre Farbe
  const main = makePC(L.fx, PIXI.BLEND_MODES.NORMAL, 'fxMain');

  function put(g, t, x, y, scale, rot, tint, alpha, ax, sy = 1) {
    if (g.n >= FX_CAP) return;
    if (g.n === 0) g.q.clear();
    g.n++;
    g.q.addPart(t, null, x, y, rot, scale, scale * sy, ax, .5, tint, alpha);
  }
  // Ende des Bilds: Anzahl zurückgeben, leere Ebenen leeren
  function finish(g) {
    if (g.n === 0) g.q.clear();
    const n = g.n; g.n = 0;
    return n;
  }

  /* ---------- Decals (zwei Offscreen-Leinwände wie das Gelände, Upload gedrosselt) ----------
     Gemalt wird nur auf cur; old zeigt die vorige Generation und blendet aus (createDecalAger, Spielzeit): ein Fleck
     lebt 30-60 s. Beim Tausch wird nur hochgeladen, was sich geändert hat: die bisherige cur nur mit ausstehenden
     Strichen (decalDirty), die gelöschte Leinwand nur, wenn ihre Generation Decals hatte (oldN). old ist unsichtbar
     (visible = false, kein Zeichnen), solange sie fast ausgeblendet ist (< OLD_MIN_ALPHA) oder leer war. */
  const mkLayer = () => { const cv = document.createElement('canvas'); return { cv, ctx: cv.getContext('2d'), tex: null, sprite: new PIXI.Sprite() }; };
  let cur = mkLayer(), old = mkLayer(), dctx = cur.ctx;
  const ager = createDecalAger(30);
  let res = 0, prevW = 0, prevH = 0, decalDirty = false, decalForce = false, decalUpT = -1, decalCount = 0, decalUploads = 0;
  let curN = 0, oldN = 0;   // Decals je Generation (auf cur bzw. old gemalt)
  const OLD_MIN_ALPHA = .02, DECAL_MAX_RES = 1.5;
  L.decals.addChild(old.sprite, cur.sprite);   // alte Generation unten
  old.sprite.alpha = 0; old.sprite.visible = false;

  function resize(W, H, r) {
    const nr = Math.min(DECAL_MAX_RES, r);
    const sameWorld = W === prevW && H === prevH;
    if (sameWorld && nr === res) return;
    const nw = Math.ceil(W * nr), nh = Math.ceil(H * nr);
    const keep = sameWorld && (curN > 0 || oldN > 0);
    for (const d of [cur, old]) {
      let tmp = null;
      if (keep && d.cv.width > 0 && d.cv.height > 0) {
        tmp = document.createElement('canvas');
        tmp.width = d.cv.width; tmp.height = d.cv.height;
        tmp.getContext('2d').drawImage(d.cv, 0, 0);
      }
      d.cv.width = nw; d.cv.height = nh;
      if (tmp) { d.ctx.setTransform(1, 0, 0, 1, 0, 0); d.ctx.drawImage(tmp, 0, 0, nw, nh); }
      if (d.tex) d.tex.destroy(true);
      d.tex = PIXI.Texture.from(d.cv);
      d.sprite.texture = d.tex; d.sprite.scale.set(1 / nr);
    }
    res = nr; prevW = W; prevH = H;
    if (!keep) {
      ager.reset(); old.sprite.alpha = 0; old.sprite.visible = false;
      decalDirty = false; decalForce = false; decalCount = 0; curN = 0; oldN = 0;
    } else {
      decalDirty = false; decalForce = false;
    }
  }
  // Fleck: drei verschobene flache Ellipsen (wie im alten Spiel)
  function decal(x, y, r, col, a) {
    if (!res) return;
    const c = dctx; c.setTransform(res, 0, 0, res, 0, 0); c.globalAlpha = a; c.fillStyle = col;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(x + rnd(-r, r) * .5, y + rnd(-r, r) * .3, r * rnd(.4, .8), r * rnd(.22, .42), 0, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
    decalDirty = true; decalCount++; curN++;
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
    decalDirty = true; decalCount++; curN++;
  }

  const core = createFxCore({ decal, crater });

  /* ---------- Detailstufe (Task 13): automatisch aus der Arbeitszeit je Bild, oder fest per setLod ---------- */
  const gov = createLodGovernor();
  let lodFixed = null, lodChanges = 0;
  function autoLod(ms, frameMs) {
    const lv = gov.update(ms, frameMs), want = lodFixed === null ? lv : lodFixed;
    if (want !== core.lod) { core.lod = want; lodChanges++; }
    return core.lod;
  }
  function setLod(n) {
    lodFixed = n === null || n === undefined ? null : Math.max(0, Math.min(LOD_MAX, n | 0));
    core.lod = lodFixed === null ? gov.level : lodFixed;
    return core.lod;
  }

  /* ---------- Bild ---------- */
  const LK = {}, off = { x: 0, y: 0 };
  let maxWarm = 0;
  let lastT = -1, nUnder = 0, nMain = 0, nGlow = 0, nLight = 0, nWarm = 0, nHalo = 0;
  function frame(t, simT = 0) {
    const dt = lastT < 0 || t < lastT ? 0 : Math.min(.1, t - lastT);
    lastT = t;
    core.decay(dt);   // Wackeln klingt je Sekunde ab, nicht je Bild
    if (cur.tex && ager.at(simT)) {
      // Generationen tauschen: die alte Leinwand wird gelöscht und zur neuen cur, die bisherige cur wird old
      const clearOld = oldN > 0;
      if (clearOld) { old.ctx.setTransform(1, 0, 0, 1, 0, 0); old.ctx.clearRect(0, 0, old.cv.width, old.cv.height); }
      const t0 = cur; cur = old; old = t0; dctx = cur.ctx;
      // die ausblendende alte Generation liegt immer unter der neuen (die Sprites tauschen nur die Rollen)
      L.decals.setChildIndex(old.sprite, 0);
      cur.sprite.alpha = 1; cur.sprite.visible = true;
      // hochladen nur, was sich geändert hat: ausstehende Striche der bisherigen cur, die gelöschte Leinwand
      if (decalDirty) { old.tex.update(); decalUploads++; }
      if (clearOld) { cur.tex.update(); decalUploads++; }
      oldN = curN; curN = 0;
      decalDirty = false; decalForce = false; decalUpT = t;
    }
    const oa = ager.oldAlpha();
    old.sprite.alpha = oa; old.sprite.visible = oldN > 0 && oa >= OLD_MIN_ALPHA;
    if (cur.tex && decalDirty && (decalForce || t - decalUpT >= DECAL_UPLOAD || t < decalUpT)) {
      cur.tex.update(); decalUpT = t; decalDirty = false; decalForce = false; decalUploads++;
    }
    const live = core.store.live;
    maxWarm = 0;
    for (let i = 0; i < live.length; i++) {
      look(live[i], LK);
      if (LK.wAlpha > maxWarm) maxWarm = LK.wAlpha;
      if (LK.wAlpha > .004) put(LK.wGround ? warm : halo, tex[F.warm], LK.x, LK.y, LK.wR / FRAME_R[F.warm], 0, LK.wTint, LK.wAlpha, .5);
      if (LK.alpha > .004) put(LK.under ? under : main, tex[LK.frame], LK.x, LK.y, Math.max(.001, LK.r) / FRAME_R[LK.frame], LK.rot, LK.tint, LK.alpha, LK.ax, LK.sy);
      if (LK.gAlpha > .004) put(LK.gLight ? light : glow, tex[F.soft], LK.x, LK.y, LK.gR / FRAME_R[F.soft], 0, LK.gTint, LK.gAlpha, .5);
    }
    nUnder = finish(under); nMain = finish(main); nGlow = finish(glow); nLight = finish(light); nWarm = finish(warm); nHalo = finish(halo);
    const s = RM ? 0 : core.shake;
    off.x = s ? (Math.random() - .5) * s : 0; off.y = s ? (Math.random() - .5) * s : 0;
    return off;
  }

  function clear() {
    core.clear();
    for (const d of [cur, old]) { d.ctx.setTransform(1, 0, 0, 1, 0, 0); d.ctx.clearRect(0, 0, d.cv.width, d.cv.height); }
    ager.reset(); old.sprite.alpha = 0; old.sprite.visible = false;
    if (old.tex) old.tex.update();
    decalDirty = true; decalForce = true; decalCount = 0; curN = 0; oldN = 0;
  }

  // Für Prüfungen (?debug: window.__kritzel.fx.debug()): lebende Partikel je Art, Sprites des letzten
  // Bilds je Container (main/warm/halo normal, glow/light additiv), Deckel, Budget-Auslassungen, Wackeln, Decals,
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
      sprites: { under: nUnder, main: nMain, glow: nGlow, light: nLight, warm: nWarm, halo: nHalo },
      blend: { main: main.blend, glow: glow.blend, light: light.blend, warm: warm.blend, halo: halo.blend },
      // warme Lichter des letzten Bilds: Bodenlicht-Scheiben (warm) und Halos (halo) mit ihrer größten Deckkraft
      warmLights: { ground: nWarm, halos: nHalo, maxAlpha: r2(maxWarm) },
      dropped: st.dropped, skipped: st.skipped, lights: st.lights,
      shake: r2(core.shake), decals: decalCount, decalUploads,
      smoke: n ? { n, dx: r2(dx / n), dy: r2(dy / n), age: r2(age / n) } : { n: 0 },
      // Drachenfeuer (Spez. #21): Partikel des Flammenstrahls (jet, Funken, Hitzeflimmern) und der
      // brennenden Einheiten (Flammen, Rauchfaden); burning = im letzten Bild bedient (≤ BURN_FX_UNITS),
      // burningAll = alle brennenden; skippedJet = Atemstöße über dem Budget je Bild (seit clear)
      fire: {
        jet: byKind.jet || 0, sparks: byKind.spark || 0, haze: byKind.haze || 0,
        flames: byKind.flame || 0, wisps: byKind.wisp || 0,
        burning: st.burning, burningAll: st.burningAll, skippedJet: st.skipped.jet || 0,
      },
      // Boss-Effekte (Task 12c): Abgas beim Anfahren, Rotorwind- und Flügelböen-Staub; bosses = im letzten
      // Bild bediente Bosse (≤ BOSS_FX_UNITS), bossesAll = alle lebenden
      boss: { exhaust: byKind.exhaust || 0, wash: byKind.wash || 0, bosses: st.bosses, bossesAll: st.bossesAll },
      filters,
      // Detailstufe (Task 13): level 0 voll, 1 = Rauch aus und Partikel ×0,5; auto: Regler aktiv (sonst fest
      // per setLod); emaMs: gleitende Bilddauer; changes: Stufenwechsel; skipped: seit clear ausgelassene Partikel
      lod: { level: core.lod, auto: lodFixed === null, emaMs: r2(gov.ema), changes: lodChanges, skipped: st.lodSkipped },
    };
  }

  return {
    consume: core.consume, update: core.update, frame, resize, clear, debug, autoLod, setLod,
    get lod() { return core.lod; },
    get shake() { return core.shake; },
    set shake(v) { core.shake = v; },
  };
}
