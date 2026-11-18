// Schlacht-Statistik (Spez. #46, stats.js): Schaden und Kills je Typ, Friendly Fire, Ghule, Frösche, Phönix-Asche, Verlauf.
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS } from '../game/js/data.js';
import { createWorld, spawn, rebuildHash } from '../game/js/world.js';
import { hurt, blast } from '../game/js/combat.js';
import { curseFrog } from '../game/js/abilities.js';
import { armyPoints } from '../game/js/sim.js';
import { createStats, TIMELINE_DT } from '../game/js/stats.js';

const DT = 1 / 60;
const mkWorld = (seed = 7) => { const w = createWorld(1400, 800, seed); w.teamMode = true; return w; };
const row = (r, side, type) => r.table.find(x => x.side === side && x.type === type);
// Ereignisse an die Statistik und leeren (wie main.drainEvents)
const drain = (w, s) => { s.onEvents(w.events); w.events.length = 0; };

test('stats: Kills und ausgeteilter Schaden je Seite und Typ, Schaden je Punkt', () => {
  const w = mkWorld();
  const a = spawn(w, 'krieger', 300, 300, 'blau'), b = spawn(w, 'krieger', 340, 300, 'blau');
  const r1 = spawn(w, 'schuetze', 900, 300, 'rot'), r2 = spawn(w, 'schuetze', 900, 340, 'rot');
  rebuildHash(w);
  const s = createStats(w);
  hurt(w, r1, 5, 'melee', a);                        // 5 Schaden
  hurt(w, r1, 1e6, 'melee', a);                      // tötet: nur die restlichen LP zählen
  hurt(w, r2, 7, 'arrow', b);
  hurt(w, a, 3, 'arrow', r2);
  drain(w, s); s.tick(w, DT);
  const res = s.result(w), kb = row(res, 'blau', 'krieger'), sr = row(res, 'rot', 'schuetze');
  assert.equal(kb.deployed, 2); assert.equal(kb.survived, 2); assert.equal(kb.kills, 1);
  assert.ok(Math.abs(kb.dmg - (UNITS.schuetze.hp + 7)) < 1e-9, `Schaden ${kb.dmg}`);
  assert.ok(Math.abs(kb.dmgPerPt - kb.dmg / (2 * UNITS.krieger.cost)) < 1e-9);
  assert.equal(sr.deployed, 2); assert.equal(sr.survived, 1); assert.equal(sr.lost, 1); assert.equal(sr.kills, 0);
  assert.ok(Math.abs(sr.dmg - 3) < 1e-9);
  assert.deepEqual(res.survivors, { blau: 2, rot: 1 });
  assert.deepEqual(res.hero, { type: 'krieger', side: 'blau', kills: 1 });
  assert.equal(res.winner, 'blau', 'nach Stärke (läuft noch)');
  assert.deepEqual(res.table.map(x => x.side), ['blau', 'rot'], 'Blau zuerst');
});

test('stats: Friendly Fire zählt weder als Kill noch als Schaden, Eigenschaden auch nicht', () => {
  const w = mkWorld();
  const g = spawn(w, 'grenadier', 300, 300, 'blau'), k = spawn(w, 'krieger', 320, 300, 'blau');
  spawn(w, 'krieger', 1000, 300, 'rot');
  k.hp = 100; rebuildHash(w);
  const s = createStats(w);
  blast(w, 310, 300, 60, 40, 'blau', g, 'blast', 1);
  assert.ok(g.hp < UNITS.grenadier.hp, 'Eigenschaden');
  hurt(w, k, 1e6, 'melee', g);
  drain(w, s);
  const res = s.result(w);
  assert.equal(k.alive, false);
  assert.equal(row(res, 'blau', 'grenadier').kills, 0);
  assert.equal(row(res, 'blau', 'grenadier').dmg, 0);
  assert.equal(res.hero, null, 'kein Held ohne Kill');
  assert.equal(row(res, 'blau', 'krieger').lost, 1, 'Verlust zählt trotzdem');
});

