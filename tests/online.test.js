// Online 1 gegen 1 (18.11.): game/js/online.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn } from '../game/js/world.js';
import { UNITS } from '../game/js/data.js';
import { createStroke } from '../game/js/paint.js';
import { createRng } from '../game/js/rng.js';
import { createHot, hotPaint } from '../game/js/hotseat.js';
import { applyShape } from '../game/js/shapes.js';
import { snapshotBattle, resetFight } from '../game/js/battle.js';
import { step, battleWinner } from '../game/js/sim.js';
import {
  makeCode, normCode, roomName, nextRound, roundDef, packArmy, unpackArmy, splitChunks, createMatch, view, hostStart,
  markReady, finishFight, wantNext, onPeer, officialWinner, pickPeer, openRooms, ONLINE_CATS, CHUNK, castVote, randomRound, budgetOf, giveUp, canGiveUp,
} from '../game/js/online.js';
import { RULES, RULE_IDS, MAP_IDS, ruleAllows, applyMap, mapParts, resolveVote, mapSVG } from '../game/js/rules.js';
const allowed = (rule, maxCost = 6) => Object.keys(UNITS).filter(t => ruleAllows(rule, t) && UNITS[t].cost < maxCost);

const W = 1600, H = 900;

test('Online: Codes sind 4 Zeichen ohne Verwechsler, Eingabe wird normalisiert', () => {
  const rng = createRng(3);
  for (let i = 0; i < 50; i++) { const c = makeCode(rng); assert.match(c, /^[A-HJKMNP-Z2-9]{4}$/); assert.equal(normCode(c.toLowerCase()), c); }
  assert.equal(normCode(' kx-7p '), 'KX7P');
  assert.equal(normCode('KX7'), null);
  assert.equal(normCode('IO01'), null);
  assert.equal(roomName('KX7P'), 'ks1v1-kx7p');
});

test('Online: Runden bieten drei Regeln und drei Karten zur Wahl, nie die Regel der letzten Runde', () => {
  const rng = createRng(9);
  let c = randomRound(null, 150, rng);
  assert.equal(c.r, 1); assert.ok(ONLINE_CATS.includes(c.cat)); assert.ok(MAP_IDS.includes(c.map)); assert.equal(c.budget, 150);
  const seen = new Set([c.cat]), maps = new Set();
  for (let i = 0; i < 60; i++) {
    const n = nextRound(c, 150, rng);
    assert.equal(n.cat, null); assert.equal(n.opts.rules.length, 3); assert.equal(n.opts.maps.length, 3);
    assert.equal(new Set(n.opts.rules).size, 3); assert.ok(!n.opts.rules.includes(c.cat));
    n.opts.rules.forEach(x => seen.add(x)); n.opts.maps.forEach(x => maps.add(x));
    c = { ...n, cat: n.opts.rules[0] };
  }
  assert.equal(seen.size, RULE_IDS.length); assert.equal(maps.size, MAP_IDS.length);
  assert.equal(nextRound(null, 999, rng).budget, 150);
  assert.deepEqual(roundDef({ cat: 'tiere', budget: 100 }).cats, ['tiere']);
});

test('Regeln: gemischte und Eigenschafts-Regeln erlauben die richtigen Einheiten, jede hat genug Auswahl', () => {
  assert.ok(ruleAllows('wildnis', 'ritter') && ruleAllows('wildnis', 'wolf') && !ruleAllows('wildnis', 'panzer'));
  assert.ok(ruleAllows('fern', 'schuetze') && !ruleAllows('fern', 'krieger') && !ruleAllows('fern', 'sani'));
  assert.ok(ruleAllows('luft', 'drache') && !ruleAllows('luft', 'panzer'));
  assert.ok(ruleAllows('alles', 'panzer') && !ruleAllows('alles', 'ghul'));
  for (const r of RULES) {
    const n = Object.keys(UNITS).filter(t => ruleAllows(r.id, t)).length;
    assert.ok(n >= 4, `${r.id}: ${n} Einheiten`);
    assert.ok(Object.keys(UNITS).some(t => ruleAllows(r.id, t) && UNITS[t].cost <= 100), r.id);
  }
  assert.deepEqual(resolveVote('a', 'a', () => .9), { pick: 'a', agreed: true });
  assert.equal(resolveVote('a', 'b', () => .2).pick, 'a'); assert.equal(resolveVote('a', 'b', () => .7).pick, 'b');
});

