// Synergien zwischen verschiedenen Truppen (synergy.js, data.SYNERGY; Wunsch Silas 18.11.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, RV_MARK } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { hurt, attack } from '../game/js/combat.js';
import { UNITS, SYNERGY } from '../game/js/data.js';
import { SYN, SB, synergiesOf } from '../game/js/synergy.js';
import { unitCard } from '../game/js/cards.js';

const DT = 1 / 60;
const mk = (seed = 4) => { const w = createWorld(1400, 800, seed); w.teamMode = true; return w; };
const run = (w, secs, each) => { for (let t = 0; t < secs - 1e-9; t += DT) { step(w, DT); if (each) each(w.events); w.events.length = 0; } };
const freeze = (...us) => { for (const u of us) { u.state = 'stun'; u.stunT = 1e9; u.hp = 1e6; } };
// Schaden eines Treffers an v (LP vorher/nachher)
const dmg = (w, v, a, kind, src) => { const h = v.hp; hurt(w, v, a, kind, src); return h - v.hp; };

test('Daten: jede Synergie verbindet verschiedene, vorhandene Typen; kurze Texte; auf der Karte', () => {
  for (const s of SYNERGY) {
    for (const t of [...s.a, ...s.b]) assert.ok(UNITS[t], `${s.k}: ${t}`);
    for (const t of s.a) assert.ok(!s.b.includes(t), `${s.k}: nicht mit sich selbst`);
    assert.ok(s.n.length <= 24 && s.d.length <= 140, s.k);
    if (s.near) assert.ok(SYN.R[s.k] > 0 && SB[s.k] > 0, s.k);
  }
  assert.ok(synergiesOf('schuetze').some(x => x.n === 'Schildschutz'));
  assert.ok(unitCard('ritter').syn.some(x => x.n === 'Schildschutz'), 'auch beim Auslöser');
  assert.ok(unitCard('lama').syn.some(x => x.n === 'Klebrig'));
  for (const t of ['drache', 'heli']) assert.equal(synergiesOf(t).length, 0, `${t}: andere Threads`);
  // mehrere Kategorien
  const cat = t => UNITS[t].cat;
  assert.ok(SYNERGY.some(s => s.a.some(a => s.b.some(b => cat(a) !== cat(b)))), 'kategorieübergreifend');
});

test('Schildschutz: Schütze beim Ritter nimmt weniger Fernkampfschaden, ohne Ritter nicht; Feinde zählen nicht', () => {
  const w = mk();
  const s = spawn(w, 'schuetze', 300, 300, 'blau'), r = spawn(w, 'ritter', 340, 300, 'blau');
  const s2 = spawn(w, 'schuetze', 800, 300, 'blau'), foe = spawn(w, 'ritter', 840, 300, 'rot');
  freeze(s, r, s2, foe);
  run(w, .6);
  assert.ok(s.syn & SB.schild); assert.equal(s.synP, r);
  assert.equal(s2.syn, 0, 'feindlicher Ritter schützt nicht');
  const a = dmg(w, s, 10, 'arrow', null), b = dmg(w, s2, 10, 'arrow', null);
  assert.ok(Math.abs(a - b * SYN.SCHILD) < 1e-9, `${a} vs ${b}`);
  assert.ok(Math.abs(dmg(w, s, 10, 'melee', null) - 10) < 1e-9, 'Nahkampf voll');
  r.alive = false; run(w, .6);
  assert.equal(s.syn & SB.schild, 0, 'Partner tot: vorbei');
});

test('Feuerschutz: Soldat beim MG schießt schneller', () => {
  const w = mk();
  const s = spawn(w, 'soldat', 300, 300, 'blau'), m = spawn(w, 'mg', 360, 300, 'blau'), foe = spawn(w, 'krieger', 450, 300, 'rot');
  freeze(s, m, foe);
  run(w, .6);
  assert.ok(s.syn & SB.feuerschutz);
  s.cd = 0; attack(w, s, foe, 150, 1, 0, foe.x, foe.y);
  assert.ok(s.cd <= UNITS.soldat.cd * 1.15 * SYN.FEUERSCHUTZ + 1e-9);
});

