// Headless-Balance: node tools/balance.mjs missions|duels|newspam [runs=8] [WxH] [--chapter=id[,id]]
// --chapter (Spez. #52): nur die Level dieser Kapitel (game/js/campaign/), ohne: alle Kapitel. Pläne und Spam-Regeln
// stehen am Level (plan, spamMustLose, spamMustWin, spamMaxWins, answer; docs/kampagne.md).
// newspam (Vorgabe 6): je Level mit spamMustLose und je malbare Einheit, die dort erlaubt ist, ein Spam mit vollem
// Missionsbudget. Grundausbildung: Gate für NEW_UNITS: verliert mindestens 6/8 oder gewinnt höchstens so oft wie die
// Einheit derselben Rolle (SPAM_ROLE, plans.mjs); die übrigen Zeilen sind Auskunft. Neue Kapitel: jede erlaubte Einheit
// verliert mindestens 6/8, außer sie steht in level.answer. SPAM_TYPES=a,b (Umgebung) schränkt die Typen ein.
// missions meldet je Smart-Plan die mittlere Schlachtdauer (t~, Vorgabe 7).
// Ohne Formen läuft jede Weltform aus SHAPES (tools/plans.mjs) in einem eigenen Prozess (parallel);
// Exitcode 1, wenn bei irgendeiner Form eine Erwartung verfehlt ist.
// Pro Zeile "name  wins/runs  spent".
import { spawn as spawnProc } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { UNITS } from '../game/js/data.js';
import { createWorld } from '../game/js/world.js';
import { step, buildMission, missionResult } from '../game/js/sim.js';
import { UNIT_SPAM, unitSpamAllowed, unitSpamPlan, spamTypes, chapterSpamVerdict, selectLevels, parseArgs, NEW_UNITS, SPAM_ROLE, COUNTERS, DUEL_A, DUEL_B, SHAPES, placePlan, placeDuel, SUPPORT_DUELS, SUPPORT_REAR } from './plans.mjs';
import { spamMustLose, validateCampaign } from '../game/js/campaign/index.js';

const DT = 1 / 60;
const SMART_MIN = 6 / 8;      // Smart-Plan (Kosten ≤ par) gewinnt mindestens 6/8 (Task 14)
const SPAM_LOSE_MIN = 6 / 8;  // gelisteter Spam-Plan verliert mindestens 6/8
const SPAM_WIN_MIN = 6 / 8;   // Spam-Plan der Einstiegsmission M1 gewinnt mindestens 6/8
// M1 (spamMustWin) und M3 (spamMaxWins 4/8): Begründung in game/js/campaign/grundausbildung.js
const DUEL_MIN = 3 / 4;       // Konter gewinnt mindestens 3/4
const SUPPORT_MAX = 3 / 4;    // Armee aus halb Einheit, halb Helfer (Sanitäter) gewinnt höchstens 3/4 gegen die reine Einheit

const USAGE = 'usage: node tools/balance.mjs missions|duels|newspam [runs=8] [WxH] [--chapter=id[,id]]';
const { chapter: chapterArg, pos } = parseArgs(process.argv.slice(2));
const [cmd = 'missions', runsArg = '8', shapeArg] = pos;
const runs = Math.max(1, parseInt(runsArg, 10) || 8);
if (cmd !== 'missions' && cmd !== 'duels' && cmd !== 'newspam') { console.error(USAGE); process.exit(2); }
let LEVELS;
try { LEVELS = selectLevels(chapterArg); } catch (e) { console.error(e.message); console.error(USAGE); process.exit(2); }

if (!shapeArg) {
  // Alle Formen parallel, Ausgabe in fester Reihenfolge
  const self = fileURLToPath(import.meta.url);
  const results = await Promise.all(SHAPES.map(([W, H]) => new Promise(res => {
    const p = spawnProc(process.execPath, [self, cmd, String(runs), `${W}x${H}`, ...(chapterArg ? [`--chapter=${chapterArg}`] : [])]);
    let out = '';
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
    p.on('close', code => res({ shape: `${W}x${H}`, code, out }));
  })));
  const failed = [];
  for (const r of results) { process.stdout.write(`== ${r.shape}\n${r.out}`); if (r.code !== 0) failed.push(r.shape); }
  console.log(failed.length ? `FAILED at ${failed.join(', ')}` : `OK at all ${SHAPES.length} shapes`);
  process.exit(failed.length ? 1 : 0);
}