test('Karten: spiegelgleich für beide Seiten, Gelände gehört niemandem', () => {
  for (const id of MAP_IDS) {
    const w = createWorld(W, H, 1); applyMap(w, id);
    for (let gy = 0; gy < w.GH; gy++) for (let gx = 0; gx < w.GW; gx++) {
      const i = gy * w.GW + gx, j = gy * w.GW + (w.GW - 1 - gx);
      assert.equal(w.terr[i], w.terr[j], `${id} nicht spiegelgleich bei ${gx},${gy}`);
      assert.equal(w.towner[i], 0);
    }
    if (id !== 'feld') assert.ok(w.terr.some(x => x), id);
    assert.match(mapSVG(id), /^<svg/);
  }
  assert.equal(mapParts('nix').length, 0);
});

test('Karten: jede Karte lässt Bodentruppen ohne Lava und Mauer von links nach rechts durch', () => {
  for (const id of MAP_IDS) {
    const w = createWorld(W, H, 1); applyMap(w, id);
    const { GW, GH, terr } = w, free = i => terr[i] !== 2 && terr[i] !== 4, seen = new Uint8Array(GW * GH), q = [];
    for (let gy = 0; gy < GH; gy++) { const i = gy * GW; if (free(i)) { seen[i] = 1; q.push(i); } }
    let ok = false;
    while (q.length && !ok) {
      const i = q.pop(), gx = i % GW;
      if (gx === GW - 1) ok = true;
      for (const j of [gx > 0 ? i - 1 : -1, gx < GW - 1 ? i + 1 : -1, i - GW, i + GW]) if (j >= 0 && j < GW * GH && !seen[j] && free(j)) { seen[j] = 1; q.push(j); }
    }
    assert.ok(ok, `${id}: kein Durchgang`);
  }
});

test('Regeln: Budget-Varianten ändern das Budget der Runde, kommende Kategorien bleiben bis dahin aus', () => {
  assert.equal(budgetOf({ cat: 'titanen', budget: 150 }), 300);
  assert.equal(budgetOf({ cat: 'spar', budget: 150 }), 75);
  assert.equal(budgetOf({ cat: 'armee', budget: 150 }), 150);
  assert.equal(roundDef({ cat: 'horde', budget: 100 }).budget, 200);
  const w = createWorld(W, H, 3); w.teamMode = true;
  for (let i = 0; i < 4; i++) spawn(w, 'drache', 100 + i * 100, 300, 'blau');   // 160 Punkte
  const txt = packArmy(w, 'blau');
  assert.equal(unpackArmy(txt, 'blau', W, H, { cat: 'titanen', budget: 100 }).length, 4);
  assert.throws(() => unpackArmy(txt, 'blau', W, H, { cat: 'titanen', budget: 50 }), /Budget/);
  const cats = new Set(Object.values(UNITS).map(T => T.cat));
  for (const r of RULES) if (r.cats) assert.ok(r.cats.every(c => cats.has(c)), `${r.id} braucht eine Kategorie, die es noch nicht gibt`);
  assert.equal(RULE_IDS.includes('urzeit'), cats.has('urzeit'));
});

// Eine Seite malt mit den Regeln der Runde (hotseat.js mit def = Kategorie)
function paintSide(world, side, cfg, sel, n = 20) {
  const hot = createHot(cfg.budget); hot.step = side; hot.def = roundDef(cfg);
  const x0 = side === 'blau' ? 150 : W - 650;
  const s = createStroke(0);
  for (let k = 0; k < n; k++) hotPaint(world, hot, s, x0 + (k % 5) * 110, 120 + Math.floor(k / 5) * 160, 70, sel, k === 0);
  return hot;
}

