// Kritzel-Formen (Audit 18.11.): Die Form eines Pinselstrichs gibt seinen Einheiten einen kleinen Bonus. Rein: kein DOM.
// - Keil (ein Pfeil mit der Spitze zum Gegner): Sturmkeil, die ersten Sekunden schneller und härter (u.buffT, spdMul, dmgMul;
//   combat.think setzt beides nach Ablauf zurück).
// - Kreis (geschlossener Ring): Igel, dauerhaft weniger Schaden (u.armor, combat.hurt).
// - Linie (lang und gerade): Schlachtreihe, mehr Leben beim Malen (u.hp über T.hp; Heilung füllt nur bis T.hp).
// Erkannt wird der Weg des Pinsels (Mittelpunkte), nicht die Lage der Einheiten. Kurze Kleckse ergeben keine Form.
export const SHAPES = {
  keil: { n: 'Sturmkeil', d: '6 s lang 30 % schneller und 15 % mehr Nahkampfschaden', buffT: 6, spdMul: 1.3, dmgMul: 1.15 },
  kreis: { n: 'Igel', d: '15 % weniger Schaden', armor: .85 },
  linie: { n: 'Schlachtreihe', d: '20 % mehr Leben', hp: 1.2 },
};
export const SHAPE_MIN_UNITS = 6;   // weniger Einheiten im Strich: keine Form
// Lexikon: wie man jede Form malt. Getrennt von SHAPES, weil SHAPES in die Spielversion der Bestenliste eingeht
// (dailyboard.SIM_VERSION); reiner Text ändert sie so nicht.
export const SHAPE_HOW = {
  keil: 'Male einen Pfeil: zwei gerade Schenkel, die Spitze zeigt zum Gegner (steht er rechts, also wie ein „>“).',
  kreis: 'Male einen geschlossenen Ring: Der Strich endet wieder dort, wo er begann.',
  linie: 'Male einen langen, fast geraden Strich, egal in welche Richtung.',
};

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function pathLen(p, i0 = 0, i1 = p.length - 1) {
  let L = 0;
  for (let i = i0 + 1; i <= i1; i++) L += dist(p[i - 1], p[i]);
  return L;
}
// Abstand des Punkts q von der Strecke a-b
function segDist(q, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2));
  return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
}
// Punkte enger als step zusammenfassen (Mausereignisse kommen unregelmäßig)
function simplify(path, step) {
  const out = [path[0]];
  for (let i = 1; i < path.length; i++) if (dist(out[out.length - 1], path[i]) >= step) out.push(path[i]);
  if (out.length > 1 && dist(out[out.length - 1], path[path.length - 1]) > 0) out.push(path[path.length - 1]);
  return out;
}
// Summe der Richtungswechsel (Bogenmaß, mit Vorzeichen)
function turning(p) {
  let s = 0;
  for (let i = 2; i < p.length; i++) {
    const a1 = Math.atan2(p[i - 1][1] - p[i - 2][1], p[i - 1][0] - p[i - 2][0]);
    const a2 = Math.atan2(p[i][1] - p[i - 1][1], p[i][0] - p[i - 1][0]);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    s += d;
  }
  return s;
}

// path: [[x, y], ...] Pinselmittelpunkte; brush: Pinselradius (px); dir: +1, wenn der Gegner rechts steht, −1 links.
// Liefert 'keil' | 'kreis' | 'linie' oder null.
export function classifyStroke(path, brush, dir = 1) {
  if (!path || path.length < 3) return null;
  const p = simplify(path, Math.max(4, brush * .25));
  if (p.length < 3) return null;
  const L = pathLen(p), a = p[0], b = p[p.length - 1], d = dist(a, b);
  if (L < brush * 4) return null;
  // Kreis: Anfang nahe am Ende, fast eine ganze Umdrehung, nicht zu flach
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  const w = x1 - x0, h = y1 - y0, asp = w / (h || 1);
  if (d < Math.max(brush * 1.5, L * .2) && Math.abs(turning(p)) > Math.PI * 1.5 && asp > .4 && asp < 2.5) return 'kreis';
  // Keil: zwei gerade Schenkel, Spitze weit weg von der Sehne und zum Gegner hin, Winkel an der Spitze 20°–130°
  let k = 0, md = 0;
  for (let i = 1; i < p.length - 1; i++) { const s = segDist(p[i], a, b); if (s > md) { md = s; k = i; } }
  if (k > 0 && md > Math.max(brush, d * .3)) {
    const apex = p[k], l1 = pathLen(p, 0, k), l2 = pathLen(p, k, p.length - 1);
    const st1 = dist(a, apex) / (l1 || 1), st2 = dist(apex, b) / (l2 || 1);
    const v1 = [a[0] - apex[0], a[1] - apex[1]], v2 = [b[0] - apex[0], b[1] - apex[1]];
    const ang = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / ((Math.hypot(...v1) * Math.hypot(...v2)) || 1))));
    const ahead = (apex[0] - (a[0] + b[0]) / 2) * dir;
    if (st1 > .85 && st2 > .85 && Math.min(l1, l2) > brush * 1.5 && ang > .35 && ang < 2.27 && ahead > md * .5) return 'keil';
  }
  // Linie: fast gerade
  if (d / L > .88) return 'linie';
  return null;
}

// Bonus auf eine Einheit legen. fresh: frisch gemalt (Leben erhöhen); beim Wiederherstellen einer Aufstellung kommt das Leben
// schon aus dem Schnappschuss, dort nur die übrigen Wirkungen.
export function applyShape(u, shape, fresh = true) {
  const S = SHAPES[shape]; if (!S) return;
  u.shape = shape;
  if (S.buffT) { u.buffT = S.buffT; u.spdMul = S.spdMul; u.dmgMul = S.dmgMul; }
  if (S.armor) u.armor = S.armor;
  if (S.hp && fresh) u.hp = u.T.hp * S.hp;
}
