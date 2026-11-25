// KI-Gegner (25.11., bot.js, botroom.js, team.js bots): faire Armeen in allen Stufen, Formationen, 1v1 gegen die KI über
// dieselbe Zustandsmaschine wie online, 2v2 mit KI-Sitzen beim Host.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBotArmy, makeCtx, packBot, unpackBot, BOT_LEVELS, botVote, shapePoints } from '../game/js/bot.js';
import { createBotRoom } from '../game/js/botroom.js';
import {
  createMatch, view, onPeer, hostStart, castVote, markReady, finishFight, wantNext, proposeSet, packUnits, unpackArmy, PAINT_TYPES, PROTO, pickPeer,
} from '../game/js/online.js';
import { RULE_IDS, MAP_IDS, ruleBudget, ruleAllows } from '../game/js/rules.js';
import { SHAPE_MIN_UNITS } from '../game/js/shapes.js';
import {
  createTeamMatch, teamView, teamPeers, hostStart as teamStart, teamReady, addBot, removeBot, setBotArm, botsWant, teamResult, teamNext,
  seatZone, seatBudget, full, missing, SEAT_TEAM,
} from '../game/js/team.js';

const W = 1600, H = 900;
const rng = s => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

test('KI: jede Stufe malt gültige Armeen (Regel, Budget, eigene Hälfte), mittel und schwer mit Formationen', () => {
  const rand = rng(3);
  let shaped = 0;
  for (let i = 0; i < 12; i++) {
    const cat = RULE_IDS[i * 7 % RULE_IDS.length], map = MAP_IDS[i % MAP_IDS.length], side = i % 2 ? 'rot' : 'blau';
    for (const lvl of ['leicht', 'mittel']) {
      const ctx = makeCtx({ W, H, side, cat, budget: ruleBudget(cat, 150), map });
      const a = createBotArmy(ctx, lvl, rand); assert.ok(a.pump());
      assert.ok(a.result.length > 0, `${lvl} ${cat}: leer`);
      for (const u of a.result) assert.ok(ruleAllows(cat, u.type), `${u.type} nicht in ${cat}`);
      const back = unpackArmy(packUnits(a.result, W, H), side, W, H, { cat, budget: 150 });
      assert.equal(back.length, a.result.length);
      if (lvl === 'leicht') assert.ok(back.every(u => !u.shape), 'leicht ohne Formationen');
      else shaped += back.filter(u => u.shape).length;
    }
  }
  assert.ok(shaped > 30, 'mittel nutzt Formationen');
});

test('KI schwer: probiert Armeen in Probeschlachten aus, in Häppchen', () => {
  const ctx = makeCtx({ W, H, side: 'rot', cat: 'armee', budget: 100, map: 'feld' });
  const s = createBotArmy(ctx, 'schwer', rng(5), { n: 3, maxT: 12 });
  let calls = 0;
  while (!s.pump(30)) calls++;
  assert.ok(calls > 1, 'mehrere Häppchen');
  assert.ok(s.tried >= 3);
  unpackArmy(packUnits(s.result, W, H), 'rot', W, H, { cat: 'armee', budget: 100 });
});

test('KI: Formen liegen sichtbar als Linie, Pfeil zum Gegner und Ring', () => {
  const line = shapePoints('linie', 12, 20, 1, 800);
  assert.equal(new Set(line.map(p => p[0])).size, 1, 'eine Reihe');
  const wedge = shapePoints('keil', 9, 20, 1, 800);
  assert.ok(wedge.every(p => p[0] <= 0), 'Spitze vorn (Gegner rechts)');
  const ring = shapePoints('kreis', 10, 20, 1, 800);
  assert.equal(ring.length, 10);
  assert.ok(SHAPE_MIN_UNITS <= 6);
});