test('Online: in der Runde nur Einheiten der Kategorie, mit Budget', () => {
  const w = createWorld(W, H, 1); w.teamMode = true;
  const cfg = { r: 1, cat: 'tiere', seed: 5, budget: 100 };
  const h1 = paintSide(w, 'blau', cfg, 'krieger', 5);
  assert.equal(w.units.length, 0, 'Krieger gehören nicht zu Tiere');
  assert.equal(h1.spent.blau, 0);
  const h2 = paintSide(w, 'blau', cfg, 'wolf', 40);
  assert.ok(h2.spent.blau <= 100 + 1e-9 && h2.spent.blau > 80);
  assert.ok(w.units.every(u => u.type === 'wolf' && u.x <= W / 2));
});

test('Online: Armee-Paket hin und zurück, mit Formen; falsche Seite, Kategorie und Budget fallen auf', () => {
  const w = createWorld(W, H, 2); w.teamMode = true;
  const a = spawn(w, 'ritter', 123.4, 456.7, 'blau'); applyShape(a, 'linie');
  spawn(w, 'schuetze', 700, 10, 'blau');
  spawn(w, 'wolf', 1200, 500, 'rot');   // andere Seite: nicht im Paket
  const txt = packArmy(w, 'blau');
  assert.match(txt, /^[A-Za-z0-9_-]+$/);
  const back = unpackArmy(txt, 'blau', W, H, { cat: 'armee', budget: 10 });
  assert.equal(back.length, 2);
  assert.equal(back[0].type, 'ritter'); assert.equal(back[0].shape, 'linie');
  assert.ok(Math.abs(back[0].x - 123.4) < .05 && Math.abs(back[0].y - 456.7) < .05);
  assert.equal(back[1].shape, null);
  assert.throws(() => unpackArmy(txt, 'rot', W, H, null), /falschen Seite/);
  assert.throws(() => unpackArmy(txt, 'blau', W, H, { cat: 'tiere', budget: 99 }), /Kategorie/);
  assert.throws(() => unpackArmy(txt, 'blau', W, H, { cat: 'armee', budget: 5 }), /Budget/);
  assert.throws(() => unpackArmy('abc', 'blau', W, H, null), /unvollständig/);
  assert.throws(() => unpackArmy('<b>', 'blau', W, H, null), /unlesbar/);
  assert.deepEqual(splitChunks('abcdefg', 3), ['abc', 'def', 'g']);
  assert.deepEqual(splitChunks(''), ['']);
});

// Zwei Spieler, verbunden über ihre presence-Objekte (wie room.presence / onPeers), bis nichts mehr passiert
function link(A, B, maxRounds = 200) {
  const evA = [], evB = [];
  for (let i = 0; i < maxRounds; i++) {
    const a = onPeer(A, JSON.parse(JSON.stringify(view(B))), W, H), b = onPeer(B, JSON.parse(JSON.stringify(view(A))), W, H);
    evA.push(...a); evB.push(...b);
    if (!a.length && !b.length && i > 3) break;
  }
  return { evA, evB };
}

// Beide stimmen ab (a, b: [Regel, Karte]; ohne Angabe die erste Wahl); danach malen beide
function voteBoth(A, B, a, b) {
  link(A, B);
  const o = A.cfg.opts;
  castVote(A, ...(a || [o.rules[0], o.maps[0]])); castVote(B, ...(b || a || [o.rules[0], o.maps[0]]));
  return link(A, B);
}

// Kampf so, wie ui/online.js ihn aufstellt (main.js onlineFight): Welt leeren, Liste spawnen, Schnappschuss, Saat
function runFight(list, seed, map = 'feld') {
  const w = createWorld(W, H, 77); w.teamMode = true;
  applyMap(w, map);
  for (const u of list) { const n = spawn(w, u.type, u.x, u.y, u.team); if (u.shape) applyShape(n, u.shape, true); }
  const snap = snapshotBattle(w);
  resetFight(w, snap, seed);
  let t = 0, r = null;
  while (!r && t < 200) { step(w, 1 / 60); t += 1 / 60; r = battleWinner(w, t); }
  return { r, t, alive: w.units.filter(u => u.alive).map(u => `${u.type}${u.x.toFixed(3)}`).join() };
}

