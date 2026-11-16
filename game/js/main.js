// Start, Spielzustand und Schleife. Fester Simulationsschritt 1/60 s, Tempo 1/2/4×, Zeitlupe 0,3×, Pause.
// Leert world.events jedes Bild und reicht sie an Renderer (Gelände, renderer.fx), Audio und UI weiter.
import { UNITS, TERRAIN, CATEGORIES, TEAMS, MISSIONS, PLURAL } from './data.js';
import { createWorld, spawn, rebuildHash, resizeWorld, clearBattle } from './world.js';
import { step, buildMission, missionResult, sandboxWinner, placeRect, placeCircle, tRect, tCircle } from './sim.js';
import { createCamera, resizeCamera } from './camera.js';
import { bindInput } from './input.js';
import { createStroke, stamp, paintTerrain, undo as undoStroke, strokeEmpty, ZONE, PLAYER } from './paint.js';
import { createRenderer } from './render/renderer.js';
import { createAudio, eventSound } from './audio.js';
import { hurt, blast } from './combat.js';
import { createUI } from './ui.js';

const STEP = 1 / 60, SLOW = .3, MAX_STEPS = 6, UNDO_MAX = 40;
const SKEY = 'kritzelschlacht-v1';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------- Speicher ---------- */
let save = { stars: {}, muted: false };
try {
  const s = JSON.parse(localStorage.getItem(SKEY) || 'null');
  if (s && typeof s === 'object') save = Object.assign(save, s);
  if (!save.stars || typeof save.stars !== 'object') save.stars = {};
} catch (e) { /* kein Speicher */ }
function persist() { try { localStorage.setItem(SKEY, JSON.stringify({ stars: save.stars, muted: save.muted })); } catch (e) { /* ignore */ } }

/* ---------- Welt, Kamera, Renderer ---------- */
const host = document.getElementById('app');
const viewport = () => ({ vw: Math.max(280, host.clientWidth || innerWidth), vh: Math.max(280, host.clientHeight || innerHeight) });
// Grundzoom wie früher `zoom`: Einheiten sind in der Standardansicht gleich groß wie im alten Spiel
const baseZoomFor = (vw, vh) => clamp(Math.min(vw / 1400, vh / 820), .55, 1.15);

let { vw, vh } = viewport();
let bz = baseZoomFor(vw, vh);
const world = createWorld(vw / bz, vh / bz, (Math.random() * 2 ** 31) | 0);
const cam = createCamera(vw, vh, world.W, world.H);
const renderer = createRenderer(host);
renderer.resize(vw, vh);
const audio = createAudio();
audio.muted = !!save.muted;

const pointer = { x: -999, y: -999, inside: false, erasing: false };
let stroke = null, undoStack = [], sandSave = null, snap = null;

const markAll = () => renderer.markTerrainDirty(0, 0, world.GW - 1, world.GH - 1);

