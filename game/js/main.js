// Start, Spielzustand und Schleife. Fester Simulationsschritt 1/60 s, Tempo 1/2/4×, Zeitlupe 0,3×, Pause.
// Leert world.events jedes Bild und reicht sie an Renderer (Gelände, renderer.fx), Audio und UI weiter.
import { UNITS, TERRAIN, CATEGORIES, TEAMS, PLURAL } from './data.js';
import { CHAPTERS, levelInfo, nextLevel, unitAllowed, terrainAllowed, catAllowed, levelUnlocked, chapterUnlocked } from './campaign/index.js';
import { createWorld, spawn, rebuildHash, clearBattle, touchTerrain } from './world.js';
import { step, buildMission, missionResult, sandboxWinner, battleWinner, armyPoints, placeRect } from './sim.js';
import { createCamera, resizeCamera, setPadding, WORLD_W, WORLD_H } from './camera.js';
import { bindInput } from './input.js';
import { createStroke, stamp, paintTerrain, undo as undoStroke, strokeEmpty, zoneX, PLAYER, BY_HALF } from './paint.js';
import { createStats } from './stats.js';
import { snapshotBattle, restoreBattle, mirrorBattle, createBatch, resetFight } from './battle.js';
import { createRenderer } from './render/renderer.js';
import { createAudio, DEFAULT_VOLUME } from './audio.js';
import { hurt, blast } from './combat.js';
import { createUI } from './ui.js';
import { createBenchHud } from './benchhud.js';
import { SCENES } from './debug/scenes.js';
import { seedDemo as seedDemoScene, randomBattle as randomScene } from './sandbox.js';
import { SAVE_KEY, parseSave, serializeSave } from './save.js';
import { guardContext } from './glguard.js';
import { classifyStroke, applyShape, SHAPES, SHAPE_MIN_UNITS } from './shapes.js';
import { defeatHint } from './hints.js';
import { earnedMedals } from './medals.js';
import { createCoach } from './ui/coach.js';
import TUTORIAL from './campaign/tutorial.js';
/* ---------- Editor und Teilen (Audit 18.11.) ---------- */
import { EDITOR } from './paint.js';
import { levelFromWorld, levelProblem, upsertCustom, isLevel } from './editor.js';
import { encode, decode, battleData, applyBattle, levelData } from './share.js';
import { createShareDialog } from './ui/sharedialog.js';
import { createEditorBar } from './ui/editorbar.js';
import { dailyLevel, dateKey, recordDaily } from './daily.js';   // Tageschallenge (Audit 18.11.)
import { createHotseatUI } from './ui/hotseat.js';             // Hotseat-Versus (Audit 18.11.)
import { createOnlineUI } from './ui/online.js';               // Online 1 gegen 1 (18.11.)
import { createDuelUI } from './ui/duel.js';                   // Code-Duell (18.11.)
import { applyMap } from './rules.js';                          // Karten für 1 gegen 1

const STEP = 1 / 60, SLOW = .3, MAX_STEPS = 6, UNDO_MAX = 40;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------- Speicher ---------- */
let save;
try { save = parseSave(localStorage.getItem(SAVE_KEY)); } catch (e) { save = parseSave(null); /* kein Speicher */ }
function persist() { try { localStorage.setItem(SAVE_KEY, serializeSave(save)); } catch (e) { /* ignore */ } }