test('Online: ganzer Ablauf zweier Spieler, beide sehen denselben Kampf und denselben Punktestand', () => {
  const A = createMatch('host', 100, createRng(4)), B = createMatch('guest');
  assert.equal(A.side, 'blau'); assert.equal(B.side, 'rot');
  assert.deepEqual(hostStart(A), ['vote']);
  const v = link(A, B);
  assert.ok(v.evB.includes('vote')); assert.equal(B.phase, 'vote'); assert.deepEqual(B.cfg.opts, A.cfg.opts);
  // verschiedene Stimmen: das Los entscheidet zwischen beiden, beide bekommen dasselbe
  const o = A.cfg.opts;
  castVote(A, o.rules[0], o.maps[1]);
  assert.equal(A.phase, 'vote', 'wartet auf den Gast');
  assert.equal(castVote(B, 'gibtsnicht', o.maps[0]).length, 0);
  castVote(B, o.rules[2], o.maps[1]);
  const { evB } = link(A, B);
  assert.ok(evB.includes('round'));
  assert.deepEqual(B.cfg, A.cfg); assert.equal(B.phase, 'paint'); assert.equal(A.phase, 'paint');
  assert.ok([o.rules[0], o.rules[2]].includes(A.cfg.cat)); assert.equal(A.cfg.map, o.maps[1]);
  assert.deepEqual(A.cfg.agreed, { rule: false, map: true });
  const cfg = A.cfg;
  const pick = allowed(cfg.cat);
  // jeder malt in seiner eigenen Welt, sieht also den anderen nicht
  const wA = createWorld(W, H, 11), wB = createWorld(W, H, 22); wA.teamMode = wB.teamMode = true;
  paintSide(wA, 'blau', cfg, pick[0], 30); paintSide(wB, 'rot', cfg, pick[pick.length - 1], 30);
  assert.ok(wA.units.every(u => u.team === 'blau') && wB.units.every(u => u.team === 'rot'));
  // A fertig: B sieht nur „ready“, keine Armee
  markReady(A, packArmy(wA, 'blau'));
  link(A, B);
  assert.equal(A.phase, 'ready'); assert.equal(view(A).arm, null, 'keine Armee, solange der Gegner malt');
  markReady(B, packArmy(wB, 'rot'));
  const l = link(A, B);
  assert.ok(l.evA.includes('fight') && l.evB.includes('fight'));
  assert.equal(A.fight.seed, B.fight.seed);
  assert.deepEqual(A.fight.units, B.fight.units);
  assert.ok(A.fight.units.some(u => u.team === 'blau') && A.fight.units.some(u => u.team === 'rot'));
  // derselbe Kampf auf beiden Geräten
  assert.equal(A.fight.map, cfg.map); assert.equal(B.fight.map, cfg.map);
  const fa = runFight(A.fight.units, A.fight.seed, A.fight.map), fb = runFight(B.fight.units, B.fight.seed, B.fight.map);
  assert.ok(fa.r); assert.equal(fa.r, fb.r); assert.equal(fa.alive, fb.alive);
  finishFight(A, fa.r); finishFight(B, fb.r);
  link(A, B);
  assert.equal(officialWinner(B), fa.r);
  assert.deepEqual(B.score, A.score);
  assert.equal(A.score.blau + A.score.rot, fa.r === 'draw' ? 0 : 1);
  // nächste Runde erst, wenn beide wollen
  wantNext(A); link(A, B);
  assert.equal(A.phase, 'result');
  wantNext(B); const n = link(A, B);
  assert.ok(n.evB.includes('vote'));
  assert.equal(A.cfg.r, 2); assert.equal(B.cfg.r, 2); assert.ok(!A.cfg.opts.rules.includes(cfg.cat));
  assert.equal(A.phase, 'vote'); assert.equal(B.phase, 'vote');
  voteBoth(A, B);
  assert.equal(A.phase, 'paint'); assert.equal(B.phase, 'paint'); assert.equal(B.cfg.cat, A.cfg.opts.rules[0]);
  assert.equal(finishFight(A, 'blau').length, 0, 'zählt nicht doppelt');
  // Revanche: nur wenn beide wollen; gleiche Regel, Karte, Budget, neue Saat, keine Abstimmung
  const r2 = { ...A.cfg };
  const wA2 = createWorld(W, H, 31), wB2 = createWorld(W, H, 32); wA2.teamMode = wB2.teamMode = true;
  paintSide(wA2, 'blau', r2, allowed(r2.cat)[0], 10); paintSide(wB2, 'rot', r2, allowed(r2.cat)[0], 10);
  markReady(A, packArmy(wA2, 'blau')); markReady(B, packArmy(wB2, 'rot')); link(A, B);
  finishFight(A, 'draw'); finishFight(B, 'draw'); link(A, B);
  wantNext(A, true); link(A, B);
  assert.equal(B.peerWant, 'same');
  wantNext(B, true); const rm = link(A, B);
  assert.ok(rm.evB.includes('round'));
  assert.equal(A.phase, 'paint'); assert.equal(B.phase, 'paint');
  assert.equal(B.cfg.r, r2.r + 1); assert.equal(B.cfg.cat, r2.cat); assert.equal(B.cfg.map, r2.map); assert.equal(B.cfg.budget, r2.budget);
  assert.notEqual(B.cfg.seed, r2.seed); assert.ok(B.cfg.rematch);
});

