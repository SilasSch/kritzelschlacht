// Start, Spielzustand und Schleife. Fester Simulationsschritt 1/60 s, Tempo 1/2/4×, Zeitlupe 0,3×, Pause.
// Leert world.events jedes Bild und reicht sie an Renderer (Gelände, renderer.fx), Audio und UI weiter.
import { UNITS, TERRAIN, CATEGORIES, TEAMS, MISSIONS, PLURAL } from './data.js';
import { createWorld, spawn, rebuildHash, resizeWorld, clearBattle, touchTerrain } from './world.js';
import { step, SIM_PHASES, SIM_TIME, buildMission, missionResult, sandboxWinner, placeRect, placeCircle, tRect, tCircle } from './sim.js';
import { createCamera, resizeCamera } from './camera.js';
import { bindInput } from './input.js';
import { createStroke, stamp, paintTerrain, undo as undoStroke, strokeEmpty, zoneX, PLAYER } from './paint.js';
import { createRenderer } from './render/renderer.js';
import { createAudio, eventSound } from './audio.js';
import { hurt, blast } from './combat.js';
import { FORM } from './formation.js';
import { createUI } from './ui.js';
import { buildBench } from './bench.js';
import { createRng } from './rng.js';
import { SAVE_KEY, parseSave, serializeSave } from './save.js';

const STEP = 1 / 60, SLOW = .3, MAX_STEPS = 6, UNDO_MAX = 40;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------- Speicher ---------- */
let save;
try { save = parseSave(localStorage.getItem(SAVE_KEY)); } catch (e) { save = parseSave(null); /* kein Speicher */ }
function persist() { try { localStorage.setItem(SAVE_KEY, serializeSave(save)); } catch (e) { /* ignore */ } }

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

// Ganzes Gelände neu zeichnen und die Wegfindung neu rechnen lassen (nach jeder Änderung an world.terr hier)
const markAll = () => { touchTerrain(world); renderer.markTerrainDirty(0, 0, world.GW - 1, world.GH - 1); };

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
      else if (m && wx > zoneX(world)) { ui.toast('Male nur links der gestrichelten Linie.'); stroke.blocked = true; }
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
  // offenes Lexikon (Dialog): keine Tastenkürzel (input.js); Esc schließt es (ui.js)
  keysBlocked: () => ui.lexiconOpen(),
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
  if (bench && bench.tick) bench.tick(bench.k++);   // ?bench&scenario=blastcrowd: Salven im Takt der Schritte
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
const params = new URLSearchParams(location.search);

/* ---------- Leistungsprobe ?bench=N (Task 13) ----------
   Baut die Szene aus bench.js (mixed mit N Einheiten; &scenario=blastcrowd: Bienenschwarm mit Salven) im
   Sandkasten und zeigt oben links fps, Sim-ms und Render-ms je Bild, die Bilddauer (Mittel und Spitze), die
   Einheiten und die Fx-Detailstufe. Die Anzeige ist maschinenlesbar (key=value), dazu jede Sekunde
   window.__bench = { fps, simMs, simStepMs, steps, renderMs, frameMs, frameMaxMs, units, lod, t, scenario,
   history (eine Zeile je Sekunde), summary(fromSec), restart() }. Sim-ms: alle Simulationsschritte des Bilds;
   Render-ms: der Rest der Arbeit im Bild (Ereignisse, Effekte, Zeichnen); Bilddauer: Abstand der Bilder. */
const benchN = params.has('bench') ? clamp(parseInt(params.get('bench'), 10) || 2000, 4, 10000) : 0;
const benchScen = params.get('scenario') === 'blastcrowd' ? 'blastcrowd' : 'mixed';
const BENCH_HISTORY = 600;
let bench = null, benchBox = null;

