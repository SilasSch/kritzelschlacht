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
  markReady, finishFight, wantNext, onPeer, officialWinner, pickPeer, openRooms, ONLINE_CATS, CHUNK,
} from '../game/js/online.js';

const W = 1600, H = 900;

test('Online: Codes sind 4 Zeichen ohne Verwechsler, Eingabe wird normalisiert', () => {
  const rng = createRng(3);
  for (let i = 0; i < 50; i++) { const c = makeCode(rng); assert.match(c, /^[A-HJKMNP-Z2-9]{4}$/); assert.equal(normCode(c.toLowerCase()), c); }
  assert.equal(normCode(' kx-7p '), 'KX7P');
  assert.equal(normCode('KX7'), null);
  assert.equal(normCode('IO01'), null);
  assert.equal(roomName('KX7P'), 'ks1v1-kx7p');
});

test('Online: Runden würfeln eine Kategorie, nie zweimal hintereinander dieselbe', () => {
  const rng = createRng(9);
  let c = nextRound(null, 150, rng);
  assert.equal(c.r, 1); assert.ok(ONLINE_CATS.includes(c.cat)); assert.equal(c.budget, 150);
  const seen = new Set([c.cat]);
  for (let i = 0; i < 40; i++) { const n = nextRound(c, 150, rng); assert.notEqual(n.cat, c.cat); assert.equal(n.r, c.r + 1); seen.add(n.cat); c = n; }
  assert.equal(seen.size, ONLINE_CATS.length);
  assert.equal(nextRound(null, 999, rng).budget, 150);
  assert.deepEqual(roundDef({ cat: 'tiere', budget: 100 }).cats, ['tiere']);
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

// Kampf so, wie ui/online.js ihn aufstellt (main.js onlineFight): Welt leeren, Liste spawnen, Schnappschuss, Saat
function runFight(list, seed) {
  const w = createWorld(W, H, 77); w.teamMode = true;
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
  assert.deepEqual(hostStart(A), ['round']);
  let { evB } = link(A, B);
  assert.ok(evB.includes('round'));
  assert.deepEqual(B.cfg, A.cfg); assert.equal(B.phase, 'paint');
  const cfg = A.cfg;
  const pick = Object.keys(UNITS).filter(t => UNITS[t].cat === cfg.cat && UNITS[t].paint !== false && UNITS[t].cost < 6);
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
  const fa = runFight(A.fight.units, A.fight.seed), fb = runFight(B.fight.units, B.fight.seed);
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
  assert.ok(n.evB.includes('round'));
  assert.equal(A.cfg.r, 2); assert.equal(B.cfg.r, 2); assert.notEqual(A.cfg.cat, cfg.cat);
  assert.equal(A.phase, 'paint'); assert.equal(B.phase, 'paint');
  assert.equal(finishFight(A, 'blau').length, 0, 'zählt nicht doppelt');
});

test('Online: große Armeen gehen in mehreren Stücken über, die presence bleibt unter 4 KiB', () => {
  const A = createMatch('host', 250, createRng(1)), B = createMatch('guest');
  hostStart(A); A.cfg.cat = 'tiere'; link(A, B); B.cfg.cat = 'tiere';
  const wA = createWorld(W, H, 3), wB = createWorld(W, H, 4); wA.teamMode = wB.teamMode = true;
  paintSide(wA, 'blau', A.cfg, 'biene', 80); paintSide(wB, 'rot', A.cfg, 'wolf', 10);
  const nA = wA.units.length;
  assert.ok(nA > 300, `viele Bienen: ${nA}`);
  markReady(A, packArmy(wA, 'blau')); markReady(B, packArmy(wB, 'rot'));
  assert.ok(A.chunks.length >= 2, `Stücke: ${A.chunks.length}`);
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
  hostStart(A); link(A, B);
  const wB = createWorld(W, H, 5); wB.teamMode = true;
  // Gast schummelt: 60 Panzer weit über dem Budget
  for (let i = 0; i < 60; i++) spawn(wB, 'panzer', 900 + (i % 6) * 100, 60 + Math.floor(i / 6) * 80, 'rot');
  const wA = createWorld(W, H, 6); wA.teamMode = true;
  spawn(wA, Object.keys(UNITS).find(t => UNITS[t].cat === A.cfg.cat), 200, 300, 'blau');
  markReady(A, packArmy(wA, 'blau')); markReady(B, packArmy(wB, 'rot'));
  const { evA } = link(A, B);
  assert.ok(evA.includes('error'));
  assert.ok(A.error);
  assert.ok(A.fight.units.every(u => u.team === 'blau'), 'die abgelehnte Armee kämpft nicht');
  // Müll in presence
  const C = createMatch('guest');
  for (const junk of [null, 5, 'x', [], { ks: 2, cfg: {} }, { ks: 1, cfg: { r: 'a' } }, { ks: 1, cfg: { r: 1, cat: 'gelaende', budget: 100 } }]) onPeer(C, junk, W, H);
  assert.equal(C.cfg, null);
  assert.equal(pickPeer([{ isMe: true, presence: { ks: 1 } }, { isMe: false, presence: {} }, { isMe: false, presence: { ks: 1 }, peer: 'p2' }]).peer, 'p2');
  assert.deepEqual(openRooms([{ isMe: false, presence: { open: { code: 'kx7p', budget: 150 } } }, { isMe: false, presence: { open: { code: 'zz', budget: 150 } } }]), [{ code: 'KX7P', budget: 150 }]);
});

// Code-Duell (18.11.): game/js/duel.js über share.js
import { encode, decode } from '../game/js/share.js';
import { challengeData, answerData, duelList, validDuel } from '../game/js/duel.js';

test('Code-Duell: Herausforderung und Antwort als Code, beide sehen denselben Kampf', async () => {
  const cfg = nextRound(null, 150, createRng(12));
  const pick = Object.keys(UNITS).filter(t => UNITS[t].cat === cfg.cat && UNITS[t].paint !== false && UNITS[t].cost < 6);
  const wA = createWorld(W, H, 1), wB = createWorld(W, H, 2); wA.teamMode = wB.teamMode = true;
  paintSide(wA, 'blau', cfg, pick[0], 25); paintSide(wB, 'rot', cfg, pick[pick.length - 1], 25);
  const ch = await decode(await encode(challengeData(cfg, packArmy(wA, 'blau'))));
  assert.equal(ch.k, 'duel'); assert.equal(ch.cfg.cat, cfg.cat); assert.equal(ch.b, undefined);
  const ans = await decode(await encode(answerData(ch, packArmy(wB, 'rot'))));
  assert.equal(ans.k, 'duelres');
  // B kämpft beim Einfügen seiner Armee, A beim Laden der Antwort: gleiche Liste, gleiche Saat, gleicher Kampf
  const lB = duelList(answerData(ch, packArmy(wB, 'rot'))), lA = duelList(ans);
  assert.deepEqual(lA, lB);
  const fa = runFight(lA, ans.cfg.seed), fb = runFight(lB, ch.cfg.seed);
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