test('Online: große Armeen gehen in mehreren Stücken über, die presence bleibt unter 4 KiB', () => {
  const A = createMatch('host', 250, createRng(1)), B = createMatch('guest');
  hostStart(A); link(A, B); A.cfg.opts.rules[0] = 'tiere'; B.cfg.opts.rules[0] = 'tiere'; voteBoth(A, B);
  assert.equal(B.cfg.cat, 'tiere');
  const wA = createWorld(W, H, 3), wB = createWorld(W, H, 4); wA.teamMode = wB.teamMode = true;
  paintSide(wA, 'blau', A.cfg, 'biene', 80); paintSide(wB, 'rot', A.cfg, 'wolf', 10);
  const nA = wA.units.length;
  assert.ok(nA >= 240, `viele Bienen: ${nA}`);   // Bienen kosten seit 18.11. 1 Punkt
  markReady(A, packArmy(wA, 'blau')); markReady(B, packArmy(wB, 'rot'));
  // Mehrere Stücke: mit Bienen zu 1 Punkt passt die größte Armee meist in eines; das Zerlegen prüft splitChunks unten
  assert.ok(A.chunks.length >= 1 && A.chunks.join('') === A.mine, `Stücke: ${A.chunks.length}`);
  const big = 'x'.repeat(CHUNK * 2 + 5), parts = splitChunks(big);
  assert.equal(parts.length, 3); assert.equal(parts.join(''), big);
  let maxBytes = 0;
  for (let i = 0; i < 100 && (A.phase !== 'fight' || B.phase !== 'fight'); i++) {
    const va = view(A), vb = view(B);
    maxBytes = Math.max(maxBytes, Buffer.byteLength(JSON.stringify(va)), Buffer.byteLength(JSON.stringify(vb)));
    onPeer(A, vb, W, H); onPeer(B, va, W, H);
  }
  assert.equal(A.phase, 'fight'); assert.equal(B.phase, 'fight');
  assert.equal(B.fight.units.filter(u => u.team === 'blau').length, nA);
  assert.ok(maxBytes < 4096, `presence ${maxBytes} B`);
  assert.ok(CHUNK < 4096 - 400);
});

