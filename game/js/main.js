// Start, Spielzustand und Schleife. Fester Simulationsschritt 1/60 s, Tempo 1/2/4×, Zeitlupe 0,3×, Pause.
// Leert world.events jedes Bild und reicht sie an Renderer (Gelände, renderer.fx), Audio und UI weiter.
import { UNITS, TERRAIN, CATEGORIES, TEAMS, PLURAL } from './data.js';
import { CHAPTERS, levelInfo, nextLevel, unitAllowed, terrainAllowed, catAllowed, levelUnlocked, chapterUnlocked } from './campaign/index.js';
import { createWorld, spawn, rebuildHash, resizeWorld, clearBattle, touchTerrain } from './world.js';
import { step, buildMission, missionResult, sandboxWinner, battleWinner, armyPoints, placeRect } from './sim.js';
import { createCamera, resizeCamera } from './camera.js';
import { bindInput } from './input.js';
import { createStroke, stamp, paintTerrain, undo as undoStroke, strokeEmpty, zoneX, PLAYER, BY_HALF } from './paint.js';
import { createStats } from './stats.js';
import { snapshotBattle, restoreBattle, mirrorBattle, createBatch } from './battle.js';
import { createRenderer } from './render/renderer.js';
import { createAudio, eventSound } from './audio.js';
import { hurt, blast } from './combat.js';
import { createUI } from './ui.js';
import { createBenchHud } from './benchhud.js';
import { SCENES } from './debug/scenes.js';
import { seedDemo as seedDemoScene, randomBattle as randomScene } from './sandbox.js';
import { SAVE_KEY, parseSave, serializeSave } from './save.js';
import { guardContext } from './glguard.js';

const STEP = 1 / 60, SLOW = .3, MAX_STEPS = 6, UNDO_MAX = 40;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

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
let stroke = null, undoStack = [], sandSave = null, snap = null, battleKeep = null;
const BATCH_MS = 12;   // 10× auswerten: Rechenzeit je Bild (ms)

// Ganzes Gelände neu zeichnen und die Wegfindung neu rechnen lassen (nach jeder Änderung an world.terr hier)
const markAll = () => { touchTerrain(world); renderer.markTerrainDirty(0, 0, world.GW - 1, world.GH - 1); };