test('KI-Kurzform: drei Bytes je Einheit, Seite und Form bleiben', () => {
  const us = [{ type: 'ritter', x: 700, y: 300, shape: 'linie' }, { type: 'schuetze', x: 100, y: 850, shape: null }];
  const c = packBot(us, 'blau', W, H, PAINT_TYPES);
  assert.equal(c.length, 8);
  const back = unpackBot(c, 'blau', W, H, PAINT_TYPES);
  assert.equal(back[0].type, 'ritter'); assert.equal(back[0].shape, 'linie');
  assert.ok(Math.abs(back[0].x - 700) < 4 && Math.abs(back[1].y - 850) < 4);
  const red = unpackBot(packBot([{ type: 'wolf', x: 1500, y: 10 }], 'rot', W, H, PAINT_TYPES), 'rot', W, H, PAINT_TYPES);
  assert.ok(red[0].x > W / 2 && Math.abs(red[0].x - 1500) < 4);
  assert.throws(() => unpackBot('$$', 'rot', W, H, PAINT_TYPES));
});

test('KI: stimmt nur über Angebotenes ab', () => {
  for (const l of BOT_LEVELS) {
    const v = botVote({ rules: ['armee', 'tiere', 'luft'], maps: ['feld', 'see', 'wald'] }, l, rng(9));
    assert.ok(['armee', 'tiere', 'luft'].includes(v.rule) && ['feld', 'see', 'wald'].includes(v.map));
  }
});

// Raum gegen die KI mit sofortigen Uhren; der Mensch (Host) spielt über online.js wie im Spiel
const fast = { set: (f) => setTimeout(f, 0), clear: id => clearTimeout(id), now: () => Date.now() + 1e9, perf: () => performance.now() };
const until = async (f, ms = 20000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error('Zeit um'); await new Promise(r => setTimeout(r, 2)); } };

test('1v1 gegen die KI: Abstimmung, verdeckt malen, Armeen tauschen, Ergebnis, Revanche, Regeländerung', async () => {
  const room = createBotRoom({ level: 'mittel', W, H, rand: rng(11), timers: fast });
  const m = createMatch('host', { budget: 150 }, rng(12));
  const log = [];
  const sync = () => {
    const p = pickPeer(room.peers(), 'guest');
    if (!p) return;
    if (!m.cfg) log.push(...hostStart(m));
    log.push(...onPeer(m, p.presence, W, H));
    room.presence(view(m));
  };
  room.onPeers(sync);
  room.presence(view(m));
  await until(() => m.phase === 'vote');
  castVote(m, m.cfg.opts.rules[0], m.cfg.opts.maps[0]); room.presence(view(m));
  await until(() => m.phase === 'paint');
  assert.ok(m.cfg.cat);
  markReady(m, packUnits([{ type: PAINT_TYPES.find(t => ruleAllows(m.cfg.cat, t)), x: 600, y: 400 }], W, H)); room.presence(view(m));
  await until(() => m.phase === 'fight');
  const bot = m.fight.units.filter(u => u.team === 'rot');
  assert.ok(bot.length > 0, 'die KI hat gemalt');
  assert.ok(bot.every(u => ruleAllows(m.cfg.cat, u.type)));
  finishFight(m, 'blau'); room.presence(view(m));
  await until(() => room.bot.match.phase === 'result');
  // Regeländerung: die KI nimmt an
  proposeSet(m, { budget: 400 }); room.presence(view(m));
  await until(() => m.set.budget === 400);
  // Revanche: die KI will, was ich will
  wantNext(m, true); room.presence(view(m));
  await until(() => m.cfg.r === 2 && m.phase === 'paint');
  assert.ok(m.cfg.rematch);
  room.leave();
});