/* ---------- Welt, Kamera, Renderer ---------- */
const host = document.getElementById('app');
const viewport = () => ({ vw: Math.max(280, host.clientWidth || innerWidth), vh: Math.max(280, host.clientHeight || innerHeight) });
// Feste Weltgröße (camera.WORLD_W × WORLD_H), das Fenster bestimmt nur den Maßstab der Kamera
let { vw, vh } = viewport();
const world = createWorld(WORLD_W, WORLD_H, (Math.random() * 2 ** 31) | 0);
const cam = createCamera(vw, vh, world.W, world.H);
const renderer = createRenderer(host);
renderer.resize(vw, vh);
const audio = createAudio();
audio.muted = !!save.muted;
audio.setVolume(typeof save.volume === 'number' ? save.volume : DEFAULT_VOLUME);
audio.bindUI(document);

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
  // Audit 18.11.: Reichweiten der Gegner in der Planung zeigen; laufendes Replay (oder null)
  showRanges: true, replayState: null,

  // Malleiste und Tasten 1–9: nur malbare Einheiten (paint: false, z. B. der Ghul, nie; Vorgabe 3), in einem Level nur
  // die erlaubten (units, cats; Spez. #52). Die Tasten folgen den sichtbaren Plätzen.
  // Online 1 gegen 1 (online.js): battle.hot.def legt die Kategorie der Runde fest
  level: () => (game.mission ? game.mission.def : game.battle && game.battle.hot && game.battle.hot.def) || null,
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
    if (game.mission || game.battle || game.editor) { ui.updateMode(); return; }
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
  // Lautstärke 0..1 (Regler am Ton-Knopf); ein Regler über 0 hebt die Stummschaltung auf
  setVolume(v) {
    audio.init(); audio.setVolume(v); save.volume = audio.volume;
    if (save.muted && v > 0) { save.muted = false; audio.muted = false; ui.updateControls(); }
    persist();
  },

  clear() {
    const m = game.mission, b = game.battle;
    if (game.editor) { clearWorld(); world.teamMode = true; rebuildHash(world); ui.updateCounts(); game.editorUI.tick(); return; }   // Editor (Audit 18.11.)
    if (hotseat.clear()) return;   // Hotseat (Audit 18.11.): nur die eigene Hälfte
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
  dice() { if (game.mission || game.battle || game.editor) return; audio.init(); randomBattle(); ui.closeBanner(); ui.updateCounts(); },

  undo() {
    const m = game.mission, b = game.battle;
    if (m && m.phase !== 'plan') return;
    if (b && b.phase !== 'plan') return;
    const s = undoStack.pop();
    if (!s) { ui.toast('Nichts zum Rückgängigmachen.'); return; }
    const spent = undoStroke(world, s);
    if (m) m.spent = spent;
    hotseat.onUndo(spent);   // Hotseat (Audit 18.11.)
    markAll(); ui.updateMission(); ui.updateBattle(); ui.updateCounts();
  },

  enterSandbox,
  toggleRanges() { game.showRanges = !game.showRanges; ui.updateRanges(); },
  replay: startReplay, endReplay, replaying: () => !!game.replayState, canReplay,
  startTutorial, skipTutorial() { save.tutorial = true; persist(); },
  enterBattle, startBattle, retryBattle, editBattle, runBatch, cancelBatch, swapSides,
  loadMission,
  go() { const m = game.mission; if (!m) return; if (m.phase === 'plan') startMission(); else if (m.phase === 'battle') retryMission(); },
  retryMission,
  // "Nächste Mission": das nächste Level im Kapitel, nach dem letzten die Kapitelübersicht
  nextMission() {
    const m = game.mission; if (!m) return;
    if (!m.chapter) { ui.openChapters(); return; }   // Tutorial und andere Level ohne Kapitel: zur Kampagne
    const n = nextLevel(m.id);
    if (m.custom) game.customBack();   // eigenes Level (Audit 18.11.)
    else if (n && game.unlocked(n.id)) loadMission(n.id); else ui.openChapters();
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
    units: world.units.filter(u => u.alive && (u.T.paint !== false || u.frogFrom !== null)).map(u => ({ type: u.frogFrom || u.type, team: u.team, x: u.x, y: u.y, hp: u.ashT > 0 ? u.T.hp / 2 : u.hp, reborn: u.reborn, shape: u.shape })),
    GW: world.GW, GH: world.GH, terr: world.terr.slice(), towner: world.towner.slice(), whp: world.whp.slice(),
    teamMode: world.teamMode,
  };
}

function enterSandbox() {
  endReplay(true);
  ui.hideOverlays();
  if (!game.mission && !game.battle && !game.editor) return;
  leaveBattle(); leaveEditor();
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
    for (const u of s.units) { const n = spawn(world, u.type, clamp(u.x, 6, world.W - 6), clamp(u.y, 6, world.H - 6), u.team); n.hp = u.hp; n.reborn = u.reborn; if (u.shape) applyShape(n, u.shape, false); }
    markAll(); rebuildHash(world);
  } else { world.teamMode = false; seedDemo(); }
  ui.closeBanner(); ui.refresh();
}

