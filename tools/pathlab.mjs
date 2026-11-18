// Wegfindungs-Labor: Problemszenarien nachstellen, Kennzahlen messen, Spuren als JSON für Bilder.
// node tools/pathlab.mjs [szenario|all] [--json=out.json]
import { createWorld, spawn, setCell, cellIndex } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { CELL } from '../game/js/data.js';

const DT = 1 / 60;
function rect(w, x0, x1, y0, y1, id) { for (let y = y0; y < y1; y += CELL) for (let x = x0; x < x1; x += CELL) setCell(w, cellIndex(w, x, y), id, 0); }
function grid(w, type, n, x0, y0, x1, y1, team) {
  const cols = Math.ceil(Math.sqrt(n * (x1 - x0) / Math.max(1, y1 - y0))), rows = Math.ceil(n / cols); let k = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols && k < n; c++, k++)
    spawn(w, type, x0 + (c + .5) * (x1 - x0) / cols, y0 + (r + .5) * (y1 - y0) / rows, team);
}

// Jedes Szenario: Aufbau, Laufzeit, Messung. Gegner "rot" stehen meist still (dummy: hp hoch, kein Angriff), damit nur die Bewegung zählt.
const freeze = u => { u.T = { ...u.T, speed: 0, dmg: 0, range: 0, cd: 99 }; u.hp = 1e6; };
export const dmgTaken = w => w.units.filter(u => u.team === 'rot').reduce((s, u) => s + (1e6 - u.hp), 0);
export const SCENARIOS = {
  // 1. Ziel hinter der Mauer: nächster Feind per Luftlinie liegt hinter einer langen Mauer, ein anderer offen erreichbar
  zielwahl: { secs: 12, setup(w) {
    rect(w, 600, 620, 0, 760, 4);
    spawn(w, 'krieger', 560, 300, 'blau');
    freeze(spawn(w, 'krieger', 680, 300, 'rot'));       // 120 px Luftlinie, Weg ~1000 px
    freeze(spawn(w, 'krieger', 300, 650, 'rot'));       // 430 px, offen
  } },
  // 2. Dornenstreifen mit Durchgang 80 px daneben: läuft der Trupp durch die Dornen?
  dornen: { secs: 20, setup(w) {
    rect(w, 700, 760, 0, 900, 6); rect(w, 700, 760, 520, 600, 0);
    grid(w, 'krieger', 12, 380, 380, 480, 520, 'blau');
    freeze(spawn(w, 'krieger', 1100, 450, 'rot'));
  } },
  // 3. Wasser quer mit Brücke: Umweg vs. Durchwaten
  wasser: { secs: 24, setup(w) {
    rect(w, 700, 800, 0, 900, 1); rect(w, 700, 800, 560, 620, 0);
    grid(w, 'krieger', 12, 380, 380, 480, 520, 'blau');
    freeze(spawn(w, 'krieger', 1100, 450, 'rot'));
  } },
  // 4. Engstelle: 30 Krieger durch eine 40-px-Lücke
  engstelle: { secs: 25, setup(w) {
    rect(w, 780, 800, 0, 430, 4); rect(w, 780, 800, 470, 900, 4);
    grid(w, 'krieger', 30, 300, 300, 500, 600, 'blau');
    freeze(spawn(w, 'krieger', 1200, 450, 'rot'));
  } },
  // 5. Große Einheit: Elefant/Panzer vor 30-px-Lücke (Flussfeld hält sie für passierbar)
  dicke: { secs: 30, setup(w) {
    rect(w, 780, 800, 0, 435, 4); rect(w, 780, 800, 465, 900, 4);
    spawn(w, 'elefant', 400, 300, 'blau'); spawn(w, 'troll', 400, 600, 'blau'); spawn(w, 'rex', 400, 450, 'blau');
    freeze(spawn(w, 'krieger', 1200, 450, 'rot'));
  } },
  // 6. U-Falle: Mauer in U-Form zwischen Trupp und Ziel (konkave Ecke)
  ufalle: { secs: 20, setup(w) {
    rect(w, 700, 720, 250, 650, 4); rect(w, 560, 720, 250, 270, 4); rect(w, 560, 720, 630, 650, 4);
    grid(w, 'krieger', 12, 450, 380, 550, 520, 'blau');
    freeze(spawn(w, 'krieger', 1100, 450, 'rot'));
  } },
  // 7. Lavafluss mit Brücke: Ziel jenseits, Fernkämpfer (Schützen) und Nahkämpfer gemischt
  lava: { secs: 18, setup(w) {
    rect(w, 700, 780, 0, 900, 2); rect(w, 700, 780, 200, 250, 0);
    grid(w, 'krieger', 8, 380, 400, 460, 520, 'blau'); grid(w, 'schuetze', 6, 300, 400, 360, 520, 'blau');
    freeze(spawn(w, 'krieger', 1000, 600, 'rot'));
  } },
  // 8. Ziel ist Flieger hinter Mauer: kein Flussfeld für Luftziele
  luftziel: { secs: 30, setup(w) {
    rect(w, 600, 620, 100, 800, 4);
    grid(w, 'schuetze', 6, 380, 400, 440, 500, 'blau');
    const h = spawn(w, 'heli', 1100, 450, 'rot'); freeze(h);
  } },
  // 9. Offene Feldschlacht: 40 gegen 40 Nahkampf, Stau und Leerlauf messen
  feld: { secs: 30, setup(w) {
    grid(w, 'krieger', 40, 300, 250, 500, 650, 'blau'); grid(w, 'krieger', 40, 1100, 250, 1300, 650, 'rot');
  }, fight: true },
};