test('stats: Ghul zählt zur Seite des Vampirs, aber nicht als eingesetzt; sein Opfer ist ein Verlust', () => {
  const w = mkWorld();
  const v = spawn(w, 'vampir', 400, 400, 'blau'), t = spawn(w, 'krieger', 418, 400, 'rot');
  spawn(w, 'krieger', 900, 400, 'rot');
  rebuildHash(w);
  const s = createStats(w);
  t.hp = 1; hurt(w, t, 50, 'melee', v);
  const g = w.units.find(u => u.type === 'ghul');
  assert.ok(g && g.alive, 'Ghul steht auf');
  drain(w, s); s.tick(w, DT);
  const o = spawn(w, 'krieger', 430, 420, 'rot'); s.tick(w, DT);   // später Gemalte gibt es nicht; ein Spawn zählt nicht als eingesetzt
  hurt(w, o, 4, 'melee', g);
  const res = s.result(w), gr = row(res, 'blau', 'ghul');
  assert.ok(gr, 'Zeile für den Ghul');
  assert.equal(gr.deployed, 0); assert.equal(gr.survived, 1); assert.ok(Math.abs(gr.dmg - 4) < 1e-9); assert.equal(gr.dmgPerPt, 0);
  assert.equal(row(res, 'blau', 'vampir').deployed, 1); assert.equal(row(res, 'blau', 'vampir').kills, 1);
  assert.equal(row(res, 'rot', 'krieger').deployed, 2, 'nur die beim Start Eingesetzten');
  assert.equal(row(res, 'rot', 'krieger').lost, 1);
  assert.equal(res.survivors.blau, 2, 'Vampir und Ghul');
});

test('stats: ein Frosch zählt als sein ursprünglicher Typ (Schaden, Tod, Überleben, Stärke)', () => {
  const w = mkWorld();
  const k = spawn(w, 'ritter', 400, 400, 'rot'), k2 = spawn(w, 'ritter', 400, 440, 'rot'), a = spawn(w, 'krieger', 300, 400, 'blau');
  rebuildHash(w);
  const s = createStats(w);
  assert.ok(curseFrog(w, k)); assert.ok(curseFrog(w, k2));
  assert.equal(k.type, 'frosch');
  assert.equal(armyPoints(w).rot, 2 * UNITS.ritter.cost, 'Stärke nach dem Ursprungstyp');
  hurt(w, a, 2, 'melee', k);
  hurt(w, k2, 1e6, 'melee', a);
  drain(w, s);
  const res = s.result(w);
  assert.equal(res.table.some(x => x.type === 'frosch'), false, 'keine Froschzeile');
  const r = row(res, 'rot', 'ritter');
  assert.equal(r.deployed, 2); assert.equal(r.survived, 1); assert.equal(r.lost, 1);
  assert.ok(Math.abs(r.dmg - 2) < 1e-9);
});

test('stats: die Asche des Phönix zählt nicht als Tod, er überlebt', () => {
  const w = mkWorld();
  const p = spawn(w, 'phoenix', 400, 400, 'blau'), k = spawn(w, 'krieger', 420, 400, 'rot');
  rebuildHash(w);
  const s = createStats(w);
  hurt(w, p, 1e6, 'arrow', k);
  assert.ok(p.alive && p.ashT > 0, 'Asche');
  drain(w, s);
  const res = s.result(w), r = row(res, 'blau', 'phoenix');
  assert.equal(r.survived, 1); assert.equal(r.lost, 0);
  assert.equal(row(res, 'rot', 'krieger').kills, 0, 'kein Kill für die Asche');
  assert.equal(res.survivors.blau, 1);
});

test('stats: Verlauf mit einem Punkt alle 0,5 s (Punktwert der Lebenden je Seite)', () => {
  const w = mkWorld();
  for (let i = 0; i < 3; i++) spawn(w, 'krieger', 300, 300 + i * 30, 'blau');
  const r = spawn(w, 'ritter', 900, 300, 'rot');
  rebuildHash(w);
  const s = createStats(w);
  for (let i = 0; i < 120; i++) { if (i === 45) hurt(w, r, 1e6, 'melee', w.units[0]); s.tick(w, DT); }
  const tl = s.result(w).timeline;
  assert.equal(TIMELINE_DT, .5);
  assert.deepEqual(tl.map(p => +p.t.toFixed(6)), [0, .5, 1, 1.5, 2]);
  assert.equal(tl[0].blau, 3 * UNITS.krieger.cost); assert.equal(tl[0].rot, UNITS.ritter.cost);
  assert.equal(tl[1].rot, UNITS.ritter.cost); assert.equal(tl[2].rot, 0, 'nach dem Tod bei 0,75 s');
  for (let i = 0; i < 10; i++) s.tick(w, DT);
  const tl2 = s.result(w).timeline;
  assert.equal(tl2.length, 6, 'Endpunkt'); assert.ok(Math.abs(tl2[5].t - 130 / 60) < 1e-9);
  assert.ok(Math.abs(s.result(w).time - 130 / 60) < 1e-9);
});