/* ---------- Spielzustand und Aktionen ---------- */
const game = {
  world, save,
  mission: null,      // { idx, def, budget, par, spent, phase:'plan'|'battle'|'done', t, endT, result }
  sel: 'krieger', cat: 'armee', brush: 48, curTeam: 'blau',
  paused: false, speed: 1, slow: false,

  catKeys: c => (c === 'gelaende' ? Object.keys(TERRAIN) : Object.keys(UNITS).filter(k => UNITS[k].cat === c)),
  catAllowed: c => !(game.mission && game.mission.def.cats && !game.mission.def.cats.includes(c)),
  unlocked: i => i === 0 || (save.stars[i - 1] || 0) > 0,

  setCat(c) {
    if (!game.catAllowed(c)) return;
    game.cat = c;
    if (!game.catKeys(c).includes(game.sel)) game.sel = game.catKeys(c)[0];
    ui.renderUnits();
  },
  select(k) { game.sel = k; ui.renderUnits(); },
  setBrush(v) { game.brush = clamp(Math.round(v), 10, 150); ui.syncBrush(); },
  setTeam(k) { game.curTeam = k; ui.buildChips(); },
  setTeamMode(on) {
    if (game.mission) { ui.updateMode(); return; }
    world.teamMode = !!on; world.contested = false;
    rebuildHash(world); ui.updateMode(); ui.updateCounts();
  },
  togglePause() {
    const m = game.mission;
    if (m && m.phase !== 'battle') return;
    game.paused = !game.paused; ui.updateControls();
  },
  cycleSpeed() { game.speed = game.speed === 1 ? 2 : game.speed === 2 ? 4 : 1; ui.updateControls(); },
  toggleSlow() { game.slow = !game.slow; ui.updateControls(); },
  toggleMute() { audio.init(); save.muted = !save.muted; audio.muted = save.muted; persist(); ui.updateControls(); },

  clear() {
    const m = game.mission;
    if (m) {
      if (m.phase !== 'plan') return;
      world.units = world.units.filter(u => u.team !== PLAYER);
      for (let i = 0; i < world.terr.length; i++) if (world.towner[i]) { world.terr[i] = 0; world.towner[i] = 0; world.whp[i] = 0; }
      m.spent = 0; undoStack.length = 0;
      markAll(); rebuildHash(world); ui.updateMission(); ui.updateCounts();
      return;
    }
    clearWorld(); ui.updateCounts();
  },
  dice() { if (game.mission) return; audio.init(); randomBattle(); ui.closeBanner(); ui.updateCounts(); },

  undo() {
    const m = game.mission;
    if (m && m.phase !== 'plan') return;
    const s = undoStack.pop();
    if (!s) { ui.toast('Nichts zum Rückgängigmachen.'); return; }
    const spent = undoStroke(world, s);
    if (m) m.spent = spent;
    markAll(); ui.updateMission(); ui.updateCounts();
  },

  enterSandbox,
  loadMission,
  go() { const m = game.mission; if (!m) return; if (m.phase === 'plan') startMission(); else if (m.phase === 'battle') retryMission(); },
  retryMission,
  nextMission() { if (game.mission) loadMission(Math.min(MISSIONS.length - 1, game.mission.idx + 1)); },
};

const ui = createUI(game);

/* ---------- Szenen ---------- */
function clearWorld() {
  clearBattle(world);
  world.contested = false;
  world.terr.fill(0); world.towner.fill(0); world.whp.fill(0);
  undoStack.length = 0;
  renderer.fx.clear(); markAll(); rebuildHash(world);
}

function seedDemo() {
  clearWorld();
  tCircle(world, 'wasser', .66, .52, .2); tCircle(world, 'wald', .3, .78, .09);
  placeRect(world, 'krieger', 36, .12, .18, .24, .42, 'blau');
  placeRect(world, 'ritter', 12, .14, .58, .22, .74, 'blau');
  placeRect(world, 'grenadier', 18, .4, .52, .48, .68, 'rot');
  placeRect(world, 'reiter', 9, .42, .12, .52, .26, 'rot');
  placeCircle(world, 'biene', 40, .9, .2, .07, 'gelb');
  placeRect(world, 'schuetze', 14, .86, .62, .92, .84, 'gruen');
  markAll(); rebuildHash(world);
}

function randomBattle() {
  clearWorld();
  const ter = ['wasser', 'wald', 'lava', 'mauer'];
  for (let i = 0; i < 2; i++) {
    const k = ter[Math.random() * ter.length | 0];
    if (k === 'mauer') { const x = rnd(.4, .58), y = rnd(.1, .4); tRect(world, k, x, y, x + .012, y + rnd(.25, .45)); }
    else tCircle(world, k, rnd(.35, .65), rnd(.25, .75), rnd(.06, .14));
  }
  const types = Object.keys(UNITS).filter(k => k !== 'drache');
  const spots = [[.06, .1], [.06, .6], [.78, .1], [.78, .6]];
  const nf = 3 + (Math.random() * 2 | 0), teams = Object.keys(TEAMS);
  for (let i = 0; i < nf; i++) {
    const t = types[Math.random() * types.length | 0], [sx, sy] = spots[i];
    const n = Math.max(2, Math.round(60 / UNITS[t].cost));
    placeRect(world, t, Math.min(n, 60), sx, sy, sx + .14, sy + .28, teams[i]);
    if (Math.random() < .4) {
      const t2 = types[Math.random() * types.length | 0];
      placeRect(world, t2, Math.max(1, Math.min(Math.round(30 / UNITS[t2].cost), 30)), sx + .02, sy + .05, sx + .12, sy + .22, teams[i]);
    }
  }
  if (Math.random() < .25) spawn(world, 'drache', world.W * .5, world.H * .1, teams[Math.random() * nf | 0]);
  markAll(); rebuildHash(world);
}

