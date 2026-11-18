// Statistik einer Schlacht (Spez. #46): je Seite und Einheitentyp eingesetzt, überlebt, ausgeteilter Schaden, Kills und
// Schaden je investiertem Punkt, dazu der Verlauf der Armeestärke und der Held. Rein: kein DOM, kein PIXI, kein Zufall.
// Schaden und Kills zählt combat.hurt am Verursacher (u.dmgOut, u.kills; ohne Friendly Fire). Hier werden die Einheiten
// festgehalten (auch Tote, die world.units später aussortiert) und am Ende zusammengezählt.
// - Eingesetzt sind die Einheiten beim Start (createStats). Später Entstandene (Ghule des Vampirs) zählen für ihre Seite,
//   aber nicht als eingesetzt.
// - Ein Frosch zählt als sein ursprünglicher Typ (u.orig beim Einsatz, sonst u.frogFrom).
// - Die Asche des Phönix lebt (u.alive) und zählt damit nicht als Tod.
import { UNITS } from './data.js';
import { armyPoints, battleWinner } from './sim.js';

export const SIDES = ['blau', 'rot'];
export const TIMELINE_DT = .5;   // s zwischen zwei Punkten des Verlaufs
const EPS = 1e-9;
const isSide = t => t === 'blau' || t === 'rot';

export function createStats(world) {
  const tracked = [], deployed = [];   // Einheiten und ob sie beim Start dabei waren
  const lost = new Map();              // 'seite|typ' -> Verluste (death-Ereignisse)
  const timeline = [];
  let t = 0, nextT = 0, seen = world.nextId;
  const track = (u, dep) => {
    u.orig = u.frogFrom || u.type;
    if (dep) { u.kills = 0; u.dmgOut = 0; }
    tracked.push(u); deployed.push(dep);
  };
  for (const u of world.units) if (u.alive && isSide(u.team)) track(u, UNITS[u.frogFrom || u.type].paint !== false);
  const sample = () => { const p = armyPoints(world); timeline.push({ t: nextT, blau: p.blau, rot: p.rot }); nextT += TIMELINE_DT; };
  sample();

  return {
    get time() { return t; },
    // Todesmeldungen (Verluste je Seite und Typ; die Asche des Phönix meldet keinen Tod). from: erster neuer Index.
    onEvents(events, from = 0) {
      for (let i = from; i < events.length; i++) {
        const e = events[i];
        if (e.type !== 'death' || !isSide(e.team)) continue;
        const k = e.team + '|' + e.unitType;
        lost.set(k, (lost.get(k) || 0) + 1);
      }
    },
    // Nach jedem Simulationsschritt: neu Entstandene aufnehmen (ids wachsen, world.units bleibt nach id sortiert) und
    // alle TIMELINE_DT s einen Punkt des Verlaufs.
    tick(w, dt) {
      t += dt;
      if (w.nextId > seen) {
        const us = w.units;
        let i = us.length - 1;
        while (i >= 0 && us[i].id >= seen) i--;
        for (let j = i + 1; j < us.length; j++) if (isSide(us[j].team)) track(us[j], false);
        seen = w.nextId;
      }
      while (t + EPS >= nextT) sample();
    },
    result(w) {
      const rows = new Map(), survivors = { blau: 0, rot: 0 };
      let hero = null;
      for (let i = 0; i < tracked.length; i++) {
        const u = tracked[i], k = u.team + '|' + u.orig;
        let r = rows.get(k);
        if (!r) { r = { side: u.team, type: u.orig, deployed: 0, survived: 0, dmg: 0, kills: 0, dmgPerPt: 0, lost: lost.get(k) || 0 }; rows.set(k, r); }
        if (deployed[i]) r.deployed++;
        if (u.alive) { r.survived++; survivors[u.team]++; }
        r.dmg += u.dmgOut; r.kills += u.kills;
        if (u.kills > 0 && (!hero || u.kills > hero.kills)) hero = { type: u.orig, side: u.team, kills: u.kills };
      }
      const table = [...rows.values()];
      for (const r of table) { const pts = r.deployed * UNITS[r.type].cost; r.dmgPerPt = pts > 0 ? r.dmg / pts : 0; }
      table.sort((a, b) => SIDES.indexOf(a.side) - SIDES.indexOf(b.side) || b.deployed * UNITS[b.type].cost - a.deployed * UNITS[a.type].cost || (a.type < b.type ? -1 : 1));
      const tl = timeline.slice();
      if (t - tl[tl.length - 1].t > EPS) { const p = armyPoints(w); tl.push({ t, blau: p.blau, rot: p.rot }); }
      return { winner: battleWinner(w, Infinity), time: t, survivors, table, timeline: tl, hero };
    },
  };
}