// Szene (neu) aufbauen und die Messung von vorn beginnen; mit ?debug auch als __kritzel.bench(n, scenario)
function startBench(n = benchN || 2000, scenario = benchScen) {
  if (!benchBox) { benchBox = document.createElement('div'); benchBox.className = 'fps'; benchBox.textContent = 'bench …'; host.append(benchBox); }
  if (game.mission) game.enterSandbox();
  clearWorld();
  // &seed=N: feste Saat, damit Szene und Verlauf (die Simulation) bei jedem Lauf gleich sind
  const seed = parseInt(params.get('seed'), 10);
  if (Number.isFinite(seed)) world.rng = createRng(seed);
  const tick = buildBench(world, scenario, n);
  markAll(); rebuildHash(world); ui.closeBanner(); ui.refresh();
  const hist = bench ? bench.out.history : [];
  hist.length = 0;
  bench = { tick, k: 0, t: 0, n: 0, sim: 0, steps: 0, render: 0, frame: 0, frameMax: 0, boxN: 0, boxT: 0, boxSim: 0, boxRender: 0, boxFrame: 0,
    scenario, out: { scenario, fps: 0, simMs: 0, simStepMs: 0, steps: 0, renderMs: 0, frameMs: 0, frameMaxMs: 0, units: 0, lod: 0, t: 0,
      history: hist, summary: benchSummary, measure: benchMeasure, restart: () => startBench(n, scenario) } };
  window.__bench = bench.out;
  return scenario;
}
// Messung mit angehaltener Schleife: warm Schritte (mit Zeichnen) vorweg, dann frames Bilder je aus einem
// Schritt + Ereignissen + fx.update (simFx), renderer.prepare (draw, JS), renderer.present (render: PIXI
// durchläuft und bündelt die Szene) und gl.finish (gpuWait). Liefert avg/p95 je Teil, die Teile von draw
// (drawParts), die Anzeigeobjekte je Ebene (counts) und den Zustand der Szene.
function benchMeasure(frames = 60, opt = {}) {
  const warm = opt.warm ?? 30, wasPaused = game.paused;
  game.paused = true;
  let t = performance.now() / 1000;
  // simFx = Schritt (sim, je Teil aus sim.SIM_TIME) + Ereignisse (events) + fx.update (fxUpdate)
  const SF = { sim: 0, events: 0, fxUpdate: 0 };
  const one = () => {
    const a = performance.now(); simStep();
    const b = performance.now(); drainEvents();
    const c = performance.now(); renderer.fx.update(STEP, world);
    SF.sim += b - a; SF.events += c - b; SF.fxUpdate += performance.now() - c;
  };
  for (let i = 0; i < warm; i++) { one(); renderer.draw(world, cam, t += STEP); }
  SF.sim = SF.events = SF.fxUpdate = 0;
  const ms0 = Float64Array.from(SIM_TIME.ms);
  const S = { simFx: [], draw: [], render: [], gpuWait: [], total: [] }, parts = {};
  for (let i = 0; i < frames; i++) {
    const a = performance.now(); one();
    const b = performance.now(); renderer.prepare(world, cam, t += STEP);
    const c = performance.now(); renderer.present();
    const d = performance.now(); renderer.gpuFinish();
    const e = performance.now();
    S.simFx.push(b - a); S.draw.push(c - b); S.render.push(d - c); S.gpuWait.push(e - d); S.total.push(e - a);
    for (const k in renderer.prepMs) parts[k] = (parts[k] || 0) + renderer.prepMs[k] / frames;
  }
  game.paused = wasPaused;
  const simParts = {};
  for (const k in SF) simParts[k] = r2(SF[k] / frames);
  SIM_PHASES.forEach((k, i) => { simParts['sim.' + k] = r2((SIM_TIME.ms[i] - ms0[i]) / frames); });
  const st = v => { const s = v.slice().sort((x, y) => x - y); return { avg: r2(s.reduce((p, x) => p + x, 0) / s.length), p95: r2(s[Math.min(s.length - 1, Math.floor(s.length * .95))]) }; };
  const out = { frames, warm };
  for (const k in S) out[k] = st(S[k]);
  for (const k in parts) parts[k] = r2(parts[k]);
  const fd = renderer.fx.debug();
  Object.assign(out, { simParts, drawParts: parts, counts: renderer.countObjects(), units: world.totalAlive, corpses: world.corpses.length,
    particles: fd.particles, lod: renderer.fx.lod, view: `${renderer.app.renderer.width}x${renderer.app.renderer.height}@${renderer.app.renderer.resolution}` });
  return out;
}
const r2 = v => Math.round(v * 100) / 100;
// Mittel über die Sekunden ab fromSec (Standard 2: ohne den Aufbau der Szene), dazu die schlechteste Sekunde
function benchSummary(fromSec = 2) {
  const h = bench.out.history.filter(s => s.t > fromSec);
  if (!h.length) return null;
  const avg = k => +(h.reduce((p, s) => p + s[k], 0) / h.length).toFixed(2);
  return { seconds: h.length, fps: avg('fps'), minFps: Math.min(...h.map(s => s.fps)), simMs: avg('simMs'), renderMs: avg('renderMs'),
    frameMs: avg('frameMs'), frameMaxMs: Math.max(...h.map(s => s.frameMaxMs)), lodMax: Math.max(...h.map(s => s.lod)) };
}
const r1 = v => Math.round(v * 10) / 10;
function benchFrame(rawMs, simMs, renderMs, steps, dt) {
  if (!(rawMs >= 0) || rawMs > 1000) return;   // Tab im Hintergrund: nicht werten
  const b = bench;
  b.n++; b.sim += simMs; b.render += renderMs; b.steps += steps; b.frame += rawMs; if (rawMs > b.frameMax) b.frameMax = rawMs;
  b.t += rawMs / 1000; b.boxN++; b.boxT += dt; b.boxFrame += rawMs; b.boxSim += simMs; b.boxRender += renderMs;
  const lod = renderer.fx.lod;
  if (b.boxT >= .5) {
    benchBox.textContent = `bench ${b.scenario} fps=${Math.round(b.boxN * 1000 / (b.boxFrame || 1))} sim=${(b.boxSim / b.boxN).toFixed(1)}ms ` +
      `render=${(b.boxRender / b.boxN).toFixed(1)}ms frame=${(b.boxFrame / b.boxN).toFixed(1)}ms units=${world.totalAlive} lod=${lod}`;
    b.boxN = 0; b.boxT = 0; b.boxSim = 0; b.boxRender = 0; b.boxFrame = 0;
  }
  const o = b.out, secT = b.frame / 1000;
  if (secT >= 1) {
    o.fps = r1(b.n / secT); o.simMs = r1(b.sim / b.n); o.simStepMs = b.steps ? r1(b.sim / b.steps) : 0; o.steps = b.steps;
    o.renderMs = r1(b.render / b.n); o.frameMs = r1(b.frame / b.n); o.frameMaxMs = r1(b.frameMax);
    o.units = world.totalAlive; o.lod = lod; o.t = r1(b.t);
    o.history.push({ t: o.t, fps: o.fps, simMs: o.simMs, simStepMs: o.simStepMs, renderMs: o.renderMs, frameMs: o.frameMs, frameMaxMs: o.frameMaxMs, units: o.units, lod });
    if (o.history.length > BENCH_HISTORY) o.history.shift();
    b.n = 0; b.sim = 0; b.render = 0; b.steps = 0; b.frame = 0; b.frameMax = 0;
  }
}