const [W, H] = shapeArg.split('x').map(Number);

function runMission(level, plan, seed) {
  const w = createWorld(W, H, seed); buildMission(w, level);
  const spent = placePlan(w, plan);
  let t = 0, res = missionResult(w, t);
  while (!res) { step(w, DT); w.events.length = 0; t += DT; res = missionResult(w, t); }
  return { res, spent, t };
}
const median = a => { const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };

// helper: Blau bekommt die Hälfte der Punkte in a und die Hälfte im Helfer (SUPPORT_DUELS)
function runDuel(a, b, pts, seed, helper = null) {
  const w = createWorld(W, H, seed); w.teamMode = true;
  const pa = helper ? pts / 2 : pts;
  const na = Math.max(1, Math.round(pa / UNITS[a].cost)), nb = Math.max(1, Math.round(pts / UNITS[b].cost));
  const nh = helper ? Math.max(1, Math.round(pts / 2 / UNITS[helper].cost)) : 0;
  placeDuel(w, a, na, DUEL_A, 'blau'); if (helper) placeDuel(w, helper, nh, SUPPORT_REAR, 'blau'); placeDuel(w, b, nb, DUEL_B, 'rot');
  let t = 0;
  for (;;) {
    let ca = 0, cb = 0;
    for (const u of w.units) if (u.alive) { if (u.team === 'blau') ca++; else cb++; }
    if (ca === 0 || cb === 0 || t >= 185) return { win: ca > 0 && cb === 0, spent: na * UNITS[a].cost + (helper ? nh * UNITS[helper].cost : 0) };
    step(w, DT); w.events.length = 0; t += DT;
  }
}

const pad = (s, n) => String(s).padEnd(n);
let ok = true;

if (cmd !== 'duels') {
  // Kapiteldaten (ids, Felder, Pläne nur aus erlaubten Einheiten und im Budget) der gewählten Level
  const ids = new Set(LEVELS.map(e => e.level.id));
  for (const m of validateCampaign()) if ([...ids].some(id => m.includes(`/${id}:`))) { ok = false; console.log(`FAIL (Daten) ${m}`); }
  if (!LEVELS.length) console.log(`(keine Level${chapterArg ? ` in ${chapterArg}` : ''})`);
}