/* ---------- Sandkasten sichern ---------- */
function saveSandbox() {
  sandSave = {
    units: world.units.filter(u => u.alive).map(u => ({ type: u.type, team: u.team, x: u.x, y: u.y, hp: u.hp })),
    GW: world.GW, GH: world.GH, terr: world.terr.slice(), towner: world.towner.slice(), whp: world.whp.slice(),
    teamMode: world.teamMode,
  };
}

function enterSandbox() {
  ui.hideOverlays();
  if (!game.mission) return;
  game.mission = null; snap = null;
  clearWorld();
  if (sandSave) {
    const s = sandSave, mw = Math.min(s.GW, world.GW), mh = Math.min(s.GH, world.GH);
    world.teamMode = s.teamMode;
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      const a = y * s.GW + x, b = y * world.GW + x;
      world.terr[b] = s.terr[a]; world.towner[b] = s.towner[a]; world.whp[b] = s.whp[a];
    }
    for (const u of s.units) { const n = spawn(world, u.type, clamp(u.x, 6, world.W - 6), clamp(u.y, 6, world.H - 6), u.team); n.hp = u.hp; }
    markAll(); rebuildHash(world);
  } else { world.teamMode = false; seedDemo(); }
  ui.closeBanner(); ui.refresh();
}

/* ---------- Missionen ---------- */
function loadMission(i) {
  if (!game.mission) saveSandbox();
  clearWorld();
  buildMission(world, i);
  const def = MISSIONS[i];
  game.mission = { idx: i, def, budget: def.budget, par: def.par, spent: 0, phase: 'plan', t: 0, endT: -1, result: null };
  game.paused = false;
  if (def.cats && !def.cats.includes(game.cat)) { game.cat = def.cats[0]; game.sel = game.catKeys(game.cat)[0]; }
  markAll();
  ui.closeBanner(); ui.hideOverlays(); ui.resetBattle(); ui.refresh();
}

function startMission() {
  const m = game.mission;
  rebuildHash(world);
  if (!(world.facCount.get(PLAYER) > 0)) { ui.toast('Male zuerst deine Armee.'); return; }
  snap = {
    idx: m.idx, spent: m.spent, GW: world.GW, GH: world.GH,
    units: world.units.filter(u => u.alive && u.team === PLAYER).map(u => ({ type: u.type, x: u.x, y: u.y })),
    terr: world.terr.slice(), towner: world.towner.slice(), whp: world.whp.slice(),
  };
  m.phase = 'battle'; m.t = 0; m.endT = -1; m.result = null;
  undoStack.length = 0; ui.resetBattle(); audio.init();
  ui.updateMission(); ui.updateControls();
}

// "Nochmal planen" / "Besser planen" / "Abbrechen": Mission neu laden und den Plan wiederherstellen
function retryMission() {
  const m = game.mission; if (!m) return;
  if (!snap || snap.idx !== m.idx) { loadMission(m.idx); return; }
  const s = snap;
  loadMission(s.idx);
  if (s.GW === world.GW && s.GH === world.GH) {
    for (let k = 0; k < world.terr.length; k++) if (s.towner[k]) { world.terr[k] = s.terr[k]; world.towner[k] = 1; world.whp[k] = s.whp[k]; }
  }
  for (const u of s.units) spawn(world, u.type, clamp(u.x, 6, world.W - 6), clamp(u.y, 6, world.H - 6), PLAYER);
  game.mission.spent = s.spent; snap = s;
  markAll(); rebuildHash(world); ui.updateMission(); ui.updateCounts();
}

function finishMission() {
  const m = game.mission; if (!m) return;
  const win = m.result === 'win';
  const stars = win ? 1 + (m.spent <= m.par * 1.25 ? 1 : 0) + (m.spent <= m.par ? 1 : 0) : 0;
  if (win) save.stars[m.idx] = Math.max(save.stars[m.idx] || 0, stars);
  persist();
  ui.showResult({ win, timeUp: m.t > 180, stars, spent: m.spent, budget: m.budget, par: m.par, time: m.t, hasNext: m.idx < MISSIONS.length - 1 });
  audio.play(win ? 'win' : 'lose');
}