export function runScenario(name, opts = {}) {
  const S = SCENARIOS[name], w = createWorld(1600, 900, opts.seed || 7); w.teamMode = true;
  S.setup(w);
  const blue = w.units.filter(u => u.team === 'blau');
  const trace = blue.map(u => ({ type: u.type, r: u.T.r, pts: [] }));
  const m = { name, contactT: null, stuckS: 0, idleS: 0, thornDmg: 0, lavaS: 0, waterS: 0, wallHits: 0, arrived: 0 };
  const hp0 = blue.map(u => u.hp);
  for (let i = 0; i < S.secs * 60; i++) {
    step(w, DT);
    for (const e of w.events) if (e.type === 'wallHit') m.wallHits++;
    w.events.length = 0;
    blue.forEach((u, k) => {
      if (!u.alive) return;
      if (i % 6 === 0) trace[k].pts.push([Math.round(u.x), Math.round(u.y)]);
      const t = w.terr[cellIndex(w, u.x, u.y)];
      if (t === 2) m.lavaS += DT; if (t === 1) m.waterS += DT;
      if (u.blk > .3) m.stuckS += DT;
      const sp = Math.hypot(u.x - u.px, u.y - u.py) / DT;
      if (u.tg && u.tg.alive) { const d = Math.hypot(u.tg.x - u.x, u.tg.y - u.y); if (d > u.T.range + u.T.r + u.tg.T.r + 4 && sp < u.T.speed * .25) m.idleS += DT; }
    });
    if (m.contactT === null && blue.some(u => u.alive && w.units.some(v => v.team === 'rot' && v.alive && Math.hypot(v.x - u.x, v.y - u.y) < u.T.range + u.T.r + v.T.r + 2))) m.contactT = +(i * DT).toFixed(2);
  }
  m.arrived = blue.filter(u => u.alive && w.units.some(v => v.team === 'rot' && v.alive && Math.hypot(v.x - u.x, v.y - u.y) < u.T.range + u.T.r + v.T.r + 6)).length;
  m.thornDmg = Math.round(blue.reduce((s, u, k) => s + (hp0[k] - Math.max(0, u.hp)), 0));
  for (const k of ['stuckS', 'idleS', 'lavaS', 'waterS']) m[k] = +m[k].toFixed(1);
  m.n = blue.length; m.redDmg = Math.round(dmgTaken(w));
  const terr = Array.from(w.terr);
  return { m, trace, terr, GW: w.GW, GH: w.GH, red: w.units.filter(u => u.team === 'rot').map(u => [Math.round(u.x), Math.round(u.y), u.T.r, u.type]) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2] || 'all', json = (process.argv.find(a => a.startsWith('--json=')) || '').slice(7);
  const names = arg === 'all' ? Object.keys(SCENARIOS) : arg.split(',');
  const out = {};
  for (const n of names) { const r = runScenario(n); out[n] = r; console.log(JSON.stringify(r.m)); }
  if (json) (await import('node:fs')).writeFileSync(json, JSON.stringify(out));
}
