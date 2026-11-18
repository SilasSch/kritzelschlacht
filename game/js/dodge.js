// Bomben ausweichen (Nachtrag 7, #47). Rein: kein DOM, Zufall nur über world.rng().
// Bombe und Granate ('bomb'), Mörsergranate ('mortar') und Felsbrocken ('boulder') fliegen im Bogen (combat.fire,
// world.proj). Spätestens DODGE.LEAD s vor dem Einschlag (combat.stepProjectiles, einmal je Geschoss: p.dg) würfelt jede
// Bodeneinheit, deren Körper den Einschlagkreis (p.R) berührt, genau einmal gegen ihre Wendigkeit u.T.dodge (data.js,
// AGILITY). Gelingt der Wurf, macht sie einen kurzen Hüpfer aus dem Kreis: ein Stoß am Boden (applyImpulse ohne
// Steigen, also kein Abheben und keine Betäubung), vom Einschlagpunkt weg, so stark, dass er bis zum Einschlag aus
// dem Kreis führt; während u.hopT läuft, ruht die Wunschbewegung (physics.integrate), der Renderer hebt die Figur
// dabei sichtbar an. Nie in Lava, Mauern oder über den Kartenrand: geprüft wird der ganze Weg; ist die Richtung vom
// Einschlag weg versperrt, werden gedrehte Richtungen versucht, sonst bleibt sie stehen.
// Kein Wurf: Flieger, Geschleuderte ('air'), Betäubte ('stun', auch gepackt oder festgehalten), Liegende und wer sich
// hinlegt oder aufsteht (MG, Scharfschütze: 0 %), Römer im Block (formOn) und wer schon hüpft. Der Meteor
// (spells.js) ist kein Geschoss: ihm weicht niemand aus.
import { TERR_HAZ } from './data.js';
import { query, cellIndex } from './world.js';
import { applyImpulse, GROUND_FRICTION } from './physics.js';

export const DODGE_KINDS = new Set(['bomb', 'mortar', 'boulder']);
// LEAD: s vor dem Einschlag wird gewürfelt; HOP_T: Dauer des Hüpfers (s), HOP_H: Höhe der Figur dabei (px, nur
// gezeichnet); PAD: so viel weiter (px) als nötig hinaus; MAX: höchstens so weit (px); STEP: Abstand der Wegproben (px);
// TURNS: gedrehte Richtungen (rad) zur Richtung vom Einschlag weg, der Reihe nach versucht.
export const DODGE = { LEAD: .4, HOP_T: .4, HOP_H: 5, PAD: 5, MAX: 110, STEP: 5, TURNS: [0, .55, -.55, 1.1, -1.1, 1.65, -1.65] };
// Weg je Startgeschwindigkeit nach LEAD s (Reibung exp(−8·t)); erst beim Aufruf (Importkreis über physics.js)
const reach = () => (1 - Math.exp(-GROUND_FRICTION * DODGE.LEAD)) / GROUND_FRICTION;
const EDGE = 8;

// Darf u würfeln?
export const canDodge = u => u.alive && !u.T.fly && u.state === 'ok' && u.stance === 'stand' && !u.formOn && !(u.hopT > 0);

// Weg von (x, y) in Richtung (dx, dy) über s px (plus Körperrand) frei von Lava und Mauern und auf der Karte?
function pathSafe(world, x, y, dx, dy, s, r) {
  const L = s + r * .6, n = Math.max(1, Math.ceil(L / DODGE.STEP)), terr = world.terr;
  for (let k = 1; k <= n; k++) {
    const q = L * k / n, px = x + dx * q, py = y + dy * q;
    if (px < EDGE || py < EDGE || px > world.W - EDGE || py > world.H - EDGE) return false;
    if (TERR_HAZ[terr[cellIndex(world, px, py)]]) return false;
  }
  return true;
}

// Hüpfer von u aus dem Kreis (cx, cy, Radius R + Körper); fx/fy: Flugrichtung des Geschosses (für u genau im
// Mittelpunkt: seitlich dazu). true, wenn ein freier Weg gefunden und der Stoß gesetzt ist.
const HOP = { x: 0, y: 0, s: 0 };
export function hopOut(world, u, cx, cy, R, fx, fy) {
  const rr = R + u.T.r + DODGE.PAD, ox = u.x - cx, oy = u.y - cy, d2 = ox * ox + oy * oy, d = Math.sqrt(d2);
  let bx, by;
  if (d > 1) { bx = ox / d; by = oy / d; }
  else { const l = Math.hypot(fx, fy) || 1, s = u.id % 2 ? 1 : -1; bx = -fy / l * s; by = fx / l * s; if (!(l > 0)) { bx = s; by = 0; } }
  for (const a of DODGE.TURNS) {
    const c = Math.cos(a), sn = Math.sin(a), dx = bx * c - by * sn, dy = bx * sn + by * c;
    // Strecke bis zum Kreisrand in Richtung (dx, dy): |o + s·dir| = rr
    const b = ox * dx + oy * dy, s = -b + Math.sqrt(Math.max(0, b * b - (d2 - rr * rr)));
    if (!(s > 0) || s > DODGE.MAX) continue;
    if (!pathSafe(world, u.x, u.y, dx, dy, s, u.T.r)) continue;
    const v0 = s / reach(), m = u.T.mass || 1;
    applyImpulse(u, dx * v0 * m, dy * v0 * m, 0);
    u.hopT = DODGE.HOP_T;
    if (dx < -.2) u.face = -1; else if (dx > .2) u.face = 1;
    HOP.x = dx; HOP.y = dy; HOP.s = s;
    return true;
  }
  return false;
}

// Würfe für das Bogengeschoss p (einmal je Geschoss: p.dg). Liefert die Zahl der Würfe.
let W_ = null, P_ = null, N_ = 0;
function rollOne(v) {
  const world = W_, p = P_, dx = v.x - p.x1, dy = v.y - p.y1, rr = p.R + v.T.r;
  if (dx * dx + dy * dy > rr * rr || !canDodge(v)) return;
  N_++;
  if (!(world.rng() < v.T.dodge)) return;
  if (hopOut(world, v, p.x1, p.y1, p.R, p.x1 - p.x0, p.y1 - p.y0))
    world.events.push({ type: 'dodge', x: v.x, y: v.y, nx: HOP.x, ny: HOP.y, kind: p.kind });
}
export function rollDodges(world, p) {
  if (p.dg) return 0;
  p.dg = true;
  if (!(p.R > 0)) return 0;
  W_ = world; P_ = p; N_ = 0;
  query(world, p.x1, p.y1, p.R + 30, rollOne);
  W_ = null; P_ = null;
  return N_;
}