/* ---------- Malen (Eingabe -> paint.js) ---------- */
const actions = {
  strokeStart() {
    audio.init();
    if (!game.mission) ui.closeBanner();
    stroke = createStroke(game.mission ? game.mission.spent : 0);
    stroke.first = true; stroke.blocked = false;
  },
  paintAt(wx, wy, erase) {
    if (!stroke) return;
    const m = game.mission;
    if (stroke.first) {
      stroke.first = false;
      if (m && m.phase !== 'plan') { ui.toast(m.phase === 'battle' ? 'Während des Kampfes wird nicht gemalt.' : 'Plane neu, um weiter zu malen.'); stroke.blocked = true; }
      else if (m && wx > world.W * ZONE) { ui.toast('Male nur links der gestrichelten Linie.'); stroke.blocked = true; }
    }
    if (stroke.blocked) return;
    pointer.erasing = erase;
    const sel = erase ? 'radierer' : game.sel, phase = m ? m.phase : null;
    if (TERRAIN[sel]) {
      const r = paintTerrain(world, stroke, wx, wy, game.brush, sel, m, phase);
      if (r.changed) { const c = r.cells; renderer.markTerrainDirty(c.gx0, c.gy0, c.gx1, c.gy1); ui.updateMission(); }
      if (r.warning) ui.toast(r.warning);
    } else {
      const r = stamp(world, stroke, wx, wy, game.brush, sel, game.curTeam, m, phase);
      if (r.placed) { audio.play('pop'); ui.updateMission(); }
      if (r.warning) ui.toast(r.warning);
    }
  },
  strokeEnd() {
    pointer.erasing = false;
    if (stroke && !stroke.blocked && !strokeEmpty(stroke)) {
      undoStack.push(stroke);
      if (undoStack.length > UNDO_MAX) undoStack.shift();
    }
    stroke = null;
    ui.updateCounts();
  },
  brushDelta(d) { game.setBrush(game.brush + d); },
  brushRadius: () => game.brush,
  setCat(dir) {
    const order = CATEGORIES.map(c => c[0]).filter(game.catAllowed);
    let i = order.indexOf(game.cat); if (i < 0) i = 0;
    game.setCat(order[(i + (dir > 0 ? 1 : order.length - 1)) % order.length]);
  },
  pickSlot(n) { const t = game.catKeys(game.cat)[n - 1]; if (t) game.select(t); },
  eraser() { if (game.catAllowed('gelaende')) { game.cat = 'gelaende'; game.sel = 'radierer'; ui.renderUnits(); } },
  undo: () => game.undo(),
  togglePause: () => game.togglePause(),
  hover(wx, wy, inside) { pointer.x = wx; pointer.y = wy; pointer.inside = inside; },
};

/* ---------- Schleife ---------- */
function drainEvents() {
  const ev = world.events;
  renderer.consume(ev);        // Gelände-Änderungen und Effekte (fx.js, mit Budget je Bild)
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    const k = eventSound(e);   // sound-Ereignisse und die Physik-Geräusche land/impact, splash, crash
    if (k) audio.play(k);
    ui.onEvent(e);
  }
  ev.length = 0;
}

function simStep() {
  step(world, STEP);
  const m = game.mission;
  if (m) {
    if (m.phase === 'battle') {
      m.t += STEP;
      const r = missionResult(world, m.t);
      if (r) { m.result = r; m.endT = 1.4; m.phase = 'done'; ui.updateMission(); }
    }
  } else {
    const f = sandboxWinner(world);
    if (f) ui.banner(world.teamMode ? `Team ${TEAMS[f].n} gewinnt!` : `${PLURAL[f] || UNITS[f].n} gewinnen!`);
  }
}

let acc = 0, last = performance.now(), uiT = 0;
const fpsBox = new URLSearchParams(location.search).has('fps') ? document.createElement('div') : null;
let fpsN = 0, fpsT = 0;
if (fpsBox) { fpsBox.className = 'fps'; fpsBox.textContent = '… fps'; host.append(fpsBox); }

