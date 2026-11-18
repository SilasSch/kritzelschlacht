// Regeln und Karten für 1 gegen 1 (Online und Code-Duell, 18.11.). Rein: kein DOM, Zufall nur über rand().
// Regel = welche Einheiten in der Runde erlaubt sind: eine Kategorie, zwei gemischt oder eine Auswahl nach Eigenschaft
// (Fernkampf, Flieger, billig …). def ist ein Level-artiges Objekt für campaign/index.js unitAllowed/catAllowed.
// Karte = festes Gelände, spiegelgleich für beide Seiten. Kartengelände gehört niemandem (towner 0) und lässt sich in der
// Planung nicht wegradieren.
import { UNITS } from './data.js';
import { tRect, tCircle } from './sim.js';
import { touchTerrain, setCell } from './world.js';

const PAINT = Object.keys(UNITS).filter(t => UNITS[t].paint !== false);
const sel = f => PAINT.filter(t => f(UNITS[t]));

export const RULES = [
  { id: 'armee', n: 'Armee', d: 'Krieger, Ritter, Schützen, Römer …', cats: ['armee'] },
  { id: 'tiere', n: 'Tiere', d: 'Wölfe, Bären, Bienen, Elefanten …', cats: ['tiere'] },
  { id: 'mythisch', n: 'Mythisch', d: 'Magier, Drachen, Vampire, Trolle …', cats: ['mythisch'] },
  { id: 'modern', n: 'Modern', d: 'Soldaten, MGs, Panzer, Hubschrauber …', cats: ['modern'] },
  { id: 'wildnis', n: 'Armee + Tiere', d: 'Ritter reiten mit Wölfen und Bären', cats: ['armee', 'tiere'] },
  { id: 'maerchen', n: 'Märchenwald', d: 'Mythisch + Tiere', cats: ['mythisch', 'tiere'] },
  { id: 'zeitreise', n: 'Zeitreise', d: 'Armee + Modern: Ritter neben Panzern', cats: ['armee', 'modern'] },
  { id: 'sagen', n: 'Sagen und Stahl', d: 'Mythisch + Modern', cats: ['mythisch', 'modern'] },
  { id: 'fern', n: 'Nur Fernkampf', d: 'Alles, was schießt, wirft oder zaubert', units: sel(T => T.range >= 20 && !T.heal) },
  { id: 'nah', n: 'Nur Nahkampf', d: 'Schwerter, Zähne, Hörner', units: sel(T => T.range < 20) },
  { id: 'luft', n: 'Luftkampf', d: 'Nur was fliegt', units: sel(T => T.fly) },
  { id: 'billig', n: 'Kleinvieh', d: 'Nur Einheiten bis 3 Punkte: Masse statt Klasse', units: sel(T => T.cost <= 3) },
  { id: 'elite', n: 'Schwergewichte', d: 'Nur Einheiten ab 7 Punkten', units: sel(T => T.cost >= 7) },
  { id: 'alles', n: 'Alles erlaubt', d: 'Jede Einheit aus jeder Kategorie', cats: null },
];
export const RULE = Object.fromEntries(RULES.map(r => [r.id, r]));
export const RULE_IDS = RULES.map(r => r.id);
export const ruleDef = id => { const r = RULE[id] || RULE.alles; return { id: 'online', cats: r.cats || null, units: r.units || null }; };
export function ruleAllows(id, type) {
  const r = RULE[id], T = UNITS[type];
  if (!r || !T || T.paint === false) return false;
  return (!r.cats || r.cats.includes(T.cat)) && (!r.units || r.units.includes(type));
}