/* ---------- Missionen ---------- */
// x: id eines Levels (campaign/) oder Index der Grundausbildung, die Tageschallenge (Objekt oder 'daily-YYYY-MM-DD'), oder
// ein eigenes Level (Objekt, Editor; custom: 'editor' zurück in den Editor, 'list' zur Liste der eigenen Level; ohne Kapitel
// und ohne Sterne)
function loadMission(x, custom = null) {
  const d = dailyInfo(x);
  if (d) { loadLevelDef(d.level, { kind: 'daily' }); return; }
  if (x && typeof x === 'object') { loadLevelDef(x, { custom: custom || 'list' }); return; }
  const e = levelInfo(levelId(x)); if (!e) return;
  loadLevelDef(e.level, { chapter: e.chapter, idx: e.li });
}
// Ein Level direkt (auch ohne Kapitel: Tutorial, Tageschallenge, eigene Level). opts: { chapter, idx, kind, custom }
function loadLevelDef(def, opts = {}) {
  endReplay(true);
  if (!game.mission && !game.battle && !game.editor) saveSandbox();
  leaveBattle(); leaveEditor();
  clearWorld();
  buildMission(world, def);
  game.mission = { id: def.id, idx: opts.idx || 0, chapter: opts.chapter || null, def,
    kind: opts.kind || (opts.chapter ? 'campaign' : opts.custom ? 'custom' : 'level'),
    budget: def.budget, par: def.par, spent: 0, phase: 'plan', t: 0, endT: -1, result: null, fight: null, res: null };
  if (opts.custom) game.mission.custom = opts.custom;
  game.paused = false;
  // Auswahl auf eine erlaubte Kategorie und Einheit setzen (units, cats)
  if (!game.catAllowed(game.cat)) game.cat = CATEGORIES.map(c => c[0]).find(game.catAllowed) || 'gelaende';
  if (!game.catKeys(game.cat).includes(game.sel)) game.sel = game.catKeys(game.cat)[0];
  markAll();
  ui.closeBanner(); ui.hideOverlays(); ui.resetBattle(); ui.refresh(); ui.updateRanges();
}

function startMission() {
  const m = game.mission;
  rebuildHash(world);
  if (!(world.facCount.get(PLAYER) > 0)) { ui.toast('Male zuerst deine Armee.'); return; }
  snap = {
    id: m.id, spent: m.spent, GW: world.GW, GH: world.GH,
    units: world.units.filter(u => u.alive && u.team === PLAYER).map(u => ({ type: u.type, x: u.x, y: u.y, shape: u.shape })),
    terr: world.terr.slice(), towner: world.towner.slice(), whp: world.whp.slice(),
  };
  m.phase = 'battle'; m.t = 0; m.endT = -1; m.result = null;
  // Replay (Audit 18.11.): Kampf aus festem Zustand starten, damit er sich genau wiederholen lässt
  m.fight = beginFight();
  undoStack.length = 0; ui.resetBattle(); audio.init(); audio.play('go');
  ui.updateMission(); ui.updateControls();
}

// "Nochmal planen" / "Besser planen" / "Abbrechen": Mission neu laden und den Plan wiederherstellen
function retryMission() {
  const m = game.mission; if (!m) return;
  // Kampagne über die id, alle anderen (eigenes Level, Tutorial, Tageschallenge) über das Level-Objekt
  const again = () => (m.chapter ? loadMission(m.id) : loadLevelDef(m.def, { kind: m.kind, custom: m.custom }));
  if (!snap || snap.id !== m.id) { again(); return; }
  const s = snap;
  again();
  if (s.GW === world.GW && s.GH === world.GH) {
    for (let k = 0; k < world.terr.length; k++) if (s.towner[k]) { world.terr[k] = s.terr[k]; world.towner[k] = 1; world.whp[k] = s.whp[k]; }
  }
  for (const u of s.units) { const n = spawn(world, u.type, clamp(u.x, 6, world.W - 6), clamp(u.y, 6, world.H - 6), PLAYER); if (u.shape) applyShape(n, u.shape); }
  game.mission.spent = s.spent; snap = s;
  markAll(); rebuildHash(world); ui.updateMission(); ui.updateCounts();
}

function finishMission() {
  const m = game.mission; if (!m) return;
  const win = m.result === 'win', timeUp = m.t > 180;
  const stars = win ? 1 + (m.spent <= m.par * 1.25 ? 1 : 0) + (m.spent <= m.par ? 1 : 0) : 0;
  const camp = m.kind === 'campaign';
  if (win && camp) save.stars[m.id] = Math.max(save.stars[m.id] || 0, stars);
  // Tageschallenge (Audit 18.11.): keine Kampagnensterne, der Bestwert des Tages kommt in save.daily
  const daily = m.def.daily ? { date: m.def.daily, best: recordDaily(save.daily, m.def.daily, { win, spent: m.spent, stars }) } : null;
  // Medaillen (medals.js): nur für Kampagnenlevel gespeichert, angezeigt immer
  const army = snap && snap.id === m.id ? snap.units : [];
  const got = earnedMedals({ win, lost: ui.lostBlue(), deployed: army.length, time: m.t, types: new Set(army.map(u => u.type)).size });
  const before = camp ? save.medals[m.id] || 0 : 0;
  if (camp && got) save.medals[m.id] = before | got;
  if (m.kind === 'tutorial' && win) save.tutorial = true;
  persist();
  const hint = win ? null : defeatHint({ killers: ui.killers(), level: m.def, timeUp });
  m.res = { win, timeUp, stars, spent: m.spent, budget: m.budget, par: m.par, time: m.t, hasNext: !!(m.chapter && nextLevel(m.id)), custom: m.custom || null,
    daily, nextLabel: m.chapter || m.custom || daily ? null : 'Zur Kampagne', hint: hint && hint.text, medals: { mask: before | got, fresh: got & ~before }, canReplay: !!m.fight };
  ui.showResult(m.res);
  audio.play(win ? 'win' : 'lose');
}