/* ---------- Spielzustand und Aktionen ---------- */
const game = {
  world, save,
  // { id, idx (Nummer im Kapitel ab 0), chapter, def (das Level, campaign/), budget, par, spent, phase:'plan'|'battle'|'done', t, endT, result }
  mission: null,
  // Schlacht-Modus (Spez. #45): { phase:'plan'|'fight'|'done', snap, stats, batch, t, endT, result, evFrom, batchRes } oder null
  battle: null,
  sel: 'krieger', cat: 'armee', brush: 48, curTeam: 'blau',
  paused: false, speed: 1, slow: false,

  // Malleiste und Tasten 1–9: nur malbare Einheiten (paint: false, z. B. der Ghul, nie; Vorgabe 3), in einem Level nur
  // die erlaubten (units, cats; Spez. #52). Die Tasten folgen den sichtbaren Plätzen.
  level: () => (game.mission ? game.mission.def : null),
  catKeys: c => (c === 'gelaende' ? Object.keys(TERRAIN).filter(k => terrainAllowed(game.level(), k))
    : Object.keys(UNITS).filter(k => UNITS[k].cat === c && UNITS[k].paint !== false && unitAllowed(game.level(), k))),
  catAllowed: c => catAllowed(game.level(), c),
  unitAllowed: k => unitAllowed(game.level(), k),
  // Level (id oder, wie früher, Index der Grundausbildung) und Kapitel freigeschaltet?
  unlocked: x => levelUnlocked(save.stars, levelId(x)),
  chapterUnlocked: id => chapterUnlocked(save.stars, id),

  setCat(c) {
    if (!game.catAllowed(c)) return;
    game.cat = c;
    if (!game.catKeys(c).includes(game.sel)) game.sel = game.catKeys(c)[0];
    ui.renderUnits();
  },
  // Nicht malbare Typen (paint: false, der Ghul) sind nie die Auswahl, auch nicht über das Lexikon (Vorgabe 3)
  select(k) { if (UNITS[k] && UNITS[k].paint === false) return; game.sel = k; ui.renderUnits(); },
  setBrush(v) { game.brush = clamp(Math.round(v), 10, 150); ui.syncBrush(); },
  setTeam(k) { game.curTeam = k; ui.buildChips(); },
  setTeamMode(on) {
    if (game.mission || game.battle) { ui.updateMode(); return; }
    world.teamMode = !!on; world.contested = false;
    rebuildHash(world); ui.updateMode(); ui.updateCounts();
  },
  togglePause() {
    const m = game.mission, b = game.battle;
    if (m && m.phase !== 'battle') return;
    if (b && (b.phase === 'plan' || b.batch)) return;
    game.paused = !game.paused; ui.updateControls();
  },
  cycleSpeed() { game.speed = game.speed === 1 ? 2 : game.speed === 2 ? 4 : 1; ui.updateControls(); },
  toggleSlow() { game.slow = !game.slow; ui.updateControls(); },
  toggleMute() { audio.init(); save.muted = !save.muted; audio.muted = save.muted; persist(); ui.updateControls(); },

  clear() {
    const m = game.mission, b = game.battle;
    if (b) {
      if (b.phase !== 'plan') return;
      clearWorld(); world.teamMode = true; rebuildHash(world);
      ui.updateBattle(); ui.updateCounts();
      return;
    }
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
  dice() { if (game.mission || game.battle) return; audio.init(); randomBattle(); ui.closeBanner(); ui.updateCounts(); },

  undo() {
    const m = game.mission, b = game.battle;
    if (m && m.phase !== 'plan') return;
    if (b && b.phase !== 'plan') return;
    const s = undoStack.pop();
    if (!s) { ui.toast('Nichts zum Rückgängigmachen.'); return; }
    const spent = undoStroke(world, s);
    if (m) m.spent = spent;
    markAll(); ui.updateMission(); ui.updateBattle(); ui.updateCounts();
  },

  enterSandbox,
  enterBattle, startBattle, retryBattle, editBattle, runBatch, cancelBatch, swapSides,
  loadMission,
  go() { const m = game.mission; if (!m) return; if (m.phase === 'plan') startMission(); else if (m.phase === 'battle') retryMission(); },
  retryMission,
  // "Nächste Mission": das nächste Level im Kapitel, nach dem letzten die Kapitelübersicht
  nextMission() {
    const m = game.mission; if (!m) return;
    const n = nextLevel(m.id);
    if (n && game.unlocked(n.id)) loadMission(n.id); else ui.openChapters();
  },
};
// Index der Grundausbildung (alte Aufrufe, Debug) → id
const levelId = x => (typeof x === 'number' ? (CHAPTERS[0].levels[x] || {}).id : x);

const ui = createUI(game);

/* ---------- Szenen ---------- */
function clearWorld() {
  clearBattle(world);
  world.contested = false;
  world.terr.fill(0); world.towner.fill(0); world.whp.fill(0);
  undoStack.length = 0;
  renderer.fx.clear(); markAll(); rebuildHash(world);
}

function seedDemo() { clearWorld(); seedDemoScene(world); markAll(); rebuildHash(world); }
function randomBattle() { clearWorld(); randomScene(world); markAll(); rebuildHash(world); }

/* ---------- Sandkasten sichern ---------- */
function saveSandbox() {
  sandSave = {
    // Ghule (nicht malbar) gehören zur Schlacht ihres Vampirs, sie kommen nicht mit zurück
    // Task 6: ein verfluchter Frosch kommt als er selbst zurück (u.frogFrom), die Asche des Phönix mit halben LP; reborn
    // geht mit (ein schon wiedergeborener Phönix steht nicht noch einmal auf)
    units: world.units.filter(u => u.alive && (u.T.paint !== false || u.frogFrom !== null)).map(u => ({ type: u.frogFrom || u.type, team: u.team, x: u.x, y: u.y, hp: u.ashT > 0 ? u.T.hp / 2 : u.hp, reborn: u.reborn })),
    GW: world.GW, GH: world.GH, terr: world.terr.slice(), towner: world.towner.slice(), whp: world.whp.slice(),
    teamMode: world.teamMode,
  };
}

function enterSandbox() {
  ui.hideOverlays();
  if (!game.mission && !game.battle) return;
  leaveBattle();
  game.mission = null; snap = null; game.paused = false;
  clearWorld();
  if (sandSave) {
    const s = sandSave, mw = Math.min(s.GW, world.GW), mh = Math.min(s.GH, world.GH);
    world.teamMode = s.teamMode;
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      const a = y * s.GW + x, b = y * world.GW + x;
      if (s.towner[a] === 2) continue;   // Steinwände der Magier (spells.js) gehörten zur Schlacht
      world.terr[b] = s.terr[a]; world.towner[b] = s.towner[a]; world.whp[b] = s.whp[a];
    }
    for (const u of s.units) { const n = spawn(world, u.type, clamp(u.x, 6, world.W - 6), clamp(u.y, 6, world.H - 6), u.team); n.hp = u.hp; n.reborn = u.reborn; }
    markAll(); rebuildHash(world);
  } else { world.teamMode = false; seedDemo(); }
  ui.closeBanner(); ui.refresh();
}