test('Jagdpartner: Adlertreffer markiert, Wölfe machen dann mehr Schaden', () => {
  const w = mk();
  const v = spawn(w, 'krieger', 300, 300, 'rot'), wolf = spawn(w, 'wolf', 330, 300, 'blau'), ad = spawn(w, 'adler', 300, 320, 'blau');
  freeze(v, wolf, ad);
  const a = dmg(w, v, 10, 'melee', wolf);
  hurt(w, v, 1, 'melee', ad);
  assert.ok(v.rv[RV_MARK] > w.time);
  const b = dmg(w, v, 10, 'melee', wolf);
  assert.ok(Math.abs(b - a * SYN.JAGD) < 1e-9, `${a} → ${b}`);
  assert.ok(w.events.some(e => e.type === 'syn' && e.k === 'jagd'), 'Funken');
});

test('Schreckbeute, Klebrig, Feldarzt, Zauberklinge', () => {
  const w = mk();
  const v = spawn(w, 'krieger', 300, 300, 'rot'), vamp = spawn(w, 'vampir', 330, 300, 'blau');
  const sch = spawn(w, 'schuetze', 500, 300, 'blau');
  freeze(v, vamp, sch);
  const a = dmg(w, v, 10, 'melee', vamp); v.fearT = 2;
  assert.ok(Math.abs(dmg(w, v, 10, 'melee', vamp) - a * SYN.SCHRECK) < 1e-9, 'Schreck');
  v.fearT = 0;
  const p = dmg(w, v, 10, 'arrow', sch); v.slowT = 1;
  assert.ok(Math.abs(dmg(w, v, 10, 'arrow', sch) - p * SYN.KLEBRIG) < 1e-9, 'Spucke');
  // Zauberklinge
  const w2 = mk();
  const k = spawn(w2, 'krieger', 300, 300, 'blau'), mag = spawn(w2, 'magier', 360, 300, 'blau'), foe = spawn(w2, 'krieger', 320, 300, 'rot');
  freeze(k, mag, foe);
  run(w2, .6);
  assert.ok(k.syn & SB.klinge);
  hurt(w2, foe, 1, 'melee', k); assert.ok(foe.burnT > 0, 'brennt');
  // Feldarzt: Sani heilt Ritter stärker als Krieger
  const heal = t => {
    const w3 = mk(); const s = spawn(w3, 'sani', 300, 300, 'blau'), u = spawn(w3, t, 360, 300, 'blau');
    u.hp = u.T.hp * .3; u.state = 'stun'; u.stunT = 1e9; const h = u.hp; run(w3, 1.5); return u.hp - h;
  };
  assert.ok(heal('ritter') > heal('krieger') * 1.3, 'Feldarzt');
});

test('deterministisch mit gemischter Armee', () => {
  const play = () => {
    const w = mk(13);
    for (let i = 0; i < 4; i++) { spawn(w, 'ritter', 400, 300 + i * 40, 'blau'); spawn(w, 'schuetze', 340, 300 + i * 40, 'blau'); }
    spawn(w, 'magier', 330, 380, 'blau'); spawn(w, 'reiter', 420, 250, 'blau'); spawn(w, 'adler', 350, 400, 'blau'); spawn(w, 'wolf', 380, 450, 'blau');
    for (let i = 0; i < 4; i++) { spawn(w, 'soldat', 1000, 300 + i * 40, 'rot'); spawn(w, 'krieger', 960, 300 + i * 40, 'rot'); }
    spawn(w, 'mg', 1050, 380, 'rot'); spawn(w, 'lama', 1040, 450, 'rot'); spawn(w, 'panzer', 1080, 320, 'rot');
    run(w, 15);
    return w.units.filter(u => u.alive).map(u => u.team + Math.round(u.hp)).join();
  };
  assert.equal(play(), play());
});