/* ---------- Replay (Audit 18.11.) ---------- */
// Jeder Kampf beginnt mit resetFight (battle.js) aus einem Schnappschuss und einer Saat; danach ist er deterministisch.
// Das Replay stellt denselben Anfang her, rechnet ohne Zeichnen bis REPLAY_S s vor das Ende und spielt den Rest in
// Zeitlupe (REPLAY_SPEED) ab. Danach erscheint die Auswertung wieder.
const REPLAY_S = 6, REPLAY_TAIL = 1, REPLAY_SPEED = .35, REPLAY_FF_MS = 14;
function beginFight(seed = (Math.random() * 2 ** 31) | 0) {
  const f = { snap: snapshotBattle(world), seed };
  resetFight(world, f.snap, f.seed);
  renderer.fx.clear(); markAll();
  return f;
}
function fightSrc() {
  const m = game.mission, b = game.battle;
  if (m && m.phase === 'done' && m.fight && m.res) return { f: m.fight, T: m.t };
  if (b && b.phase === 'done' && b.fight && b.result) return { f: b.fight, T: b.t };
  return null;
}
function canReplay() { return !!fightSrc(); }
function startReplay() {
  const src = fightSrc(); if (!src) return;
  ui.hideOverlays(); ui.closeBanner();
  resetFight(world, src.f.snap, src.f.seed);
  world.events.length = 0; renderer.fx.clear(); markAll();
  game.replayState = { t: 0, from: Math.max(0, src.T - REPLAY_S), to: src.T + REPLAY_TAIL, play: false, acc: 0 };
  game.paused = false;
  ui.replayBar(true, 'wird vorbereitet …');
  audio.init(); audio.play('whoosh');
}
// Ende des Replays: Auswertung wieder zeigen (quiet: ohne, beim Wechsel des Modus)
function endReplay(quiet = false) {
  if (!game.replayState) return;
  game.replayState = null; ui.replayBar(false);
  if (quiet) return;
  const m = game.mission, b = game.battle;
  if (m && m.res) ui.showResult(m.res); else if (b && b.result) ui.showBattleResult(b.result);
}
function replayFrame(realDt) {
  const r = game.replayState;
  if (!r.play) {
    const end = performance.now() + REPLAY_FF_MS;
    while (r.t < r.from && performance.now() < end) { step(world, STEP); world.events.length = 0; r.t += STEP; }
    if (r.t >= r.from) { r.play = true; renderer.fx.clear(); ui.replayBar(true, `Zeitlupe · letzte ${Math.round(r.to - r.from)} s`); }
    else ui.replayBar(true, `wird vorbereitet … ${Math.round(r.t / r.from * 100)} %`);
    return;
  }
  if (game.paused) { renderer.fx.update(realDt * .5, null); return; }
  r.acc += realDt * REPLAY_SPEED * (game.slow ? SLOW : 1);
  let n = 0;
  while (r.acc >= STEP && n < MAX_STEPS) { step(world, STEP); r.t += STEP; r.acc -= STEP; n++; }
  const ev = world.events;
  renderer.consume(ev);
  audio.onEvents(ev, cam, true);   // Replay in Zeitlupe: tiefer
  ev.length = 0;
  renderer.fx.update(realDt * REPLAY_SPEED, world);
  if (r.t >= r.to) endReplay();
}

/* ---------- Tutorial (Audit 18.11.) ---------- */
const coach = createCoach(host, () => audio.play('tab'));
function startTutorial() {
  loadLevelDef(TUTORIAL, { kind: 'tutorial' });
  const $ = id => document.getElementById(id);
  const own = () => world.units.some(u => u.alive && u.team === PLAYER);
  const m = () => game.mission;
  coach.start([
    { text: 'Unten ist deine Malleiste. Der Krieger ist schon gewählt, die Zahl rechts unten ist sein Preis in Punkten.', at: () => $('units'), next: 'Weiter' },
    { text: 'Male mit gedrückter Maustaste links der gestrichelten Linie. Jeder Strich setzt Krieger, solange dein Budget reicht.', at: () => ({ x: host.clientWidth * .25, y: host.clientHeight * .3 }), done: own },
    { text: 'Tipp: Ein Strich als Pfeil mit der Spitze nach rechts macht einen Sturmkeil, ein Kreis einen Igel, eine lange Linie eine Schlachtreihe.', at: () => ({ x: host.clientWidth * .25, y: host.clientHeight * .3 }), next: 'Weiter' },
    { text: 'Fertig? Dann drück „Los!“.', at: () => $('misGo'), done: () => m() && m().kind === 'tutorial' && m().phase !== 'plan' },
    { text: 'Jetzt kämpfen sie von allein. Rot verliert, wenn niemand mehr steht.', at: () => $('misBar'), done: () => !m() || m().kind !== 'tutorial' || m().phase === 'done' },
  ], () => { save.tutorial = true; persist(); });
}

