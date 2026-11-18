// Alle Spieltexte, die übersetzt sein müssen (tests/i18n.test.js): Einheiten, Fähigkeiten, Synergien, Gelände,
// Kategorien, Teams, Formen, Medaillen, Kapitel und Level samt Tutorial. Liefert [Herkunft, deutscher Text].
import { UNITS, SYNERGY, TERRAIN, CATEGORIES, TEAMS, MISSIONS, MSG_NO_PAINT } from '../game/js/data.js';
import { CHAPTERS } from '../game/js/campaign/index.js';
import TUTORIAL from '../game/js/campaign/tutorial.js';
import { SHAPES, SHAPE_HOW } from '../game/js/shapes.js';
import { MEDALS } from '../game/js/medals.js';
import { RETREAT_NOTE, FORMATION_NOTE } from '../game/js/cards.js';
import { RULES, MAPS } from '../game/js/rules.js';

export function dataStrings() {
  const out = [];
  const add = (where, s) => { if (typeof s === 'string' && s.trim()) out.push([where, s]); };
  for (const k in UNITS) {
    const T = UNITS[k];
    add(`UNITS.${k}.n`, T.n); add(`UNITS.${k}.d`, T.d);
    (T.abil || []).forEach((a, i) => { add(`UNITS.${k}.abil[${i}].n`, a.n); add(`UNITS.${k}.abil[${i}].d`, a.d); });
  }
  for (const s of SYNERGY) { add(`SYNERGY.${s.k}.n`, s.n); add(`SYNERGY.${s.k}.d`, s.d); }
  for (const k in TERRAIN) { add(`TERRAIN.${k}.n`, TERRAIN[k].n); add(`TERRAIN.${k}.d`, TERRAIN[k].d); }
  for (const [k, n] of CATEGORIES) add(`CATEGORIES.${k}`, n);
  for (const k in TEAMS) add(`TEAMS.${k}`, TEAMS[k].n);
  for (const k in SHAPES) { add(`SHAPES.${k}.n`, SHAPES[k].n); add(`SHAPES.${k}.d`, SHAPES[k].d); add(`SHAPE_HOW.${k}`, SHAPE_HOW[k]); }
  for (const m of MEDALS) { add(`MEDALS.${m.id}.n`, m.n); add(`MEDALS.${m.id}.d`, m.d); }
  MISSIONS.forEach((m, i) => { add(`MISSIONS[${i}].n`, m.n); add(`MISSIONS[${i}].hint`, m.hint); });
  for (const c of CHAPTERS) {
    add(`CHAPTERS.${c.id}.n`, c.n); add(`CHAPTERS.${c.id}.d`, c.d);
    for (const l of c.levels) { add(`${l.id}.n`, l.n); add(`${l.id}.hint`, l.hint); }
  }
  for (const r of RULES) { add(`RULES.${r.id}.n`, r.n); add(`RULES.${r.id}.d`, r.d); }
  for (const m of MAPS) { add(`MAPS.${m.id}.n`, m.n); add(`MAPS.${m.id}.d`, m.d); }
  add('TUTORIAL.n', TUTORIAL.n); add('TUTORIAL.hint', TUTORIAL.hint);
  add('MSG_NO_PAINT', MSG_NO_PAINT); add('RETREAT_NOTE', RETREAT_NOTE); add('FORMATION_NOTE', FORMATION_NOTE);
  return out;
}