function frame(now) {
  const realDt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
  const m = game.mission;
  const ts = (game.slow ? SLOW : 1) * game.speed * (m && m.endT >= 0 ? .35 : 1);
  if (!game.paused && !(m && m.phase === 'plan')) {
    acc += realDt * ts;
    let n = 0;
    while (acc >= STEP && n < MAX_STEPS) { simStep(); acc -= STEP; n++; }
    if (n >= MAX_STEPS) acc = 0;
    drainEvents();
    renderer.fx.update(realDt * ts, world);
  } else {
    drainEvents();
    renderer.fx.update(realDt * .5, null);
  }
  if (m && m.endT >= 0) { m.endT -= realDt; if (m.endT < 0) { m.endT = -1; finishMission(); } }

  const canPaint = !(m && m.phase !== 'plan');
  renderer.setOverlay({
    brushX: pointer.x, brushY: pointer.y, brushR: pointer.inside && canPaint ? game.brush : 0,
    erase: game.sel === 'radierer' || pointer.erasing,
    missionZoneX: m && m.phase === 'plan' ? world.W * ZONE : null,
  });
  renderer.draw(world, cam, now / 1000);

  uiT -= realDt; if (uiT <= 0) { uiT = .25; ui.updateCounts(); }
  if (fpsBox) {
    fpsN++; fpsT += realDt;
    if (fpsT >= .5) { fpsBox.textContent = `${Math.round(fpsN / fpsT)} fps · ${world.totalAlive} Einheiten`; fpsN = 0; fpsT = 0; }
  }
  requestAnimationFrame(frame);
}

/* ---------- Größe ---------- */
function onResize() {
  const v = viewport();
  if (v.vw === vw && v.vh === vh) return;
  vw = v.vw; vh = v.vh; bz = baseZoomFor(vw, vh);
  resizeWorld(world, vw / bz, vh / bz);
  resizeCamera(cam, vw, vh, world.W, world.H);
  renderer.resize(vw, vh);
  undoStack.length = 0;
  markAll();
}
let resizeQueued = false;
const queueResize = () => { if (resizeQueued) return; resizeQueued = true; requestAnimationFrame(() => { resizeQueued = false; onResize(); }); };
window.addEventListener('resize', queueResize);
if (typeof ResizeObserver === 'function') new ResizeObserver(queueResize).observe(host);