test('Online: manipulierte Armee des Gegners wird abgelehnt, fremde Daten stören nicht', () => {
  const A = createMatch('host', 100, createRng(2)), B = createMatch('guest');
  hostStart(A); voteBoth(A, B);
  const wB = createWorld(W, H, 5); wB.teamMode = true;
  // Gast schummelt: 60 Panzer weit über dem Budget
  for (let i = 0; i < 60; i++) spawn(wB, 'panzer', 900 + (i % 6) * 100, 60 + Math.floor(i / 6) * 80, 'rot');
  const wA = createWorld(W, H, 6); wA.teamMode = true;
  spawn(wA, allowed(A.cfg.cat)[0], 200, 300, 'blau');
  markReady(A, packArmy(wA, 'blau')); markReady(B, packArmy(wB, 'rot'));
  const { evA } = link(A, B);
  assert.ok(evA.includes('error'));
  assert.ok(A.error);
  assert.ok(A.fight.units.every(u => u.team === 'blau'), 'die abgelehnte Armee kämpft nicht');
  // Auch die eigene Armee (m.mine) wird lokal gegen m.cfg geprüft (Defense-in-Depth)
  const A2 = createMatch('host', 100, createRng(2)), B2 = createMatch('guest');
  hostStart(A2); voteBoth(A2, B2);
  const wCheat = createWorld(W, H, 8); wCheat.teamMode = true;
  for (let i = 0; i < 60; i++) spawn(wCheat, 'panzer', 100 + (i % 6) * 80, 60 + Math.floor(i / 6) * 80, 'blau');
  const wOk = createWorld(W, H, 9); wOk.teamMode = true;
  spawn(wOk, allowed(A2.cfg.cat)[0], 1300, 300, 'rot');
  markReady(A2, packArmy(wCheat, 'blau')); markReady(B2, packArmy(wOk, 'rot'));
  const lCheat = link(A2, B2);
  assert.ok(lCheat.evA.includes('error'));
  assert.ok(A2.fight.units.every(u => u.team === 'rot'), 'eigene geschummelte Armee kämpft auch lokal nicht mit');
  // Müll in presence
  const C = createMatch('guest');
  for (const junk of [null, 5, 'x', [], { ks: 2, cfg: {} }, { ks: 1, cfg: { r: 'a' } }, { ks: 1, cfg: { r: 1, cat: 'gelaende', budget: 100 } }]) onPeer(C, junk, W, H);
  assert.equal(C.cfg, null);
  assert.equal(pickPeer([{ isMe: true, presence: { ks: 2 } }, { isMe: false, presence: {} }, { isMe: false, presence: { ks: 1 } }, { isMe: false, presence: { ks: 2 }, peer: 'p2' }]).peer, 'p2');
  assert.deepEqual(openRooms([{ isMe: false, presence: { open: { code: 'kx7p', budget: 150 } } }, { isMe: false, presence: { open: { code: 'zz', budget: 150 } } }]), [{ code: 'KX7P', budget: 150 }]);
});

test('Online: Hinweise „Gegner hat abgestimmt“ und „Gegner ist fertig“ kommen genau einmal je Runde', () => {
  const A = createMatch('host', 100, createRng(4)), B = createMatch('guest');
  hostStart(A); link(A, B);
  const o = A.cfg.opts;
  castVote(A, o.rules[0], o.maps[0]);
  const v1 = link(A, B);
  assert.equal(v1.evB.filter(e => e === 'peervoted').length, 1, 'Gast sieht: Host hat abgestimmt');
  castVote(B, o.rules[0], o.maps[0]);
  const v2 = link(A, B);
  assert.equal(A.phase, 'paint');
  assert.ok(!v2.evA.includes('peervoted') || v2.evA.filter(e => e === 'peervoted').length === 1);
  const wA = createWorld(W, H, 6); wA.teamMode = true;
  spawn(wA, allowed(A.cfg.cat)[0], 200, 300, 'blau');
  markReady(A, packArmy(wA, 'blau'));
  const r1 = link(A, B);
  assert.equal(r1.evB.filter(e => e === 'peerready').length, 1, 'Gast malt noch und sieht: Host ist fertig');
  assert.equal(B.phase, 'paint');
  assert.ok(!link(A, B).evB.includes('peerready'), 'nur einmal');
  const wB = createWorld(W, H, 7); wB.teamMode = true;
  spawn(wB, allowed(B.cfg.cat)[0], 1300, 300, 'rot');
  markReady(B, packArmy(wB, 'rot'));
  const r2 = link(A, B);
  assert.ok(!r2.evA.includes('peerready'), 'wer selbst schon fertig ist, bekommt keinen Hinweis mehr');
  assert.equal(A.phase, 'fight');
});

