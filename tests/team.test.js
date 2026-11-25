// 2 gegen 2 (team.js): Sitze, Runden, Armeen tauschen, Staffel mit Finale und gemeinsames Feld
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS } from '../game/js/data.js';
import { ruleAllows } from '../game/js/rules.js';
import { packArmy, PAINT_TYPES } from '../game/js/online.js';
import {
  createTeamMatch, teamView, teamPeers, hostStart, teamReady, teamResult, teamNext, newRound, validCfg, seatZone, seatArmy,
  seatBudget, roundLists, createRun, finaleList, staffelWinner, missing, SEAT_TEAM, SOLO_RULES, full,
} from '../game/js/team.js';

const W = 1600, H = 900;
const peersFor = (all, me) => all.map(x => ({ peer: x.me, isMe: x === me, presence: JSON.parse(JSON.stringify(teamView(x))) }));
function tick(all) { const ev = all.map(() => []); for (let k = 0; k < 3; k++) all.forEach((m, i) => ev[i].push(...teamPeers(m, peersFor(all, m), W, H))); return ev; }
function lobby(mode) {
  const ms = [createTeamMatch('host', mode, 100, () => 0.42), createTeamMatch('guest'), createTeamMatch('guest'), createTeamMatch('guest')];
  ms.forEach((m, i) => { m.me = 'p' + i; m.name = 'S' + i; });
  ms[0].seats[0] = 'p0';
  tick(ms);   // erst ohne Wunsch: alle sitzen der Reihe nach
  ms[1].pref = 'rot'; ms[2].pref = 'blau'; ms[3].pref = 'rot';
  tick(ms);
  return ms;
}
// Armee für einen Sitz: billigste erlaubte Einheit, in der Mitte seines Bereichs
function armyFor(cfg, seat, n = 8) {
  const t = PAINT_TYPES.filter(t => ruleAllows(cfg.cats[seat], t) && !UNITS[t].fly).sort((a, b) => UNITS[a].cost - UNITS[b].cost)[0];
  const z = seatZone(cfg.mode, seat), units = [];
  for (let i = 0; i < n && (i + 1) * UNITS[t].cost <= seatBudget(cfg, seat); i++) {
    units.push({ type: t, team: SEAT_TEAM[seat], alive: true, x: W * (z.x[0] + z.x[1]) / 2 + (i % 3) * 14 - 14, y: H * (z.y[0] + z.y[1]) / 2 + Math.floor(i / 3) * 14 - 14 });
  }
  return packArmy({ units, W, H }, SEAT_TEAM[seat]);
}

test('Lobby: Sitze nach Wunsch-Team, Host sitzt auf 0, Gäste kennen ihren Sitz', () => {
  const ms = lobby('staffel');
  assert.ok(full(ms[0]));
  ms.forEach((m, i) => assert.ok(m.seat >= 0, 'Spieler ' + i + ' hat einen Sitz'));
  assert.equal(ms[0].seat, 0);
  assert.equal(SEAT_TEAM[ms[1].seat], 'rot'); assert.equal(SEAT_TEAM[ms[2].seat], 'blau'); assert.equal(SEAT_TEAM[ms[3].seat], 'rot');
  assert.deepEqual(new Set(ms.map(m => m.seat)), new Set([0, 1, 2, 3]));
  // Teamwechsel: Spieler 2 will zu Rot, dort wollen beide bleiben → bleibt
  ms[2].pref = 'rot'; tick(ms); assert.equal(SEAT_TEAM[ms[2].seat], 'blau');
  // Spieler 3 hat keinen Wunsch mehr: Spieler 2 tauscht mit ihm
  ms[3].pref = null; tick(ms);
  assert.equal(SEAT_TEAM[ms[2].seat], 'rot'); assert.equal(SEAT_TEAM[ms[3].seat], 'blau');
  // Spieler 3 geht: Sitz frei; kommt er wieder, sitzt er wieder
  const three = ms.pop(); tick(ms); assert.ok(!full(ms[0]));
  ms.push(three); tick(ms); assert.ok(full(ms[0]));
});

test('Runden: Staffel alle gleiche Regel, Feld vier verschiedene Kategorien', () => {
  const s = newRound(null, 'staffel', 100, () => 0.3), f = newRound(null, 'feld', 100, () => 0.3);
  assert.ok(validCfg(s) && validCfg(f));
  assert.equal(new Set(s.cats).size, 1);
  assert.equal(new Set(f.cats).size, 4); assert.ok(f.cats.every(c => SOLO_RULES.includes(c)));
  assert.deepEqual(seatZone('feld', 3), { x: [0.5, 1], y: [0.5, 1] });
  assert.deepEqual(seatZone('staffel', 1), { x: [0, 0.5], y: [0, 1] });
  assert.ok(!validCfg({ ...f, cats: ['x', 'y', 'z', 'w'] }));
});

test('Armee im falschen Viertel wird abgelehnt', () => {
  const cfg = newRound(null, 'feld', 100, () => 0.3);
  const top = armyFor(cfg, 0);
  assert.ok(seatArmy(top, cfg, 0, W, H).length > 0);
  assert.throws(() => seatArmy(top, { ...cfg, cats: [cfg.cats[0], cfg.cats[0], cfg.cats[2], cfg.cats[3]] }, 1, W, H));
});

for (const mode of ['staffel', 'feld']) {
  test(`Ganze Runde ${mode}: Armeen tauschen, alle rechnen dasselbe, Punkt und nächste Runde`, () => {
    const ms = lobby(mode);
    assert.deepEqual(hostStart(ms[0]), ['round']);
    const ev = tick(ms);
    ms.forEach((m, i) => { assert.equal(m.phase, 'paint', 'Spieler ' + i); assert.equal(m.cfg.mode, mode); });
    assert.ok(ev.slice(1).every(e => e.includes('round')));
    ms.forEach(m => teamReady(m, armyFor(m.cfg, m.seat, m.seat === 0 ? 12 : 6)));
    const ev2 = tick(ms);
    ms.forEach((m, i) => { assert.equal(m.phase, 'fight', 'Spieler ' + i); assert.ok(ev2[i].includes('fight')); assert.deepEqual(m.errors, []); });
    // jedes Gerät rechnet: gleiche Ergebnisse
    const outcome = m => {
      const res = roundLists(m.cfg, m.armies).map((l, k) => { const c = createRun(l, m.cfg.map, k ? m.cfg.seed2 + 1 : m.cfg.seed, W, H); c.pump(); return c.result; });
      if (m.cfg.mode === 'feld') return res[0].winner;
      const fl = finaleList(res, W);
      if (!fl) return staffelWinner(res);
      const c = createRun(fl, m.cfg.map, m.cfg.seed2, W, H); c.pump();
      assert.ok(fl.every(u => (u.team === 'blau' ? u.x <= W / 2 : u.x >= W / 2)));
      return c.result.winner;
    };
    const w0 = outcome(ms[0]), w3 = outcome(ms[3]);
    assert.equal(w0, w3);
    ms.forEach(m => teamResult(m, w0));
    if (w0 !== 'draw') assert.equal(ms[0].score[w0], 1);
    ms.forEach(m => teamNext(m));
    tick(ms);
    ms.forEach((m, i) => { assert.equal(m.cfg.r, 2, 'Spieler ' + i); assert.equal(m.phase, 'paint'); });
    assert.deepEqual(missing(ms[1], peersFor(ms.slice(0, 3), ms[1])), [ms[3].seat]);
  });
}