/* ---------- Start ---------- */
// Nur mit ?debug: Zugriff für Prüfungen in der Konsole (Abbildung Bildschirm <-> Welt usw.).
// scene(name) baut eine Prüfszene im Sandkasten: 'grenades', 'tank', 'heli', 'walls', 'water', 'dragon', 'prone', 'bosses';
// crashHeli() schießt alle Hubschrauber ab, boom(x, y[, R]) zündet eine Explosion ohne Schützen.
// Boss-Sticker (Task 12c): renderer.debugRig().bosses (turretRot, rotorRot, wingPhase, tailSwing ... je gezeichnetem Boss),
// fx.debug().boss (Abgas, Rotorwind-Staub). Zähler des letzten Bilds: renderer.debugPhysics() (dazu stances: Haltung der MG-Schützen und Scharfschützen); Effekte: fx.debug() (Partikel je Art, Sprites je
// Container und Mischung, Deckel, Wackeln, Decals, Rauchdrift; fire: Flammenstrahl- und Brand-Partikel).
const scenes = {
  grenades() { world.teamMode = true; placeRect(world, 'krieger', 40, .4, .3, .5, .7, 'blau'); placeRect(world, 'grenadier', 16, .72, .35, .78, .65, 'rot'); },
  tank() { world.teamMode = true; placeRect(world, 'soldat', 36, .42, .3, .5, .7, 'blau'); spawn(world, 'panzer', world.W * .72, world.H * .5, 'rot'); },
  heli() { world.teamMode = true; spawn(world, 'heli', world.W * .5, world.H * .45, 'rot'); placeRect(world, 'krieger', 12, .46, .5, .54, .6, 'blau'); placeRect(world, 'panzerfaust', 4, .2, .4, .24, .6, 'blau'); },
  walls() { world.teamMode = true; tRect(world, 'mauer', .5, .25, .512, .75); placeRect(world, 'grenadier', 12, .62, .38, .66, .62, 'rot'); placeRect(world, 'krieger', 24, .3, .38, .36, .62, 'blau'); },
  water() {
    world.teamMode = true; tCircle(world, 'wasser', .5, .5, .18); tCircle(world, 'lava', .2, .5, .08);
    placeRect(world, 'krieger', 30, .44, .4, .56, .6, 'blau'); placeRect(world, 'krieger', 8, .18, .45, .22, .55, 'blau');
    placeRect(world, 'grenadier', 10, .8, .4, .84, .6, 'rot');
  },
  // Drachenfeuer (Spez. #21): ein Drache gegen einen dichten Bienenschwarm (60, Radius 40 px; fängt gut
  // Feuer) und eine verteilte Kriegerreihe (Abstand 40 px; Feuer springt nicht über)
  dragon() {
    world.teamMode = true;
    spawn(world, 'drache', world.W * .62, world.H * .5, 'rot');
    placeCircle(world, 'biene', 60, .4, .3, 40 / world.H, 'blau');
    for (let i = 0; i < 9; i++) spawn(world, 'krieger', world.W * .4, Math.min(world.H - 8, world.H * .72 - 160 + i * 40), 'blau');
  },
  // Liegen (Spez. #22): 4 MG-Schützen und 3 Scharfschützen gegen Schützen 260 px vor den MGs (die MGs
  // gehen etwas vor und legen sich hin, die Scharfschützen sofort). Von weit rechts stürmen 10 Krieger
  // heran (gut 10 s): wer sie näher als 140 px hat, steht erst auf (0,8 s ohne Schuss).
  prone() {
    world.teamMode = true;
    const x0 = world.W * .22, cy = world.H * .5;
    for (let i = 0; i < 4; i++) spawn(world, 'mg', x0, cy - 90 + i * 60, 'blau');
    for (let i = 0; i < 3; i++) spawn(world, 'sniper', x0 - 70, cy - 70 + i * 70, 'blau');
    placeRect(world, 'schuetze', 8, (x0 + 260) / world.W, .4, (x0 + 290) / world.W, .6, 'rot');
    placeRect(world, 'krieger', 10, Math.min(.95, (x0 + 700) / world.W), .35, Math.min(.98, (x0 + 740) / world.W), .65, 'rot');
  },
  // Boss-Sticker (Spez. #23): je Team 2 Panzer, 2 Hubschrauber und 1 Drache, dazu etwas Infanterie;
  // die Bosse fahren bzw. fliegen aufeinander zu (Turm dreht, Ketten laufen, Abgas, Rotorwind, Flügelschlag)
  bosses() {
    world.teamMode = true;
    for (const [team, x, s] of [['blau', .16, 1], ['rot', .84, -1]]) {
      spawn(world, 'panzer', world.W * x, world.H * .32, team); spawn(world, 'panzer', world.W * x, world.H * .68, team);
      spawn(world, 'heli', world.W * (x + s * .06), world.H * .4, team); spawn(world, 'heli', world.W * (x + s * .06), world.H * .6, team);
      spawn(world, 'drache', world.W * (x - s * .05), world.H * .5, team);
      const a = x + s * .1, b = x + s * .13, c = x + s * .02, d = x + s * .04;
      placeRect(world, 'soldat', 8, Math.min(a, b), .42, Math.max(a, b), .58, team);
      placeRect(world, 'panzerfaust', 3, Math.min(c, d), .45, Math.max(c, d), .55, team);
    }
  },
};
if (new URLSearchParams(location.search).has('debug')) {
  window.__kritzel = {
    world, cam, renderer, fx: renderer.fx, game, ui, audio, actions,
    scene(name) {
      if (!scenes[name]) return Object.keys(scenes);
      if (game.mission) game.enterSandbox();
      clearWorld(); scenes[name](); markAll(); rebuildHash(world); ui.closeBanner(); ui.refresh();
      return name;
    },
    crashHeli() { let n = 0; for (const u of world.units) if (u.alive && u.type === 'heli') { hurt(world, u, 1e9, 'rocket', null); n++; } return n; },
    boom(x, y, R = 50) { blast(world, x, y, R, 40, null, null, 'blast', 2); },
  };
}
seedDemo();
ui.refresh();
bindInput(renderer.canvas, cam, actions);
requestAnimationFrame(t => { last = t; frame(t); });