test('2v2 mit KI: Host setzt KI in beide Teams, Gäste sehen sie, alle vier Armeen kommen zusammen', () => {
  const host = createTeamMatch('host', 'feld', 100, rng(4));
  host.me = 'H'; host.seats[0] = 'H'; host.name = 'Silas';
  const guest = createTeamMatch('guest', 'feld', 100); guest.me = 'G'; guest.name = 'Gast'; guest.pref = 'rot';
  const peersFor = who => [
    { peer: 'H', isMe: who === 'H', presence: teamView(host) },
    { peer: 'G', isMe: who === 'G', presence: teamView(guest) },
  ];
  teamPeers(host, peersFor('H'), W, H);
  assert.ok(addBot(host, 'schwer', 'blau'));
  assert.ok(addBot(host, 'leicht', 'rot'));
  assert.ok(!addBot(host, 'mittel', 'rot'), 'kein Platz mehr');
  teamPeers(host, peersFor('H'), W, H);
  teamPeers(guest, peersFor('G'), W, H);
  assert.ok(full(host));
  assert.deepEqual(guest.seats, host.seats);
  assert.equal(SEAT_TEAM[guest.seats.indexOf('G')], 'rot');
  assert.deepEqual(missing(guest, peersFor('G'), W, H), [], 'KI gilt beim Gast als anwesend');
  // KI raus und wieder rein
  assert.ok(removeBot(host, 'k2')); teamPeers(host, peersFor('H'), W, H); assert.ok(!full(host));
  assert.ok(addBot(host, 'leicht', 'rot')); teamPeers(host, peersFor('H'), W, H); assert.ok(full(host));
  teamStart(host);
  teamPeers(guest, peersFor('G'), W, H);
  assert.equal(guest.phase, 'paint');
  // Menschen malen
  for (const [mm, seat] of [[host, 0], [guest, guest.seats.indexOf('G')]]) {
    const z = seatZone('feld', seat), side = SEAT_TEAM[seat];
    const t = PAINT_TYPES.find(x => ruleAllows(mm.cfg.cats[seat], x));
    teamReady(mm, packUnits([{ type: t, x: (z.x[0] + z.x[1]) / 2 * W, y: (z.y[0] + z.y[1]) / 2 * H }], W, H));
    void side;
  }
  // KI malt beim Host
  for (const b of host.bots) {
    const seat = host.seats.indexOf(`H~${b.id}`), z = seatZone('feld', seat);
    const ctx = makeCtx({ W, H, side: SEAT_TEAM[seat], zone: z, cat: host.cfg.cats[seat], budget: seatBudget(host.cfg, seat), map: host.cfg.map, cap: 100 });
    const a = createBotArmy(ctx, 'mittel', rng(seat + 1)); a.pump();
    setBotArm(host, b.id, packBot(a.result, SEAT_TEAM[seat], W, H, PAINT_TYPES));
  }
  const evH = teamPeers(host, peersFor('H'), W, H), evG = teamPeers(guest, peersFor('G'), W, H);
  assert.ok(evH.includes('fight') && evG.includes('fight'), 'alle vier Armeen da');
  assert.deepEqual(host.errors, []); assert.deepEqual(guest.errors, []);
  assert.deepEqual(JSON.stringify(host.armies), JSON.stringify(guest.armies), 'beide Geräte stellen dieselben Armeen auf');
  assert.ok(new TextEncoder().encode(JSON.stringify(teamView(host))).length < 4096, 'presence des Hosts unter 4 KiB');
  teamResult(host, 'blau'); teamResult(guest, 'blau');
  botsWant(host); teamNext(guest);
  teamPeers(host, peersFor('H'), W, H);
  const ev = teamNext(host);
  assert.ok(ev.includes('round'), 'nächste Runde, wenn alle Menschen und die KI wollen');
});

test('KI-Kurzform: Geräte mit verschiedener Feldgröße packen dieselbe Armee', () => {
  const us = [];
  for (let q = 0; q < 256; q++) us.push({ type: 'krieger', x: (q + .3) / 256 * 800, y: (q + .6) / 256 * 900 });
  const c = packBot(us, 'blau', 1600, 900, PAINT_TYPES);
  const a = packUnits(unpackBot(c, 'blau', 1600, 900, PAINT_TYPES), 1600, 900);
  for (const [w, h] of [[1726, 820], [1400, 1050], [1366, 768], [2560, 1300]]) assert.equal(packUnits(unpackBot(c, 'blau', w, h, PAINT_TYPES), w, h), a);
});
