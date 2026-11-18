// Hotseat-Versus im Schlacht-Modus (Audit 18.11.): zwei Spieler an einem Gerät. Rein: kein DOM.
// Ablauf (hot.step): 'blau' (Blau malt links mit eigenem Budget) → 'coverRot' (Deckkarte „Rot ist dran“) → 'rot' (Rot malt
// rechts, Blaus Einheiten sind versteckt) → 'coverGo' (Deckkarte „Bereit?“) → 'fight' (normale Schlacht, startBattle).
// Gemalt wird mit der Budgetregel der Missionen (paint.js stamp/paintTerrain mit mission = { budget, spent, team, zone }).
// Die Oberfläche dazu: ui/hotseat.js.
import { TERRAIN, CELL } from './data.js';
import { stamp, paintTerrain, canPaintAt } from './paint.js';
import { tr } from './i18n.js';

export const HOT_BUDGETS = [100, 150, 250];
export const HOT_DEFAULT = 150;
export const SIDE_NAME = { blau: 'Blau', rot: 'Rot' };
export const MSG_OTHER_SIDE = side => tr(side === 'blau' ? 'Blau malt nur auf der linken Hälfte.' : 'Rot malt nur auf der rechten Hälfte.');

export function createHot(budget = HOT_DEFAULT) {
  return { budget: HOT_BUDGETS.includes(budget) ? budget : HOT_DEFAULT, step: 'blau', spent: { blau: 0, rot: 0 } };
}
// Die Seite, die gerade malt (oder null)
export const painter = hot => (hot && (hot.step === 'blau' || hot.step === 'rot') ? hot.step : null);
// Blaus Einheiten sind versteckt, solange Rot dran ist (auch hinter der Deckkarte davor)
// Online (online.js): hot.online, die Armee des Gegners ist gar nicht in der Welt
export const hiddenTeam = hot => (hot && !hot.online && (hot.step === 'coverRot' || hot.step === 'rot') ? 'blau' : null);
// Malzone der Seite in px: Blau links, Rot rechts der Mitte
export const sideZone = (world, side) => (side === 'blau' ? [0, world.W / 2] : [world.W / 2, world.W]);

// Budget-Objekt für paint.js (spent wird dort fortgeschrieben; danach mit hot.spent abgleichen)
export function hotMission(world, hot) {
  const side = painter(hot); if (!side) return null;
  // hot.def (Online, online.roundDef): nur die Kategorie der Runde
  return { budget: hot.budget, spent: hot.spent[side], team: side, zone: sideZone(world, side), def: hot.def || null };
}

// Ein Pinseltupfer in der Hotseat-Planung. first: erster Tupfer des Strichs (dann wird geprüft, ob er auf der eigenen
// Hälfte liegt). Liefert { blocked, placed, changed, cells, warning }.
export function hotPaint(world, hot, stroke, x, y, R, sel, first) {
  const m = hotMission(world, hot);
  if (!m) return { blocked: true, warning: null };
  if (first && !canPaintAt(world, x, m, 'plan')) return { blocked: true, warning: MSG_OTHER_SIDE(m.team) };
  let r;
  if (TERRAIN[sel]) r = paintTerrain(world, stroke, x, y, R, sel, m, 'plan');
  else r = stamp(world, stroke, x, y, R, sel, m.team, m, 'plan');
  hot.spent[m.team] = m.spent;
  return { blocked: false, placed: r.placed || 0, changed: !!r.changed, cells: r.cells, warning: r.warning };
}

// Seite fertig? Nur mit mindestens einer eigenen Einheit. Liefert die Meldung, wenn nicht.
export function finishSide(world, hot) {
  const side = painter(hot); if (!side) return null;
  if (!world.units.some(u => u.alive && u.team === side)) return tr(side === 'blau' ? 'Male zuerst eine Armee für Blau.' : 'Male zuerst eine Armee für Rot.');
  hot.step = side === 'blau' ? 'coverRot' : 'coverGo';
  return null;
}

// Eigene Hälfte leeren: Einheiten der Seite und ihr Gelände, Ausgaben auf 0
export function clearSide(world, hot) {
  const side = painter(hot); if (!side) return false;
  // wie „Leeren“ in einer Mission (main.js clear): die Einheiten der Seite fallen aus der Liste
  world.units = world.units.filter(u => u.team !== side);
  const [x0, x1] = sideZone(world, side), { GW, terr, towner, whp } = world;
  for (let i = 0; i < terr.length; i++) {
    const cx = (i % GW) * CELL + 5;
    if (towner[i] && cx >= x0 && cx <= x1) { terr[i] = 0; towner[i] = 0; whp[i] = 0; }
  }
  hot.spent[side] = 0;
  return true;
}