const fpsBox = params.has('fps') && !benchN ? document.createElement('div') : null;
let fpsN = 0, fpsT = 0;
if (fpsBox) { fpsBox.className = 'fps'; fpsBox.textContent = '… fps'; host.append(fpsBox); }

function frame(now) {
  const rawMs = now - last;
  const realDt = Math.min(.05, Math.max(0, rawMs / 1000)); last = now;
  const w0 = performance.now();
  let simMs = 0, n = 0;
  const m = game.mission;
  const ts = (game.slow ? SLOW : 1) * game.speed * (m && m.endT >= 0 ? .35 : 1);
  if (!game.paused && !(m && m.phase === 'plan')) {
    acc += realDt * ts;
    while (acc >= STEP && n < MAX_STEPS) { const s0 = performance.now(); simStep(); simMs += performance.now() - s0; acc -= STEP; n++; }
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
    missionZoneX: m && m.phase === 'plan' ? zoneX(world) : null,
  });
  renderer.draw(world, cam, now / 1000);

  uiT -= realDt; if (uiT <= 0) { uiT = .25; ui.updateCounts(); }
  // Fx-Detailstufe aus der gemessenen Arbeitszeit dieses Bilds (Simulation, Effekte, Zeichnen), nicht aus dem
  // Bildabstand rawMs: sonst bliebe ein auf 30 Hz begrenzter Browser auf Stufe 1 (über 16 ms: Rauch aus,
  // Partikel ×0,5; fx.debug().lod)
  renderer.fx.autoLod(performance.now() - w0, rawMs);
  if (bench) benchFrame(rawMs, simMs, performance.now() - w0 - simMs, n, realDt);
  if (fpsBox) {
    fpsN++; fpsT += realDt;
    if (fpsT >= .5) { fpsBox.textContent = `${Math.round(fpsN / fpsT)} fps · ${world.totalAlive} Einheiten · LOD ${renderer.fx.lod}`; fpsN = 0; fpsT = 0; }
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
  // Rückgängig kennt Zellindizes des alten Gitters: Verlauf leeren und einen laufenden Strich sperren
  // (malt nicht weiter und landet beim Loslassen nicht im Verlauf)
  undoStack.length = 0;
  if (stroke) stroke.blocked = true;
  markAll();
}
let resizeQueued = false;
const queueResize = () => { if (resizeQueued) return; resizeQueued = true; requestAnimationFrame(() => { resizeQueued = false; onResize(); }); };
window.addEventListener('resize', queueResize);
if (typeof ResizeObserver === 'function') new ResizeObserver(queueResize).observe(host);

