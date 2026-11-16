// Headless-Balance: node tools/balance.mjs missions|duels [runs=8]
// Gibt pro Zeile "name  wins/runs  spent" aus; Exitcode 1, wenn eine Erwartung verfehlt ist.
import { UNITS, MISSIONS } from '../game/js/data.js';
import { createWorld } from '../game/js/world.js';
import { step, buildMission, missionResult, placeRect } from '../game/js/sim.js';
import { MISSION_PLANS, SPAM_MUST_LOSE, COUNTERS, DUEL_A, DUEL_B, placePlan } from './plans.mjs';

const W = 1400, H = 1050, DT = 1 / 60;
const SMART_MIN = 6 / 8;      // Smart-Plan (Kosten ≤ par) gewinnt mindestens 6/8 (Task 14)
const SPAM_LOSE_MIN = 6 / 8;  // gelisteter Spam-Plan verliert mindestens 6/8
const SPAM_WIN_MIN = 6 / 8;   // Spam-Plan der Einstiegsmission M1 gewinnt mindestens 6/8
const DUEL_MIN = 3 / 4;       // Konter gewinnt mindestens 3/4

const [cmd = 'missions', runsArg = '8'] = process.argv.slice(2);
const runs = Math.max(1, parseInt(runsArg, 10) || 8);

function runMission(i, plan, seed) {
  const w = createWorld(W, H, seed); buildMission(w, i);
  const spent = placePlan(w, plan);
  let t = 0, res = missionResult(w, t);
  while (!res) { step(w, DT); w.events.length = 0; t += DT; res = missionResult(w, t); }
  return { res, spent };
}

function runDuel(a, b, pts, seed) {
  const w = createWorld(W, H, seed); w.teamMode = true;
  const na = Math.max(1, Math.round(pts / UNITS[a].cost)), nb = Math.max(1, Math.round(pts / UNITS[b].cost));
  placeRect(w, a, na, ...DUEL_A, 'blau'); placeRect(w, b, nb, ...DUEL_B, 'rot');
  let t = 0;
  for (;;) {
    let ca = 0, cb = 0;
    for (const u of w.units) if (u.alive) { if (u.team === 'blau') ca++; else cb++; }
    if (ca === 0 || cb === 0 || t >= 185) return { win: ca > 0 && cb === 0, spent: na * UNITS[a].cost };
    step(w, DT); w.events.length = 0; t += DT;
  }
}

const pad = (s, n) => String(s).padEnd(n);
let ok = true;

if (cmd === 'missions') {
  for (let i = 0; i < MISSION_PLANS.length; i++) {
    for (const kind of ['smart', 'spam']) {
      let wins = 0, spent = 0;
      for (let s = 1; s <= runs; s++) { const r = runMission(i, MISSION_PLANS[i][kind], 1000 * (i + 1) + s); if (r.res === 'win') wins++; spent = r.spent; }
      let note = '';
      if (kind === 'smart') {
        if (wins / runs < SMART_MIN) { ok = false; note = 'FAIL (smart < 6/8 wins)'; }
        if (spent > MISSIONS[i].par) { ok = false; note += `${note ? ' ' : ''}FAIL (smart costs > par ${MISSIONS[i].par})`; }
      }
      else if (SPAM_MUST_LOSE.includes(i)) { if ((runs - wins) / runs < SPAM_LOSE_MIN) { ok = false; note = 'FAIL (spam < 6/8 losses)'; } }
      else if (i === 0) { if (wins / runs < SPAM_WIN_MIN) { ok = false; note = 'FAIL (M1 spam < 6/8 wins)'; } }
      else note = '(not checked)';
      console.log(`${pad(`M${i + 1} ${kind} ${MISSIONS[i].n}`, 32)}  ${pad(`${wins}/${runs}`, 6)}  ${pad(spent, 6)}  ${note}`.trimEnd());
    }
  }
} else if (cmd === 'duels') {
  for (const [a, b, pts] of COUNTERS) {
    let wins = 0, spent = 0;
    for (let s = 1; s <= runs; s++) { const r = runDuel(a, b, pts, 500 + s); if (r.win) wins++; spent = r.spent; }
    const note = wins / runs < DUEL_MIN ? 'FAIL (< 3/4 wins)' : '';
    if (note) ok = false;
    console.log(`${pad(`${a}>${b}@${pts}`, 24)}  ${pad(`${wins}/${runs}`, 6)}  ${pad(spent, 6)}  ${note}`.trimEnd());
  }
} else {
  console.error('usage: node tools/balance.mjs missions|duels [runs=8]');
  process.exit(2);
}

console.log(ok ? 'OK' : 'FAILED');
process.exit(ok ? 0 : 1);