// Karten: Gelände der linken Hälfte (und der Mitte) in Anteilen der Welt; mirror: true spiegelt es auf die rechte Hälfte
// r: ['rect', key, x0, y0, x1, y1] | ['circle', key, cx, cy, r (Anteil von H)]
export const MAPS = [
  { id: 'feld', n: 'Offenes Feld', d: 'Nichts im Weg', t: [] },
  { id: 'fluss', n: 'Fluss', d: 'Wasser in der Mitte bremst alle Bodentruppen', t: [['rect', 'wasser', .47, 0, .53, 1]] },
  { id: 'furt', n: 'Zwei Furten', d: 'Lava in der Mitte, zwei Übergänge', t: [['rect', 'lava', .48, 0, .52, .18], ['rect', 'lava', .48, .34, .52, .66], ['rect', 'lava', .48, .82, .52, 1]] },
  { id: 'wald', n: 'Wäldchen', d: 'Wald gibt Deckung gegen Pfeile und Explosionen', mirror: true, t: [['circle', 'wald', .32, .22, .11], ['circle', 'wald', .32, .78, .11], ['circle', 'wald', .5, .5, .1]] },
  { id: 'mauern', n: 'Bollwerk', d: 'Mauern vor beiden Seiten, Lücke in der Mitte', mirror: true, t: [['rect', 'mauer', .4, .1, .415, .4], ['rect', 'mauer', .4, .6, .415, .9]] },
  { id: 'see', n: 'See', d: 'Ein See in der Mitte, Kampf an den Ufern', t: [['circle', 'wasser', .5, .5, .26]] },
];
export const MAP = Object.fromEntries(MAPS.map(m => [m.id, m]));
export const MAP_IDS = MAPS.map(m => m.id);

// Alle Gelände-Teile einer Karte (gespiegelt), in Anteilen
export function mapParts(id) {
  const m = MAP[id] || MAP.feld, out = [];
  for (const p of m.t) {
    out.push(p);
    if (m.mirror) out.push(p[0] === 'rect' ? ['rect', p[1], 1 - p[4], p[3], 1 - p[2], p[5]] : ['circle', p[1], 1 - p[2], p[3], p[4]]);
  }
  return out;
}
// Karte in die Welt legen (Gelände vorher leer). Liefert nichts; die Welt meldet das Gelände über touchTerrain.
export function applyMap(world, id) {
  for (const p of mapParts(id)) {
    if (p[0] === 'rect') tRect(world, p[1], p[2], p[3], p[4], p[5]);
    else tCircle(world, p[1], p[2], p[3], p[4]);
  }
  // Rasterung macht Ränder ungleich: auf beide Seiten spiegeln, damit keine Seite eine Zelle mehr hat
  const { GW, GH, terr } = world;
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const i = gy * GW + gx, j = gy * GW + (GW - 1 - gx);
    if (terr[i] && !terr[j]) setCell(world, j, terr[i], 0);
  }
  touchTerrain(world);
}

/* ---------- Auswahl und Abstimmung ---------- */
// n verschiedene Einträge aus pool (ohne avoid), zufällig
export function draw(pool, n, rand, avoid = null) {
  const a = pool.filter(x => x !== avoid), out = [];
  while (out.length < n && a.length) out.push(a.splice(Math.floor(rand() * a.length) % a.length, 1)[0]);
  return out;
}
// Ergebnis der Abstimmung: gleiche Stimme gewinnt, sonst entscheidet das Los zwischen beiden Stimmen
export function resolveVote(a, b, rand) {
  if (a === b) return { pick: a, agreed: true };
  return { pick: rand() < .5 ? a : b, agreed: false };
}

// Kleine Vorschau einer Karte als SVG-Text (für Abstimmung und Code-Duell); Mittellinie gestrichelt
const T_COL = { wasser: '#8fcdf2', lava: '#ff7a45', wald: '#6dbb63', mauer: '#8d8d96' };
export function mapSVG(id, w = 120, h = 68) {
  const parts = mapParts(id).map(p => (p[0] === 'rect'
    ? `<rect x="${(p[2] * w).toFixed(1)}" y="${(p[3] * h).toFixed(1)}" width="${((p[4] - p[2]) * w).toFixed(1)}" height="${((p[5] - p[3]) * h).toFixed(1)}" fill="${T_COL[p[1]]}"/>`
    : `<circle cx="${(p[2] * w).toFixed(1)}" cy="${(p[3] * h).toFixed(1)}" r="${(p[4] * h).toFixed(1)}" fill="${T_COL[p[1]]}"/>`)).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><rect width="${w}" height="${h}" rx="6" fill="#f6f1e4"/>`
    + `<rect width="${w / 2}" height="${h}" rx="6" fill="#3f7cff" opacity=".08"/><rect x="${w / 2}" width="${w / 2}" height="${h}" fill="#ff4d4d" opacity=".08"/>${parts}`
    + `<line x1="${w / 2}" y1="2" x2="${w / 2}" y2="${h - 2}" stroke="#333" stroke-dasharray="3 3" opacity=".35"/></svg>`;
}