/* ---------- Missionen ---------- */
// x: id eines Levels (campaign/) oder Index der Grundausbildung
function loadMission(x) {
  const e = levelInfo(levelId(x)); if (!e) return;
  if (!game.mission && !game.battle) saveSandbox();
  leaveBattle();
  clearWorld();
  const def = e.level;
  buildMission(world, def);
  game.mission = { id: def.id, idx: e.li, chapter: e.chapter, def, budget: def.budget, par: def.par, spent: 0, phase: 'plan', t: 0, endT: -1, result: null };
  game.paused = false;
  // Auswahl auf eine erlaubte Kategorie und Einheit setzen (units, cats)
  if (!game.catAllowed(game.cat)) game.cat = CATEGORIES.map(c => c[0]).find(game.catAllowed) || 'gelaende';
  if (!game.catKeys(game.cat).includes(game.sel)) game.sel = game.catKeys(game.cat)[0];
  markAll();
  ui.closeBanner(); ui.hideOverlays(); ui.resetBattle(); ui.refresh();
}

function startMission() {
  const m = game.mission;
  rebuildHash(world);
  if (!(world.facCount.get(PLAYER) > 0)) { ui.toast('Male zuerst deine Armee.'); return; }
  snap = {
    id: m.id, spent: m.spent, GW: world.GW, GH: world.GH,
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
  if (!snap || snap.id !== m.id) { loadMission(m.id); return; }
  const s = snap;
  loadMission(s.id);
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
  if (win) save.stars[m.id] = Math.max(save.stars[m.id] || 0, stars);
  persist();
  ui.showResult({ win, timeUp: m.t > 180, stars, spent: m.spent, budget: m.budget, par: m.par, time: m.t, hasNext: !!nextLevel(m.id) });
  audio.play(win ? 'win' : 'lose');
}

/* ---------- Schlacht (Spez. #45, #46) ---------- */
// Planung: beide Seiten frei malen (die Seite ergibt sich aus der Hälfte, paint.BY_HALF), Gelände überall. "Los!" nimmt
// den Schnappschuss (battle.js) und startet die Statistik (stats.js). "Nochmal" und "Aufstellung ändern" stellen ihn wieder
// her; "10× auswerten" rechnet ihn in einer eigenen Welt ohne Zeichnen (createBatch, je Bild BATCH_MS).
const newBattle = () => ({ phase: 'plan', snap: null, stats: null, batch: null, t: 0, endT: -1, result: null, evFrom: 0, batchRes: null });

function enterBattle() {
  const cur = game.battle;
  if (cur) {
    // schon in der Schlacht (Reiter erneut geklickt, etwa bei offener Missionsliste): nach dem Kampf die Auswertung zeigen
    ui.hideOverlays();
    if (cur.phase === 'done' && cur.endT < 0 && cur.result) {
      ui.showBattleResult(cur.result);
      if (cur.batch) ui.batchProgress(cur.batch.job.k, cur.batch.job.n);
    }
    return;
  }
  if (!game.mission) saveSandbox();
  game.mission = null; snap = null;
  clearWorld();
  world.teamMode = true;
  game.battle = newBattle();
  if (battleKeep) restoreBattle(world, battleKeep);
  game.paused = false;
  markAll(); rebuildHash(world);
  ui.closeBanner(); ui.hideOverlays(); ui.refresh();
}

// Verlässt den Modus (Sandkasten, Mission): bricht eine laufende Auswertung ab und merkt sich die Aufstellung
function leaveBattle() {
  const b = game.battle; if (!b) return;
  cancelBatch();
  battleKeep = b.phase === 'plan' ? snapshotBattle(world) : b.snap;
  game.battle = null;
  ui.hideOverlays();
}

function sideCounts() {
  let bl = 0, rt = 0;
  for (const u of world.units) if (u.alive) { if (u.team === 'blau') bl++; else if (u.team === 'rot') rt++; }
  return { blau: bl, rot: rt };
}
const MSG_TWO = 'Male zuerst zwei Armeen: Blau links, Rot rechts.';

function startBattle() {
  const b = game.battle; if (!b || b.phase !== 'plan') return false;
  rebuildHash(world);
  const n = sideCounts();
  if (!n.blau || !n.rot) { ui.toast(!n.blau && !n.rot ? MSG_TWO : `Male zuerst eine Armee für ${n.blau ? 'Rot (rechts)' : 'Blau (links)'}.`); return false; }
  b.snap = snapshotBattle(world);
  fight(b);
  return true;
}

// Kampf aus dem aktuellen Stand der Welt (frisch aufgestellt) beginnen
function fight(b) {
  b.stats = createStats(world);
  b.phase = 'fight'; b.t = 0; b.endT = -1; b.result = null; b.evFrom = world.events.length;
  undoStack.length = 0; game.paused = false; audio.init();
  ui.hideOverlays(); ui.updateBattle(); ui.updateControls(); ui.updateCounts();
}

function restoreSnap(b) {
  restoreBattle(world, b.snap);
  renderer.fx.clear(); markAll();
}

// "Nochmal": dieselbe Aufstellung samt Gelände, gleich wieder in den Kampf
function retryBattle() {
  const b = game.battle; if (!b || !b.snap) return;
  cancelBatch();
  restoreSnap(b);
  fight(b);
}

// "Aufstellung ändern" (und Abbrechen im Kampf): zurück in die Planung mit derselben Aufstellung
function editBattle() {
  const b = game.battle; if (!b) return;
  cancelBatch();
  if (b.snap) restoreSnap(b);
  b.phase = 'plan'; b.stats = null; b.result = null; b.endT = -1; b.t = 0; b.batchRes = null;
  undoStack.length = 0; game.paused = false;
  rebuildHash(world);
  ui.hideOverlays(); ui.updateBattle(); ui.updateControls(); ui.updateCounts();
}

// "Seiten tauschen": spiegelt die Aufstellung samt Gelände an der Mittellinie
function swapSides() {
  const b = game.battle; if (!b || b.phase !== 'plan') return;
  mirrorBattle(world); undoStack.length = 0;
  renderer.fx.clear(); markAll();
  ui.updateBattle(); ui.updateCounts();
}

// "10× auswerten": n Läufe mit verschiedenen Zufallswerten (createBatch), je Bild höchstens BATCH_MS ms (frame). Liefert
// ein Promise mit { wins: { blau, rot, draw }, avgTime, times } oder null bei Abbruch.
function runBatch(n = 10, seed = (Math.random() * 2 ** 31) | 0) {
  const b = game.battle; if (!b) return Promise.resolve(null);
  if (!b.snap) {
    if (b.phase !== 'plan') return Promise.resolve(null);
    const c = sideCounts(); if (!c.blau || !c.rot) { ui.toast(MSG_TWO); return Promise.resolve(null); }
    b.snap = snapshotBattle(world);
  }
  cancelBatch();
  b.batchRes = null;
  return new Promise(resolve => {
    b.batch = { job: createBatch(b.snap, n, seed), resolve };
    ui.batchProgress(0, n);
  });
}
function cancelBatch() {
  const b = game.battle; if (!b || !b.batch) return;
  const { job, resolve } = b.batch;
  b.batch = null; job.cancel();
  ui.batchProgress(-1, 0);
  resolve(null);
}
function pumpBatch(b) {
  const { job, resolve } = b.batch, k = job.k;
  job.pump(BATCH_MS);
  if (job.done) {
    b.batch = null; b.batchRes = job.result;
    ui.batchDone(job.result);
    resolve(job.result);
  } else if (job.k !== k) ui.batchProgress(job.k, job.n);
}

function finishBattle() {
  const b = game.battle; if (!b || !b.result) return;
  ui.showBattleResult(b.result);
  audio.play(b.result.winner === 'draw' ? 'lose' : 'win');
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
      const b = game.battle;
      if (m && m.phase !== 'plan') { ui.toast(m.phase === 'battle' ? 'Während des Kampfes wird nicht gemalt.' : 'Plane neu, um weiter zu malen.'); stroke.blocked = true; }
      else if (b && b.phase !== 'plan') { ui.toast(b.phase === 'fight' ? 'Während des Kampfes wird nicht gemalt.' : 'Ändere die Aufstellung, um weiter zu malen.'); stroke.blocked = true; }
      else if (m && wx > zoneX(world)) { ui.toast('Male nur links der gestrichelten Linie.'); stroke.blocked = true; }
    }
    if (stroke.blocked) return;
    pointer.erasing = erase;
    const sel = erase ? 'radierer' : game.sel, phase = m ? m.phase : null;
    if (TERRAIN[sel]) {
      const r = paintTerrain(world, stroke, wx, wy, game.brush, sel, m, phase);
      if (r.changed) { const c = r.cells; renderer.markTerrainDirty(c.gx0, c.gy0, c.gx1, c.gy1); ui.updateMission(); ui.updateBattle(); }
      if (r.warning) ui.toast(r.warning);
    } else {
      const r = stamp(world, stroke, wx, wy, game.brush, sel, game.battle ? BY_HALF : game.curTeam, m, phase);
      if (r.placed) { audio.play('pop'); ui.updateMission(); ui.updateBattle(); }
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
  if (game.battle) game.battle.evFrom = 0;
}

function simStep() {
  bench.tick();
  step(world, STEP);
  const m = game.mission, b = game.battle;
  if (b) {
    if (b.phase === 'fight') {
      b.t += STEP;
      // Ereignisse dieses Schritts an die Statistik (vor dem Leeren in drainEvents; mehrere Schritte je Bild)
      b.stats.onEvents(world.events, b.evFrom); b.evFrom = world.events.length;
      b.stats.tick(world, STEP);
      const r = battleWinner(world, b.t);
      if (r) { b.result = b.stats.result(world); b.endT = 1.4; b.phase = 'done'; ui.updateBattle(); }
    }
  } else if (m) {
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


const bench = createBenchHud({ params, host, world, game, ui, renderer, STEP, clearWorld, markAll, simStep, drainEvents });

const fpsBox = params.has('fps') && !bench.n ? document.createElement('div') : null;
let fpsN = 0, fpsT = 0;
if (fpsBox) { fpsBox.className = 'fps'; fpsBox.textContent = '… fps'; host.append(fpsBox); }

function frame(now) {
  // Kontext verloren (glguard.js): nicht rechnen und nicht zeichnen, bis er zurück ist
  if (gl.lost) { last = now; requestAnimationFrame(frame); return; }
  const rawMs = now - last;
  const realDt = Math.min(.05, Math.max(0, rawMs / 1000)); last = now;
  const w0 = performance.now();
  let simMs = 0, n = 0;
  const m = game.mission, bt = game.battle;
  const ts = (game.slow ? SLOW : 1) * game.speed * ((m && m.endT >= 0) || (bt && bt.endT >= 0) ? .35 : 1);
  // 10× auswerten: rechnet in einer eigenen Welt; die angezeigte steht solange still
  if (bt && bt.batch) pumpBatch(bt);
  if (!game.paused && !(m && m.phase === 'plan') && !(bt && (bt.phase === 'plan' || bt.batch))) {
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
  if (bt && bt.endT >= 0) { bt.endT -= realDt; if (bt.endT < 0) { bt.endT = -1; finishBattle(); } }

  const canPaint = !(m && m.phase !== 'plan') && !(bt && bt.phase !== 'plan');
  renderer.setOverlay({
    brushX: pointer.x, brushY: pointer.y, brushR: pointer.inside && canPaint ? game.brush : 0,
    erase: game.sel === 'radierer' || pointer.erasing,
    missionZoneX: m && m.phase === 'plan' ? zoneX(world) : null,
    battleMidX: bt && bt.phase === 'plan' ? world.W / 2 : null,
  });
  renderer.draw(world, cam, now / 1000);

  uiT -= realDt; if (uiT <= 0) { uiT = .25; ui.updateCounts(); if (bt) ui.updateBattle(); }
  // Fx-Detailstufe aus der gemessenen Arbeitszeit dieses Bilds (Simulation, Effekte, Zeichnen), nicht aus dem
  // Bildabstand rawMs: sonst bliebe ein auf 30 Hz begrenzter Browser auf Stufe 1 (über 16 ms: Rauch aus,
  // Partikel ×0,5; fx.debug().lod)
  renderer.fx.autoLod(performance.now() - w0, rawMs);
  bench.frame(rawMs, simMs, performance.now() - w0 - simMs, n, realDt);
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
// scene(name) baut eine Prüfszene im Sandkasten: 'grenades', 'tank', 'heli', 'walls', 'walls2', 'water', 'dragon', 'prone', 'bosses', 'roemer', 'flucht', 'faehigkeiten', 'magier', 'vampir', 'kreaturen', 'tiere';
// flow() zeigt die Wegfindung (Task 12d): Fraktionen mit Flussfeld, Neuberechnungen gesamt und je s, ms je Neuberechnung;
// crashHeli() schießt alle Hubschrauber ab, boom(x, y[, R]) zündet eine Explosion ohne Schützen.
// Boss-Sticker (Task 12c): renderer.debugRig().bosses (turretFlip, turretRot, rotorRot, wingPhase, tailSwing ... je gezeichnetem
// Boss; Mündung tip aus den Sprites, drawn aus der Pose, logic wie combat.fire sie jetzt nähme),
// fx.debug().boss (Abgas, Rotorwind-Staub). Zähler des letzten Bilds: renderer.debugPhysics() (dazu stances: Haltung der MG-Schützen und Scharfschützen); Effekte: fx.debug() (Partikel je Art, Sprites je
// Container und Mischung, Deckel, Wackeln, Decals, Rauchdrift; fire: Flammenstrahl- und Brand-Partikel).
if (new URLSearchParams(location.search).has('debug')) {
  window.__kritzel = {
    world, cam, renderer, fx: renderer.fx, game, ui, audio, actions, bench: bench.start,
    // Schlacht-Modus: enterBattle(), startBattle(), runBatch(n, seed) (Promise), retryBattle(), editBattle(); armyPoints();
    // place(type, n, x0, y0, x1, y1, team) wie placeRect (Anteile von W und H)
    enterBattle, startBattle, runBatch, retryBattle, editBattle, cancelBatch, armyPoints: () => armyPoints(world),
    place(type, n, x0, y0, x1, y1, team) { placeRect(world, type, n, x0, y0, x1, y1, team); rebuildHash(world); ui.updateCounts(); ui.updateBattle(); },
    scene(name) {
      if (!SCENES[name]) return Object.keys(SCENES);
      if (game.mission || game.battle) game.enterSandbox();
      clearWorld(); SCENES[name](world); markAll(); rebuildHash(world); ui.closeBanner(); ui.refresh();
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
if (bench.n) bench.start();
ui.refresh();
bindInput(renderer.canvas, cam, actions);
const gl = guardContext(renderer.canvas, document.getElementById('glLost'), { pause() {}, restored() { renderer.fx.clear(); markAll(); } });
requestAnimationFrame(t => { last = t; frame(t); });