/* ---------- Start ---------- */
// Nur mit ?debug: Zugriff für Prüfungen in der Konsole (Abbildung Bildschirm <-> Welt usw.).
// scene(name) baut eine Prüfszene im Sandkasten: 'grenades', 'tank', 'heli', 'walls', 'walls2', 'water', 'dragon', 'prone', 'bosses', 'roemer', 'flucht';
// flow() zeigt die Wegfindung (Task 12d): Fraktionen mit Flussfeld, Neuberechnungen gesamt und je s, ms je Neuberechnung;
// crashHeli() schießt alle Hubschrauber ab, boom(x, y[, R]) zündet eine Explosion ohne Schützen.
// Boss-Sticker (Task 12c): renderer.debugRig().bosses (turretFlip, turretRot, rotorRot, wingPhase, tailSwing ... je gezeichnetem
// Boss; Mündung tip aus den Sprites, drawn aus der Pose, logic wie combat.fire sie jetzt nähme),
// fx.debug().boss (Abgas, Rotorwind-Staub). Zähler des letzten Bilds: renderer.debugPhysics() (dazu stances: Haltung der MG-Schützen und Scharfschützen); Effekte: fx.debug() (Partikel je Art, Sprites je
// Container und Mischung, Deckel, Wackeln, Decals, Rauchdrift; fire: Flammenstrahl- und Brand-Partikel).
const scenes = {
  grenades() { world.teamMode = true; placeRect(world, 'krieger', 40, .4, .3, .5, .7, 'blau'); placeRect(world, 'grenadier', 16, .72, .35, .78, .65, 'rot'); },
  tank() { world.teamMode = true; placeRect(world, 'soldat', 36, .42, .3, .5, .7, 'blau'); spawn(world, 'panzer', world.W * .72, world.H * .5, 'rot'); },
  heli() { world.teamMode = true; spawn(world, 'heli', world.W * .5, world.H * .45, 'rot'); placeRect(world, 'krieger', 12, .46, .5, .54, .6, 'blau'); placeRect(world, 'panzerfaust', 4, .2, .4, .24, .6, 'blau'); },
  walls() { world.teamMode = true; tRect(world, 'mauer', .5, .25, .512, .75); placeRect(world, 'grenadier', 12, .62, .38, .66, .62, 'rot'); placeRect(world, 'krieger', 24, .3, .38, .36, .62, 'blau'); },
  // Wegfindung (Spez. #24): links eine Mauer mit Lücke zwischen Blau und Rot (Krieger gehen durch die
  // Lücke, kein Einschlagen), rechts ein geschlossener Mauerring wie in M5 mit gelben Schützen innen und
  // grünen Rittern außen (kein Weg: sie schlagen die Mauer ein)
  walls2() {
    world.teamMode = true;
    tRect(world, 'mauer', .25, 0, .262, .55); tRect(world, 'mauer', .25, .72, .262, 1);
    placeRect(world, 'krieger', 24, .06, .12, .14, .4, 'blau'); placeRect(world, 'krieger', 24, .36, .12, .44, .4, 'rot');
    tCircle(world, 'mauer', .8, .5, .22, .18);
    placeCircle(world, 'schuetze', 10, .8, .5, .08, 'gelb');
    placeRect(world, 'ritter', 12, .95, .38, .99, .62, 'gruen');
  },
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
  // Römer (Spez. #25): 24 Römer (Blau, 6 × 4 im Platzabstand, bilden sofort einen Block) marschieren gegen
  // 20 Schützen (vorn) und 10 Krieger (dahinter, Rot): die Schilde halten die Pfeile ab (Funken), Speersalve
  // vor dem Angriff, dann charge
  roemer() {
    world.teamMode = true;
    for (let k = 0; k < 24; k++) spawn(world, 'roemer', world.W * .2 - (k % 4) * FORM.SPACING, world.H * .5 + (((k / 4) | 0) - 2.5) * FORM.SPACING, 'blau');
    placeRect(world, 'schuetze', 20, .62, .38, .68, .62, 'rot');
    placeRect(world, 'krieger', 10, .76, .42, .79, .58, 'rot');
  },
  // Rückzug (Spez. #27): 20 blaue Krieger mit 30 % LP gegen 20 rote mit vollen LP, je ein Sanitäter dahinter.
  // Blau bricht nach den ersten Treffern ab (Angstaugen, Schweißtropfen), läuft zum eigenen Sanitäter, erholt sich
  // abseits und kommt ab 60 % zurück; Eingeholte wehren sich.
  flucht() {
    world.teamMode = true;
    const k0 = world.units.length;
    placeRect(world, 'krieger', 20, .36, .36, .42, .64, 'blau');
    for (let i = k0; i < world.units.length; i++) world.units[i].hp = .3 * world.units[i].T.hp;
    placeRect(world, 'krieger', 20, .58, .36, .64, .64, 'rot');
    spawn(world, 'sani', world.W * .26, world.H * .5, 'blau');
    spawn(world, 'sani', world.W * .74, world.H * .5, 'rot');
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
    world, cam, renderer, fx: renderer.fx, game, ui, audio, actions, bench: startBench,
    scene(name) {
      if (!scenes[name]) return Object.keys(scenes);
      if (game.mission) game.enterSandbox();
      clearWorld(); scenes[name](); markAll(); rebuildHash(world); ui.closeBanner(); ui.refresh();
      return name;
    },
    crashHeli() { let n = 0; for (const u of world.units) if (u.alive && u.type === 'heli') { hurt(world, u, 1e9, 'rocket', null); n++; } return n; },
    boom(x, y, R = 50) { blast(world, x, y, R, 40, null, null, 'blast', 2); },
    flow() {
      const f = world.flow; if (!f) return null;
      const s = f.stats;
      return { factions: [...f.fields.keys()], grid: `${f.PW}x${f.PH}`, recomputes: s.recomputes, perSec: +s.rate.toFixed(1),
        msAvg: s.recomputes ? +(s.ms / s.recomputes).toFixed(3) : 0, msLast: +s.lastMs.toFixed(3), msMax: +s.maxMs.toFixed(3),
        msPerSec: +s.msRate.toFixed(3) };
    },
  };
}
seedDemo();
if (benchN) startBench();
ui.refresh();
bindInput(renderer.canvas, cam, actions);
requestAnimationFrame(t => { last = t; frame(t); });