if (cmd === 'missions') {
  for (const e of LEVELS) {
    const { level: L, tag } = e;
    for (const kind of ['smart', 'spam']) {
      const plan = L.plan && L.plan[kind];
      if (!plan) { if (kind === 'smart') { ok = false; console.log(`${pad(`${tag} smart ${L.n}`, 32)}  FAIL (kein plan.smart)`); } continue; }
      let wins = 0, spent = 0; const ts = [];
      for (let s = 1; s <= runs; s++) { const r = runMission(L, plan, e.seed(s)); if (r.res === 'win') wins++; spent = r.spent; ts.push(r.t); }
      let note = '';
      if (kind === 'smart') {
        note = `t~${median(ts).toFixed(1)}s`;
        if (wins / runs < SMART_MIN) { ok = false; note += ' FAIL (smart < 6/8 wins)'; }
        if (spent > L.par) { ok = false; note += ` FAIL (smart costs > par ${L.par})`; }
      }
      else if (spamMustLose(L)) { if ((runs - wins) / runs < SPAM_LOSE_MIN) { ok = false; note = 'FAIL (spam < 6/8 losses)'; } }
      else if (L.spamMustWin) { if (wins / runs < SPAM_WIN_MIN) { ok = false; note = `FAIL (${tag} spam < 6/8 wins)`; } }
      else if (L.spamMaxWins != null) { if (wins / runs > L.spamMaxWins) { ok = false; note = `FAIL (${tag} spam > ${L.spamMaxWins * runs}/${runs} wins)`; } }
      else note = '(not checked)';
      console.log(`${pad(`${tag} ${kind} ${L.n}`, 32)}  ${pad(`${wins}/${runs}`, 6)}  ${pad(Math.round(spent * 100) / 100, 6)}  ${note}`.trimEnd());
    }
  }
  // Spam einer einzelnen neuen Einheit (UNIT_SPAM, volles Budget) muss dort verlieren, wo der Spam-Plan verlieren muss
  // (in neuen Kapiteln nicht, wenn sie die Lösung ist: answer)
  for (const type of UNIT_SPAM) for (const e of LEVELS) {
    const { level: L, tag } = e;
    if (!spamMustLose(L) || !unitSpamAllowed(L, type) || (e.ci > 0 && (L.answer || []).includes(type))) continue;
    const plan = unitSpamPlan(L, type);
    let wins = 0, spent = 0;
    for (let s = 1; s <= runs; s++) { const r = runMission(L, plan, e.seed(s)); if (r.res === 'win') wins++; spent = r.spent; }
    let note = '';
    if ((runs - wins) / runs < SPAM_LOSE_MIN) { ok = false; note = `FAIL (${type} spam < 6/8 losses)`; }
    console.log(`${pad(`${tag} ${type}x${plan[0][1]} ${L.n}`, 32)}  ${pad(`${wins}/${runs}`, 6)}  ${pad(spent, 6)}  ${note}`.trimEnd());
  }
} else if (cmd === 'newspam') {
  const only = process.env.SPAM_TYPES ? process.env.SPAM_TYPES.split(',') : null;
  const pick = t => !only || only.includes(t) || only.some(o => SPAM_ROLE[o] === t);
  const spam = (e, type) => {
    const plan = unitSpamPlan(e.level, type);
    let wins = 0, spent = 0;
    for (let s = 1; s <= runs; s++) { const r = runMission(e.level, plan, e.seed(s)); if (r.res === 'win') wins++; spent = r.spent; }
    return { wins, spent, n: plan[0][1] };
  };
  for (const e of LEVELS) {
    const L = e.level;
    if (!spamMustLose(L)) continue;
    const res = new Map();
    for (const type of spamTypes(L)) if (pick(type)) res.set(type, spam(e, type));
    for (const [type, { wins, spent, n }] of res) {
      let note = '';
      if (e.ci > 0) {
        // neue Kapitel (Spez. #52): jede erlaubte Einheit verliert, außer der Lösung (answer)
        const v = chapterSpamVerdict(L, type, wins, runs, SPAM_LOSE_MIN);
        if (!v.ok) ok = false;
        note = v.note;
      } else {
        const lose = (runs - wins) / runs >= SPAM_LOSE_MIN, ref = SPAM_ROLE[type], rr = ref && res.get(ref);
        if (!NEW_UNITS.includes(type)) note = lose ? '' : '(info: wins)';
        else if (!lose && (L.answer || []).includes(type)) note = 'ok: Lösung der Mission (SPAM_ANSWER)';
        else if (!lose && rr && wins <= rr.wins) note = `ok: <= ${ref} ${rr.wins}/${runs}`;
        else if (!lose) { ok = false; note = `FAIL (${type} spam < 6/8 losses${rr ? `, > ${ref} ${rr.wins}/${runs}` : ''})`; }
      }
      console.log(`${pad(`${e.tag} ${type}x${n}`, 22)}  ${pad(`${wins}/${runs}`, 6)}  ${pad(Math.round(spent * 100) / 100, 6)}  ${note}`.trimEnd());
    }
  }
} else {
  for (const [a, b, pts] of COUNTERS) {
    let wins = 0, spent = 0;
    for (let s = 1; s <= runs; s++) { const r = runDuel(a, b, pts, 500 + s); if (r.win) wins++; spent = r.spent; }
    const note = wins / runs < DUEL_MIN ? 'FAIL (< 3/4 wins)' : '';
    if (note) ok = false;
    console.log(`${pad(`${a}>${b}@${pts}`, 24)}  ${pad(`${wins}/${runs}`, 6)}  ${pad(spent, 6)}  ${note}`.trimEnd());
  }
  for (const [a, h, b, pts] of SUPPORT_DUELS) {
    let wins = 0, spent = 0;
    for (let s = 1; s <= runs; s++) { const r = runDuel(a, b, pts, 500 + s, h); if (r.win) wins++; spent = r.spent; }
    const note = wins / runs > SUPPORT_MAX ? `FAIL (> ${SUPPORT_MAX * runs}/${runs} wins)` : '';
    if (note) ok = false;
    console.log(`${pad(`${a}+${h}!>${b}@${pts}`, 24)}  ${pad(`${wins}/${runs}`, 6)}  ${pad(spent, 6)}  ${note}`.trimEnd());
  }
}

console.log(ok ? 'OK' : 'FAILED');
process.exit(ok ? 0 : 1);