/* ---------- Schlacht (Spez. #45, #46) ---------- */
// Planung: beide Seiten frei malen (die Seite ergibt sich aus der Hälfte, paint.BY_HALF), Gelände überall. "Los!" nimmt
// den Schnappschuss (battle.js) und startet die Statistik (stats.js). "Nochmal" und "Aufstellung ändern" stellen ihn wieder
// her; "10× auswerten" rechnet ihn in einer eigenen Welt ohne Zeichnen (createBatch, je Bild BATCH_MS).
const newBattle = () => ({ phase: 'plan', snap: null, stats: null, batch: null, t: 0, endT: -1, result: null, evFrom: 0, batchRes: null });

function enterBattle() {
  endReplay(true);
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
  if (!game.mission && !game.editor) saveSandbox();
  leaveEditor();
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
function fight(b, seed) {
  b.fight = beginFight(seed);   // Replay (Audit 18.11.)
  b.stats = createStats(world);
  b.phase = 'fight'; b.t = 0; b.endT = -1; b.result = null; b.evFrom = world.events.length;
  undoStack.length = 0; game.paused = false; audio.init(); audio.play('go');
  ui.hideOverlays(); ui.updateBattle(); ui.updateControls(); ui.updateCounts();
}

function restoreSnap(b) {
  restoreBattle(world, b.snap);
  renderer.fx.clear(); markAll();
}

// Online 1 gegen 1 (online.js): beide Armeen aus der Liste aufstellen (feste Reihenfolge) und mit der Saat der Runde
// kämpfen. Auf beiden Geräten dieselbe Liste und Saat, also derselbe Kampf.
function onlineFight(list, seed, map = 'feld') {
  const b = game.battle; if (!b) return false;
  cancelBatch(); endReplay(true);
  clearWorld(); world.teamMode = true;
  applyMap(world, map); markAll();   // Karte der Runde (rules.js), auf beiden Geräten gleich
  for (const u of list) { const n = spawn(world, u.type, u.x, u.y, u.team); if (u.shape) applyShape(n, u.shape, true); }
  rebuildHash(world);
  b.phase = 'plan'; b.snap = snapshotBattle(world); b.batchRes = null;
  fight(b, seed);
  return true;
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

/* ---------- Editor und Teilen (Audit 18.11.) ---------- */
// Level-Editor: game.editor ist edState ({ meta: { n, hint, budget, cats }, savedId, keep }), solange der Editor offen ist,
// sonst null. Gemalt werden Gegner (paint.EDITOR: Rot, nur rechts der Mallinie) und Gelände überall; die Simulation steht.
// Beim Verlassen (Testen, anderer Modus) merkt sich keep die Aufstellung (snapshotBattle), der Reiter „Editor“ und
// „Zum Editor“ nach dem Testen stellen sie wieder her. Eigene Level liegen im Spielstand (save.custom, save.js) und laufen
// als Mission ohne Kapitel (loadMission(level, custom)). Teilen per Code: share.js, Dialog ui/sharedialog.js.
let edState = null;
const newMeta = () => ({ n: '', hint: '', budget: '', cats: null });
game.editor = null;
const shareDlg = createShareDialog(host);
const editorUI = createEditorBar(game);
game.editorUI = editorUI;

// level: ein eigenes Level zum Bearbeiten (Liste „Eigene Level“); ohne: die zuletzt offene Aufstellung des Editors
function enterEditor(level = null) {
  ui.hideOverlays();
  if (game.editor && !level) return;
  if (!game.mission && !game.battle && !game.editor) saveSandbox();
  leaveBattle(); leaveEditor();
  game.mission = null; snap = null; game.paused = false;
  clearWorld();
  if (!edState) edState = { meta: newMeta(), savedId: null, keep: null };
  if (level) {
    edState.meta = { n: level.n, hint: level.hint || '', budget: level.budget, cats: level.cats || null };
    edState.savedId = save.custom.some(l => l.id === level.id) ? level.id : null;
    buildMission(world, level);
  } else if (edState.keep) restoreBattle(world, edState.keep);
  world.teamMode = true;
  game.editor = edState;
  markAll(); rebuildHash(world);
  editorUI.fill();
  ui.closeBanner(); ui.refresh();
}
function leaveEditor() {
  if (!game.editor) return;
  edState.keep = snapshotBattle(world);
  game.editor = null;
}
// Das Level aus dem Editor oder null (mit Meldung, etwa ohne Gegner)
function editorLevel() {
  if (!game.editor) return null;
  rebuildHash(world);
  const lv = levelFromWorld(world, edState.meta), bad = levelProblem(lv);
  if (bad) { ui.toast(bad); return null; }
  return lv;
}
function editorTest() { const lv = editorLevel(); if (lv) loadMission(lv, 'editor'); }
function editorShare() {
  const lv = editorLevel(); if (!lv) return;
  shareDlg.showCode(encode(levelData(lv)), 'Level teilen', 'Wer diesen Code mit „Code laden“ einfügt, kann dein Level spielen.');
}
function saveCustom(lv, replaceId = null) {
  const r = upsertCustom(save.custom, lv, replaceId);
  if (r.error) { ui.toast(r.error); return false; }
  save.custom = r.list; persist();
  return true;
}
function editorSave() {
  const lv = editorLevel(); if (!lv) return;
  if (saveCustom(lv, edState.savedId)) { edState.savedId = lv.id; ui.toast('Gespeichert unter Missionen → Eigene Level.'); }
}
const customById = id => save.custom.find(l => l.id === id) || null;
function playCustom(id) { const l = customById(id); if (l) loadMission(l, 'list'); }
function editCustom(id) { const l = customById(id); if (l) enterEditor(l); }
function shareCustom(id) {
  const l = customById(id); if (!l) return;
  shareDlg.showCode(encode(levelData(l)), 'Level teilen', `„${l.n}“: Wer diesen Code mit „Code laden“ einfügt, kann das Level spielen.`);
}
function deleteCustom(id) {
  save.custom = save.custom.filter(l => l.id !== id); persist();
  if (edState && edState.savedId === id) edState.savedId = null;
}
// „Übersicht“ und „Weiter“ in einem eigenen Level: zurück in den Editor bzw. zur Liste der eigenen Level
function customBack() {
  const m = game.mission;
  if (m && m.custom === 'editor') enterEditor(); else ui.openCustomList();
}
function shareBattle() {
  const b = game.battle; if (!b || b.phase !== 'plan') return;
  const n = sideCounts();
  if (!n.blau && !n.rot) { ui.toast('Male zuerst eine Aufstellung.'); return; }
  shareDlg.showCode(encode(battleData(world)), 'Schlacht teilen', 'Wer diesen Code mit „Code laden“ einfügt, bekommt genau diese Aufstellung samt Gelände.');
}
// Code laden: Schlacht (in die Planung des Schlacht-Modus) oder eigenes Level (gespeichert und gleich als Mission)
async function loadCode(text) {
  const d = await decode(text);
  if (d.k === 'duel' || d.k === 'duelres') { duel.load(d); return; }   // Code-Duell (18.11.)
  if (d.k === 'battle') {
    if (!game.battle) enterBattle(); else if (game.battle.phase !== 'plan') editBattle();
    clearWorld(); world.teamMode = true;
    applyBattle(world, d);
    game.battle.snap = null;
    markAll(); rebuildHash(world);
    ui.updateBattle(); ui.updateCounts();
    ui.toast('Schlacht geladen.');
    return;
  }
  const lv = d.level;
  if (!isLevel(lv)) throw new Error('Der Code passt nicht zu dieser Version des Spiels.');
  if (!customById(lv.id) && saveCustom(lv)) ui.toast(`„${lv.n}“ unter Eigene Level gespeichert.`);
  loadMission(lv, 'list');
}
const openCodeLoad = () => shareDlg.openLoad(loadCode);

Object.assign(game, {
  enterEditor: () => enterEditor(), editorTest, editorShare, editorSave, customBack,
  playCustom, editCustom, shareCustom, deleteCustom, openCodeLoad, loadCode, shareBattle, toast: msg => ui.toast(msg),
});
document.getElementById('mEd').onclick = () => game.enterEditor();
document.getElementById('bCode').onclick = () => openCodeLoad();
document.getElementById('batShare').onclick = () => shareBattle();

/* ---------- Malen (Eingabe -> paint.js) ---------- */
const actions = {
  strokeStart() {
    audio.init();
    if (!game.mission) ui.closeBanner();
    stroke = createStroke(game.mission ? game.mission.spent : 0);
    stroke.first = true; stroke.blocked = false; stroke.path = [];
    if (hotseat.painter()) stroke.spent = hotseat.spent();   // Hotseat (Audit 18.11.): Rückgängig kennt die Ausgaben
  },
  paintAt(wx, wy, erase) {
    if (!stroke) return;
    if (hotseat.paintAt(stroke, wx, wy, erase)) return;   // Hotseat (Audit 18.11.): eigene Hälfte, eigenes Budget
    const m = game.mission;
    if (stroke.first) {
      stroke.first = false;
      const b = game.battle;
      if (m && m.phase !== 'plan') { ui.toast(m.phase === 'battle' ? 'Während des Kampfes wird nicht gemalt.' : 'Plane neu, um weiter zu malen.'); stroke.blocked = true; }
      else if (b && b.phase !== 'plan') { ui.toast(b.phase === 'fight' ? 'Während des Kampfes wird nicht gemalt.' : 'Ändere die Aufstellung, um weiter zu malen.'); stroke.blocked = true; }
      else if (m && wx > zoneX(world)) { ui.toast('Male nur links der gestrichelten Linie.'); stroke.blocked = true; }
      else if (game.editor && !erase && UNITS[game.sel] && wx <= zoneX(world)) ui.toast('Gegner nur rechts der gestrichelten Linie, Gelände überall.');
    }
    if (stroke.blocked) return;
    pointer.erasing = erase;
    const sel = erase ? 'radierer' : game.sel, phase = m ? m.phase : null;
    if (TERRAIN[sel]) {
      const r = paintTerrain(world, stroke, wx, wy, game.brush, sel, m, phase);
      if (r.changed) { const c = r.cells; renderer.markTerrainDirty(c.gx0, c.gy0, c.gx1, c.gy1); ui.updateMission(); ui.updateBattle(); audio.play('scribble', { kind: sel }); }
      if (r.warning) ui.toast(r.warning);
    } else {
      stroke.path.push([wx, wy]);   // Kritzel-Formen (shapes.js)
      const r = stamp(world, stroke, wx, wy, game.brush, sel, game.battle ? BY_HALF : game.editor ? EDITOR : game.curTeam, m, phase);
      if (r.placed) { audio.play('pop'); ui.updateMission(); ui.updateBattle(); }
      if (r.warning) ui.toast(r.warning);
    }
  },
  strokeEnd() {
    pointer.erasing = false;
    if (stroke && !stroke.blocked) shapeStroke(stroke);
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
  toggleMute: () => game.toggleMute(),
  hover(wx, wy, inside) { pointer.x = wx; pointer.y = wy; pointer.inside = inside; },
  // offenes Lexikon (Dialog): keine Tastenkürzel (input.js); Esc schließt es (ui.js)
  keysBlocked: () => ui.lexiconOpen() || shareDlg.isOpen(),
};

// Kritzel-Formen (Audit 18.11.): Form des Strichs erkennen und seinen Einheiten den Bonus geben. Der Gegner steht in
// Missionen rechts; in der Schlacht und im Sandkasten gegenüber der Hälfte, in der der Strich begann.
function shapeStroke(s) {
  const us = s.units.filter(u => u.alive);
  if (us.length < SHAPE_MIN_UNITS || !s.path || s.path.length < 3) return;
  const dir = game.mission ? 1 : s.path[0][0] < world.W / 2 ? 1 : -1;
  const k = classifyStroke(s.path, game.brush, dir);
  if (!k) return;
  for (const u of us) applyShape(u, k);
  ui.toast(`${SHAPES[k].n}! ${us.length} ${us.length === 1 ? 'Einheit' : 'Einheiten'}: ${SHAPES[k].d}`);
  audio.play('horn');   // Formbonus: Signalhorn
}

// Reichweiten der gegnerischen Fernkämpfer (Planung einer Mission), für renderer.setOverlay
function enemyRanges() {
  const out = [];
  for (const u of world.units) if (u.alive && u.team !== PLAYER && u.T.range >= 20 && !u.T.heal) out.push({ x: u.x, y: u.y, r: u.T.range });
  return out;
}

/* ---------- Tageschallenge (Audit 18.11.) ---------- */
// Ein Level je Tag (daily.js). Läuft als Mission ohne Kapitel (mis.chapter null, mis.idx -1); loadMission nimmt auch das
// Level selbst oder seine id 'daily-YYYY-MM-DD' (für „Nochmal planen“).
function dailyInfo(x) {
  const def = x && typeof x === 'object' && x.daily ? x : typeof x === 'string' && /^daily-\d{4}-\d{2}-\d{2}$/.test(x) ? dailyLevel(x.slice(6)) : null;
  return def ? { level: def, li: -1, chapter: null } : null;
}
// Level direkt laden (ohne Kampagne)
function loadLevel(def) { loadMission(def); }
game.loadLevel = loadLevel;
game.playDaily = () => loadLevel(dailyLevel(dateKey()));

/* ---------- Hotseat-Versus (Audit 18.11.) ---------- */
// Schlacht-Modus: Blau und Rot malen nacheinander verdeckt mit eigenem Budget (hotseat.js, ui/hotseat.js)
const hotseat = createHotseatUI({ game, world, ui, renderer, audio, pointer, startBattle, markAll, rebuildHash, undoStack });
{ const kb = actions.keysBlocked; actions.keysBlocked = () => kb() || hotseat.covered(); }

/* ---------- Online 1 gegen 1 (18.11.) ---------- */
// Zwei Geräte über die Live-Verbindung des Artefakts (net.js, online.js, ui/online.js)
const online = createOnlineUI({ game, world, ui, audio, hotseat, onlineFight, clearWorld, undoStack, markAll });
{ const kb = actions.keysBlocked; actions.keysBlocked = () => kb() || online.covered(); }
// Code-Duell (18.11.): 1 gegen 1 nur mit Codes, ohne Live-Verbindung (duel.js, ui/duel.js)
const duel = createDuelUI({ game, world, ui, audio, online, onlineFight, clearWorld, undoStack, shareDlg, encode, enterBattle, editBattle, markAll });
{ const kb = actions.keysBlocked; actions.keysBlocked = () => kb() || duel.covered(); }

/* ---------- Schleife ---------- */
function drainEvents() {
  const ev = world.events;
  renderer.consume(ev);        // Gelände-Änderungen und Effekte (fx.js, mit Budget je Bild)
  audio.onEvents(ev, cam, game.slow);   // Töne mit Stereo nach Bildlage; Zeitlupe klingt tiefer
  for (let i = 0; i < ev.length; i++) ui.onEvent(ev[i]);
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
  if (game.replayState) {
    const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
    replayFrame(dt);
    renderer.setOverlay({ brushR: 0, missionZoneX: null, battleMidX: null, ranges: null });
    renderer.draw(world, cam, now / 1000);
    requestAnimationFrame(frame); return;
  }
  const rawMs = now - last;
  const realDt = Math.min(.05, Math.max(0, rawMs / 1000)); last = now;
  const w0 = performance.now();
  let simMs = 0, n = 0;
  const m = game.mission, bt = game.battle;
  const ts = (game.slow ? SLOW : 1) * game.speed * ((m && m.endT >= 0) || (bt && bt.endT >= 0) ? .35 : 1);
  // 10× auswerten: rechnet in einer eigenen Welt; die angezeigte steht solange still
  if (bt && bt.batch) pumpBatch(bt);
  if (!game.paused && !game.editor && !(m && m.phase === 'plan') && !(bt && (bt.phase === 'plan' || bt.batch))) {
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
    missionZoneX: (m && m.phase === 'plan') || game.editor ? zoneX(world) : null,
    battleMidX: bt && bt.phase === 'plan' ? world.W / 2 : null,
    ranges: m && m.phase === 'plan' && game.showRanges ? enemyRanges() : null,
  });
  hotseat.frame();   // Hotseat (Audit 18.11.): versteckte Seite, Deckkarten
  online.frame();    // Online 1 gegen 1: Kampfende melden, Modus verlassen
  duel.frame();      // Code-Duell: Antwort-Code nach dem Kampf
  renderer.draw(world, cam, now / 1000);

  uiT -= realDt; if (uiT <= 0) { uiT = .25; ui.updateCounts(); if (bt) ui.updateBattle(); if (game.editor) game.editorUI.tick(); coach.tick(); }
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
  vw = v.vw; vh = v.vh;
  // Nur Kamera und Leinwand: die Welt bleibt gleich groß, Einheiten, Gelände und Rückgängig bleiben unberührt
  resizeCamera(cam, vw, vh, world.W, world.H);
  renderer.resize(vw, vh);
  updatePad();
}
// Freier Platz zwischen oberer und unterer HUD-Leiste (#hudGap): ist neben dem Feld Platz (anderes Seitenverhältnis),
// rückt das Feld dorthin, statt unter den Leisten zu liegen
const hudGap = document.getElementById('hudGap');
function updatePad() {
  if (!hudGap) return;
  const g = hudGap.getBoundingClientRect(), h = host.getBoundingClientRect();
  setPadding(cam, g.top - h.top, h.bottom - g.bottom);
}
if (hudGap && typeof ResizeObserver === 'function') new ResizeObserver(updatePad).observe(hudGap);
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
// Erster Start (Audit 18.11.): Willkommen mit Tutorial, solange es weder gespielt noch übersprungen wurde
else if (!save.tutorial && !params.has('debug')) ui.showWelcome();
ui.refresh();
bindInput(renderer.canvas, cam, actions);
const gl = guardContext(renderer.canvas, document.getElementById('glLost'), { pause() {}, restored() { renderer.fx.clear(); markAll(); } });
requestAnimationFrame(t => { last = t; frame(t); });