test('Online: Aufgeben beim Malen oder im Kampf gibt die Runde dem Gegner, danach geht es normal weiter', () => {
  const A = createMatch('host', 100, createRng(9)), B = createMatch('guest');
  hostStart(A); voteBoth(A, B);
  assert.ok(canGiveUp(A) && canGiveUp(B));
  // Gast gibt beim Malen auf
  assert.deepEqual(giveUp(B), ['gave', 'result']);
  assert.equal(B.phase, 'result'); assert.equal(B.res.w, 'blau');
  assert.deepEqual(giveUp(B), [], 'nur einmal');
  const { evA } = link(A, B);
  assert.ok(evA.includes('peergave'));
  assert.equal(A.phase, 'result'); assert.equal(officialWinner(A), 'blau'); assert.equal(officialWinner(B), 'blau');
  assert.deepEqual(A.score, { blau: 1, rot: 0 }); assert.deepEqual(B.score, { blau: 1, rot: 0 });
  // Revanche, dann gibt der Host im Kampf auf
  wantNext(A, true); wantNext(B, true); link(A, B);
  assert.equal(A.phase, 'paint'); assert.equal(B.phase, 'paint'); assert.equal(A.gave, 0);
  const wA = createWorld(W, H, 6); wA.teamMode = true; spawn(wA, allowed(A.cfg.cat)[0], 200, 300, 'blau');
  const wB = createWorld(W, H, 7); wB.teamMode = true; spawn(wB, allowed(B.cfg.cat)[0], 1300, 300, 'rot');
  markReady(A, packArmy(wA, 'blau')); markReady(B, packArmy(wB, 'rot')); link(A, B);
  assert.equal(A.phase, 'fight');
  giveUp(A);
  const l2 = link(A, B);
  assert.ok(l2.evB.includes('peergave'));
  assert.deepEqual(finishFight(B, 'rot'), [], 'der lokale Kampf zählt nach dem Aufgeben nicht mehr');
  assert.deepEqual(A.score, { blau: 1, rot: 1 }); assert.deepEqual(B.score, { blau: 1, rot: 1 });
  assert.ok(!canGiveUp(A), 'im Ergebnis nicht mehr');
});

// Code-Duell (18.11.): game/js/duel.js über share.js
import { encode, decode } from '../game/js/share.js';
import { challengeData, answerData, duelList, validDuel } from '../game/js/duel.js';

test('Code-Duell: Herausforderung und Antwort als Code, beide sehen denselben Kampf', async () => {
  const cfg = randomRound(null, 150, createRng(12));
  const pick = allowed(cfg.cat);
  const wA = createWorld(W, H, 1), wB = createWorld(W, H, 2); wA.teamMode = wB.teamMode = true;
  paintSide(wA, 'blau', cfg, pick[0], 25); paintSide(wB, 'rot', cfg, pick[pick.length - 1], 25);
  const ch = await decode(await encode(challengeData(cfg, packArmy(wA, 'blau'))));
  assert.equal(ch.k, 'duel'); assert.equal(ch.cfg.cat, cfg.cat); assert.equal(ch.b, undefined);
  const ans = await decode(await encode(answerData(ch, packArmy(wB, 'rot'))));
  assert.equal(ans.k, 'duelres');
  // B kämpft beim Einfügen seiner Armee, A beim Laden der Antwort: gleiche Liste, gleiche Saat, gleicher Kampf
  const lB = duelList(answerData(ch, packArmy(wB, 'rot'))), lA = duelList(ans);
  assert.deepEqual(lA, lB);
  assert.equal(ans.cfg.map, cfg.map);
  const fa = runFight(lA, ans.cfg.seed, ans.cfg.map), fb = runFight(lB, ch.cfg.seed, ch.cfg.map);
  assert.equal(fa.r, fb.r); assert.equal(fa.alive, fb.alive);
});

test('Code-Duell: kaputte oder manipulierte Codes werden abgelehnt', async () => {
  const cfg = { r: 1, cat: 'tiere', seed: 7, budget: 100 };
  const w = createWorld(W, H, 3); w.teamMode = true;
  spawn(w, 'wolf', 200, 200, 'blau');
  const a = packArmy(w, 'blau');
  assert.ok(validDuel(challengeData(cfg, a)));
  assert.equal(validDuel({ ...challengeData(cfg, a), cfg: { ...cfg, cat: 'gelaende' } }), false);
  assert.equal(validDuel(challengeData({ ...cfg, budget: 1 }, a)), false);
  assert.equal(validDuel(challengeData(cfg, '')), false, 'ohne Armee');
  for (let i = 0; i < 80; i++) spawn(w, 'baer', 100 + (i % 8) * 70, 80 + Math.floor(i / 8) * 70, 'blau');
  await assert.rejects(decode(await encode(challengeData(cfg, packArmy(w, 'blau')))), /passt nicht/);
  await assert.rejects(decode(await encode({ v: 1, k: 'duelres', cfg, a })), /passt nicht/);
});
