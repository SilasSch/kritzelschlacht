// Reiner Kampf: KI, Waffen, Geschosse, Schaden/Rüstung, Explosionen, Mauertreffer.
// Port aus kritzelschlacht.html. Kein DOM, Zufall nur über world.rng(). Effekte und Töne
// werden als Ereignisse in world.events geschrieben.
import { CELL, HASH_CELL, UNITS } from './data.js';
import { factionOf, cellIndex, query, nearestEnemy } from './world.js';
import { applyImpulse, makeCorpse, WALL_CLEAR_Z, LAUNCH_VZ, MAX_FLING } from './physics.js';

// Typen, die in Reihe marschieren bzw. vor Nahkämpfern zurückweichen
export const LINE = new Set(['krieger', 'ritter', 'soldat']);
export const KITE = new Set(['schuetze', 'soldat', 'sniper']);
// Schützen mit geraden Schüssen (Kugel, Rakete, Feuerball): prüfen vor dem Schuss die Schusslinie
export const STRAIGHT = new Set(['soldat', 'mg', 'sniper', 'panzerfaust', 'heli', 'magier']);
const STRAIGHT_KIND = { soldat: 'bullet', mg: 'bullet', sniper: 'bullet', heli: 'bullet', panzerfaust: 'rocket', magier: 'fire' };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (world, a, b) => a + world.rng() * (b - a);
const emit = (world, e) => { world.events.push(e); };
const sound = (world, k) => { world.events.push({ type: 'sound', k }); };

// Bögen (arc) fliegen über Köpfe und treffen nur am Zielpunkt; gerade Schüsse treffen das Erste im Weg.
export const PROJECTILES = {
  arrow: { arc: true, speed: 520 }, bomb: { arc: true, speed: 450 }, mortar: { arc: true, speed: 500 },
  shell: { arc: true, speed: 850 }, bullet: { arc: false, speed: 1100 }, rocket: { arc: false, speed: 520 },
  fire: { arc: false, speed: 330 },
};
// Je Art: [Grundflugzeit (nur Bögen), Bogenhöhe je Distanz, Streuung, Ton]
const SHOT = {
  arrow: [.25, .16, 8, 'twang'],
  bomb: [.55, .35, 14, 'throw'],
  mortar: [.9, .55, 18, 'thump'],
  shell: [0, .08, 6, 'cannon'],
  fire: [0, 0, 14, 'fire'],
  bullet: [0, 0, 5, 'shot'],
  rocket: [0, 0, 6, 'whoosh'],
};

// Höhen der geraden Schüsse: am Boden in Laufhöhe (unter WALL_CLEAR_Z, Mauern blocken),
// auf Flieger in deren Höhe (über WALL_CLEAR_Z, also über Mauern und meist über Bodentruppen).
export const MUZZLE_Z = 6;
const BODY_Z_PAD = 10;        // Körper wird getroffen, wenn |body.z − shot.z| < r + 10
const BULLET_OVERSHOOT = 60;  // Kugeln fliegen so weit über den Zielpunkt hinaus
const BULLET_WALL = 1;        // Mauerschaden einer Kugel je Schadenspunkt
const LOF_PAD = 6;            // Schusslinie: Körper zählen um so viel dicker (Streuung)
const LOF_RETARGET = 2;       // s verdeckt, dann neues Ziel unter den 8 nächsten Gegnern
const LOF_HOLD = 2.5;         // so lange bleibt das Ausweichziel gesetzt
const LOF_SIDE = .7;          // Tempo beim seitlichen Ausweichen
const MAX_R = Math.max(...Object.values(UNITS).map(T => T.r));
const HC = HASH_CELL, WALL = 4;
export const shotZ = t => (t.T.fly ? t.z : MUZZLE_Z);

/* ---------- Schaden ---------- */
export function hurt(world, v, a, kind, src) {
  if (!v.alive) return 0;
  let m = 1; const t = v.type;
  if (t === 'ritter') {
    m *= kind === 'arrow' ? .35 : kind === 'melee' ? .7 : kind === 'bullet' ? .8 : 1.5;
    if (v.wall && (kind === 'arrow' || kind === 'melee')) m *= .65;
  }
  if (t === 'panzer') m *= kind === 'bullet' ? .25 : kind === 'arrow' ? .2 : kind === 'melee' ? .7 : kind === 'rocket' ? 1.6 : kind === 'fire' ? .6 : .8;
  if (t === 'heli') m *= kind === 'rocket' ? 1.4 : kind === 'arrow' || kind === 'melee' ? .5 : 1;
  if (t === 'geist' && kind !== 'fire') m *= .5;
  // Wald gibt Bodentruppen Deckung gegen Fernkampf und Explosionen
  if (!v.T.fly && world.terr[cellIndex(world, v.x, v.y)] === 3 &&
      (kind === 'arrow' || kind === 'blast' || kind === 'bullet' || kind === 'rocket')) m *= .5;
  const d = a * m; v.hp -= d; v.hitT = .15;   // Treffer-Quetschen (rig.js)
  // Eigene Leute (Friendly Fire) zählen nicht als Abschuss
  if (v.hp <= 0) { if (src && factionOf(world, src) !== factionOf(world, v)) src.kills++; die(world, v, src); }
  return d;
}

// Teile, die beim Sterben als eigene Leichenteile wegfliegen (Rig-Teil headgear/weapon; beim Ritter ist
// die "Waffe" der Schild, beim Panzer der Turm, beim Hubschrauber die Kopfbedeckung der Rotor)
export const PARTS = {
  krieger: ['headgear', 'weapon'], schuetze: ['headgear', 'weapon'], ritter: ['headgear', 'shield'],
  grenadier: ['headgear', 'weapon'], reiter: ['weapon'], sani: ['headgear'], wolf: [], baer: [], biene: [],
  magier: ['headgear', 'weapon'], geist: [], drache: [], soldat: ['headgear', 'weapon'], mg: ['headgear', 'weapon'],
  sniper: ['headgear', 'weapon'], panzerfaust: ['headgear', 'weapon'], moerser: ['headgear', 'weapon'],
  panzer: ['turret'], heli: ['headgear', 'weapon'],
};
const VROT_MIN = 4, VROT_MAX = 10;                 // rad/s, Drehung der Leiche
const PART_V = [60, 160], PART_VZ = [160, 280], PART_VROT = [6, 14];

// Leiche mit der Geschwindigkeit der Einheit (Fremd- plus Wunschbewegung), in der Luft getötete fliegen
// weiter. Dazu die Teile laut PARTS mit Zufallsimpuls. Das Seelchen zeichnet der Renderer zum death-Ereignis.
function die(world, v, src) {
  v.alive = false; world.dead = (world.dead || 0) + 1;
  const T = v.T, vx = v.vx + v.mx, vy = v.vy + v.my, sgn = () => (world.rng() < .5 ? -1 : 1);
  const vrot = sgn() * rnd(world, VROT_MIN, VROT_MAX);
  world.corpses.push(makeCorpse('body', null, v.type, v.team, v.face, v.x, v.y, v.z, vx, vy, v.vz, 0, vrot));
  const parts = PARTS[v.type];
  for (let i = 0; i < parts.length; i++) {
    const a = world.rng() * Math.PI * 2, sp = rnd(world, PART_V[0], PART_V[1]);
    const vz = rnd(world, PART_VZ[0], PART_VZ[1]), pr = sgn() * rnd(world, PART_VROT[0], PART_VROT[1]);
    world.corpses.push(makeCorpse('part', parts[i], v.type, v.team, v.face, v.x, v.y, v.z + T.r,
      vx + Math.cos(a) * sp, vy + Math.sin(a) * sp, Math.max(0, v.vz) + vz, 0, pr));
  }
  emit(world, {
    type: 'death', x: v.x, y: v.y, unitType: v.type, team: v.team,
    killerId: src ? src.id : null, killerType: src ? src.type : null,
    killerTeam: src ? src.team : null, killerKills: src ? src.kills : null,
  });
  sound(world, 'die');
}

// Rückstoß: waagrechter Impuls f · massRef (massRef 1), die Masse skaliert ihn (physics.js).
// Normale Treffer schubsen nur (iz = 0), betäuben also nicht.
function knock(v, nx, ny, f) { applyImpulse(v, nx * f, ny * f, 0); }

// Friendly Fire: trifft alle Fraktionen; der Schütze src selbst bekommt ×0.5 Schaden.
// f (Fraktion des Schützen) bleibt in der Signatur, wird aber nicht mehr ausgenommen.
// Schleudern: waagrechter Impuls I = dmg · 9 · falloff vom Zentrum weg, senkrecht iz = 0.6 · I. Der
// senkrechte Anteil wirkt nur, wenn er die Einheit mit mindestens LAUNCH_VZ abheben lässt (sonst nur
// Schubs, keine Betäubung). Leichte Körper werden auf MAX_FLING gedeckelt. Der Impuls wirkt vor dem
// Schaden, damit die Leiche einer getöteten Einheit mitfliegt.
const BLAST_PUSH = 9, BLAST_LIFT = .6;
export function blast(world, x, y, R, dmg, f, src, kind, wallMul) {
  query(world, x, y, R + 16, v => {
    const dx = v.x - x, dy = v.y - y, d = Math.hypot(dx, dy);
    if (d > R + v.T.r) return;
    const fall = 1 - .5 * Math.min(1, d / R), m = v.T.mass || 1;
    let I = dmg * BLAST_PUSH * fall;
    if (I > MAX_FLING * m) I = MAX_FLING * m;
    const iz = BLAST_LIFT * I;
    applyImpulse(v, dx / (d || 1) * I, dy / (d || 1) * I, iz >= LAUNCH_VZ * m ? iz : 0);
    hurt(world, v, dmg * fall * (v === src ? .5 : 1), kind, src);
  });
  if (wallMul) {
    const { GW, GH, terr } = world;
    const g0x = Math.max(0, (x - R) / CELL | 0), g1x = Math.min(GW - 1, (x + R) / CELL | 0);
    const g0y = Math.max(0, (y - R) / CELL | 0), g1y = Math.min(GH - 1, (y + R) / CELL | 0);
    let any = false;
    for (let gy = g0y; gy <= g1y; gy++) for (let gx = g0x; gx <= g1x; gx++) {
      const i = gy * GW + gx; if (terr[i] !== 4) continue;
      const cx = gx * CELL + 5, cy = gy * CELL + 5;
      if ((cx - x) ** 2 + (cy - y) ** 2 > R * R) continue;
      if (hitWall(world, i, dmg * wallMul, x, y, false)) any = true;
    }
    if (any) emit(world, { type: 'terrain', gx0: Math.max(0, g0x - 1), gy0: Math.max(0, g0y - 1), gx1: Math.min(GW - 1, g1x + 1), gy1: Math.min(GH - 1, g1y + 1) });
  }
  emit(world, { type: 'blast', x, y, R, kind, shake: kind === 'fire' ? 3 : 5 });
  sound(world, kind === 'fire' ? 'fire' : 'boom');
}

// Ab hier zeigt die Mauer Risse (Darstellung im Renderer)
export const WALL_CRACK_HP = 70;

// fromX/fromY: Herkunft des Treffers (Flugrichtung der Trümmer).
// Liefert true, wenn sich das Aussehen geändert hat (Risse ab WALL_CRACK_HP oder zerbrochen);
// nur dann gibt es ein terrain-Ereignis.
export function hitWall(world, i, d, fromX, fromY, emitTerrain = true) {
  const { GW, GH } = world;
  const before = world.whp[i];
  world.whp[i] -= d;
  const gx = i % GW, gy = i / GW | 0;
  let broken = false;
  if (world.whp[i] <= 0) { world.terr[i] = 0; world.towner[i] = 0; broken = true; }
  emit(world, { type: 'wallHit', i, x: gx * CELL + 5, y: gy * CELL + 5, fromX, fromY, broken });
  const changed = broken || (before >= WALL_CRACK_HP && world.whp[i] < WALL_CRACK_HP);
  if (changed && emitTerrain) emit(world, { type: 'terrain', gx0: Math.max(0, gx - 1), gy0: Math.max(0, gy - 1), gx1: Math.min(GW - 1, gx + 1), gy1: Math.min(GH - 1, gy + 1) });
  return changed;
}

/* ---------- Schusslinie ---------- */
// Ergebnis des internen Strahls (wiederverwendet, keine Allokation im Geschossschritt)
const RAY = { unit: null, cell: -1, t: 1 };

// Erste Mauerzelle auf dem Segment (Gitterlauf über CELL-Zellen), in der die Bahnhöhe unter
// WALL_CLEAR_Z liegt. Die Höhe läuft linear von za (t=0) nach zb (t=1). Liefert t in [0,1] oder 2.
function wallHit(world, x0, y0, x1, y1, za, zb) {
  if (za >= WALL_CLEAR_Z && zb >= WALL_CLEAR_Z) return 2;
  const { GW, GH, terr } = world, dx = x1 - x0, dy = y1 - y0, dz = zb - za;
  let gx = clamp(x0 / CELL | 0, 0, GW - 1), gy = clamp(y0 / CELL | 0, 0, GH - 1);
  const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0, sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tdx = sx ? CELL / Math.abs(dx) : Infinity, tdy = sy ? CELL / Math.abs(dy) : Infinity;
  let tx = sx > 0 ? ((gx + 1) * CELL - x0) / dx : sx < 0 ? (gx * CELL - x0) / dx : Infinity;
  let ty = sy > 0 ? ((gy + 1) * CELL - y0) / dy : sy < 0 ? (gy * CELL - y0) / dy : Infinity;
  let t = 0;
  for (;;) {
    if (terr[gy * GW + gx] === WALL) {
      // Bahn in dieser Zelle von t bis zum nächsten Zellrand: Treffer, sobald sie unter WALL_CLEAR_Z ist
      const tOut = Math.min(tx, ty, 1);
      if (za + dz * t < WALL_CLEAR_Z) { RAY.cell = gy * GW + gx; return t; }
      if (za + dz * tOut < WALL_CLEAR_Z) { RAY.cell = gy * GW + gx; return (WALL_CLEAR_Z - za) / dz; }
    }
    if (tx < ty) { t = tx; tx += tdx; gx += sx; } else { t = ty; ty += tdy; gy += sy; }
    if (t > 1 || gx < 0 || gy < 0 || gx >= GW || gy >= GH) return 2;
  }
}

// Erster Körper oder erste Mauerzelle auf dem Segment, über den Spatial Hash (nur Hash-Zellen in
// MAX_R-Nähe des Segments, jede einmal). Die Bahnhöhe läuft linear von za nach zb (Flieger schießen
// schräg nach unten); ein Körper zählt, wenn |body.z − z| < r + 10 an der Stelle seiner größten
// Annäherung. Mauern zählen nur, wo z < WALL_CLEAR_Z.
// skip: ein Körper, skipSet: Set oder null; pad macht alle Körper dicker (Schusslinie).
// Ergebnis in RAY: unit (oder null), cell (Mauerzelle oder −1), t (Anteil am Segment, 1 ohne Treffer).
function cast(world, x0, y0, x1, y1, za, zb, skip, skipSet, pad) {
  RAY.unit = null; RAY.cell = -1; RAY.t = 1;
  let best = wallHit(world, x0, y0, x1, y1, za, zb);   // setzt RAY.cell bei Treffer
  const { HW, HH, hash } = world, dx = x1 - x0, dy = y1 - y0, dz = zb - za, L2 = dx * dx + dy * dy;
  const zlo = za < zb ? za : zb, zhi = za < zb ? zb : za;
  const P = MAX_R + pad + 4;   // +4: Hash ist vom Anfang des Schritts, Körper haben sich seitdem bewegt
  const gy0 = clamp((Math.min(y0, y1) - P) / HC | 0, 0, HH - 1), gy1 = clamp((Math.max(y0, y1) + P) / HC | 0, 0, HH - 1);
  let bu = null;
  for (let gy = gy0; gy <= gy1; gy++) {
    // Teil des Segments, dessen y in [Zeile − P, Zeile + HC + P] liegt
    let sA = 0, sB = 1;
    if (dy !== 0) {
      sA = (gy * HC - P - y0) / dy; sB = ((gy + 1) * HC + P - y0) / dy;
      if (sA > sB) { const q = sA; sA = sB; sB = q; }
      if (sA < 0) sA = 0; if (sB > 1) sB = 1; if (sA > sB) continue;
    }
    const xa = x0 + dx * sA, xb = x0 + dx * sB;
    const gx0 = clamp((Math.min(xa, xb) - P) / HC | 0, 0, HW - 1), gx1 = clamp((Math.max(xa, xb) + P) / HC | 0, 0, HW - 1);
    for (let gx = gx0; gx <= gx1; gx++) {
      const cell = hash[gy * HW + gx];
      for (let i = 0; i < cell.length; i++) {
        const v = cell[i];
        if (!v.alive || v === skip || (skipSet !== null && skipSet.has(v))) continue;
        const band = v.T.r + BODY_Z_PAD;
        if (v.z <= zlo - band || v.z >= zhi + band) continue;
        const rr = v.T.r + pad, cx = v.x - x0, cy = v.y - y0, c2 = cx * cx + cy * cy;
        const sc = L2 > 0 ? (cx * dx + cy * dy) / L2 : 0;
        let s;
        if (c2 <= rr * rr) s = 0;          // Start liegt im Körper
        else {
          if (L2 === 0 || sc < 0) continue;
          const h2 = c2 - sc * sc * L2; if (h2 > rr * rr) continue;
          s = sc - Math.sqrt((rr * rr - h2) / L2);
          if (s > 1) continue;
        }
        if (s >= best) continue;
        if (dz !== 0) { const sz = sc < s ? s : sc > 1 ? 1 : sc; if (Math.abs(v.z - (za + dz * sz)) >= band) continue; }
        best = s; bu = v;
      }
    }
  }
  if (bu) { RAY.unit = bu; RAY.cell = -1; RAY.t = best; } else if (best <= 1) RAY.t = best;
  return RAY;
}

// Öffentliche Variante in fester Höhe z: frisches Ergebnisobjekt, ignore als Set<Unit>.
export function raycast(world, x0, y0, x1, y1, z, ignore) {
  const r = cast(world, x0, y0, x1, y1, z, z, null, ignore || null, 0);
  return { unit: r.unit, cell: r.cell, t: r.t };
}

// Bahn eines geraden Schusses von u zum Zielpunkt (ax, ay), in GEO: Richtung, Abstand el, Fluglänge
// (Kugeln fliegen BULLET_OVERSHOOT weiter), Starthöhe z0 und Zielhöhe zt (am Zielpunkt erreicht).
// zt: Flieger-Ziel in dessen Höhe, sonst MUZZLE_Z. z0: Flieger-Schütze aus eigener Höhe, sonst zt.
const GEO = { nx: 1, ny: 0, el: 1, len: 1, z0: 0, zt: 0 };
function shotGeo(u, t, kind, ax, ay) {
  const ex = ax - u.x, ey = ay - u.y, el = Math.hypot(ex, ey) || 1;
  GEO.nx = ex / el; GEO.ny = ey / el; GEO.el = el;
  GEO.len = kind === 'bullet' ? el + BULLET_OVERSHOOT : el;
  GEO.zt = shotZ(t); GEO.z0 = u.T.fly ? u.z : GEO.zt;
  return GEO;
}
// Bahnhöhe nach s px (linear durch den Zielpunkt, nicht unter den Boden)
const zAlong = (z0, zt, el, s) => { const z = z0 + (zt - z0) * s / el; return z > 0 ? z : 0; };

// Ist der Weg u → (x1, y1) frei von eigenen Leuten? Erster Treffer aus der eigenen Fraktion → falsch.
function clearPath(world, u, x1, y1, z0, z1) {
  const r = cast(world, u.x, u.y, x1, y1, z0, z1, u, null, LOF_PAD);
  return !(r.unit && factionOf(world, r.unit) === factionOf(world, u));
}

// Falsch, wenn der erste Treffer auf dem Weg zur Zielmitte zur eigenen Fraktion gehört
// (Mauern und andere Gegner sind kein Hindernis). Dient der Zielwahl; vor dem Schuss prüft think
// die echte Bahn zum gezogenen Zielpunkt (aimLine).
export function hasLineOfFire(world, u, target) {
  const g = shotGeo(u, target, 'rocket', target.x, target.y);
  return clearPath(world, u, target.x, target.y, g.z0, g.zt);
}

// Zielpunkt eines Schusses: Vorhalt (Zielbewegung über die Flugzeit · 0.8) plus Streuung aus world.rng().
const AIM = { x: 0, y: 0 };
function aimPoint(world, u, t, kind) {
  const K = SHOT[kind], d = Math.hypot(t.x - u.x, t.y - u.y) || 1;
  const lead = K[0] + d / PROJECTILES[kind].speed, sp = K[2];
  AIM.x = t.x + t.mx * lead * .8 + rnd(world, -sp, sp);
  AIM.y = t.y + t.my * lead * .8 + rnd(world, -sp, sp);
  return AIM;
}

// Echte Schussbahn (ganze Fluglänge inkl. Überflug, mit Höhenverlauf) frei von eigenen Leuten?
function aimLine(world, u, t, kind, ax, ay) {
  const g = shotGeo(u, t, kind, ax, ay);
  return clearPath(world, u, u.x + g.nx * g.len, u.y + g.ny * g.len, g.z0, zAlong(g.z0, g.zt, g.el, g.len));
}

// Unter den 8 nächsten Gegnern (im Umkreis von 1.5 · Reichweite) der nächste mit freier Linie.
const NEAR_U = new Array(8).fill(null), NEAR_D = new Float64Array(8);
function clearTarget(world, u) {
  const f = factionOf(world, u), skip = u.tg; let n = 0;
  query(world, u.x, u.y, u.T.range * 1.5 + 40, v => {
    if (v === skip || factionOf(world, v) === f) return;
    const d = (v.x - u.x) ** 2 + (v.y - u.y) ** 2;
    if (n === 8 && d >= NEAR_D[7]) return;
    let k = n < 8 ? n++ : 7;
    while (k > 0 && NEAR_D[k - 1] > d) { NEAR_D[k] = NEAR_D[k - 1]; NEAR_U[k] = NEAR_U[k - 1]; k--; }
    NEAR_D[k] = d; NEAR_U[k] = v;
  });
  let found = null;
  for (let k = 0; k < n && !found; k++) if (hasLineOfFire(world, u, NEAR_U[k])) found = NEAR_U[k];
  NEAR_U.fill(null);   // keine Verweise auf Einheiten festhalten
  return found;
}

/* ---------- Waffen ---------- */
// ax/ay: Zielpunkt, den think schon gezogen und auf freie Bahn geprüft hat; fehlt er, wird er hier gezogen.
// Das Geschoss fliegt genau dorthin.
export function fire(world, u, t, kind, ax, ay) {
  const T = u.T, P = PROJECTILES[kind], K = SHOT[kind];
  if (ax === undefined) { aimPoint(world, u, t, kind); ax = AIM.x; ay = AIM.y; }
  const d = Math.hypot(t.x - u.x, t.y - u.y) || 1;
  // Mündung (Darstellung): vor dem Körper, etwas erhöht
  const mx = u.x + u.face * T.r * (T.r > 15 ? 1.3 : .9), my = u.y - T.r * (T.fly ? .6 : .3);
  u.fireT = 0;   // Rückstoß (rig.js)
  const f = factionOf(world, u), dmg = T.dmg, R = T.splash || 0;
  if (P.arc) {
    // Bogen: fester Weg Mündung → Zielpunkt, Höhe sin(q·π)·h; trifft nur am Zielpunkt
    world.proj.push({ kind, arc: true, x0: mx, y0: my, x1: ax, y1: ay, t: 0, dur: K[0] + d / P.speed, h: d * K[1],
      x: mx, y: my, z: 0, tz: t.T.fly ? t.z : 0, f, src: u, dmg, R });
  } else {
    // Gerade: fliegt vom Körper des Schützen (Boden-x/y) zum Zielpunkt und prüft jeden Schritt das Segment;
    // die Höhe läuft linear von z0 nach zt (am Zielpunkt). x0/y0/x1/y1 sind die Darstellungspunkte (um den
    // Mündungsversatz verschoben), dur = len / speed: der Renderer interpoliert die Position wie bisher.
    const g = shotGeo(u, t, kind, ax, ay), ox = mx - u.x, oy = my - u.y;
    world.proj.push({ kind, arc: false, x0: mx, y0: my, x1: u.x + g.nx * g.len + ox, y1: u.y + g.ny * g.len + oy,
      t: 0, dur: g.len / P.speed, h: 0, x: u.x, y: u.y, z: g.z0, z0: g.z0, zt: g.zt, el: g.el,
      sx: u.x, sy: u.y, nx: g.nx, ny: g.ny, len: g.len, sp: P.speed, f, src: u, dmg, R });
  }
  emit(world, { type: 'shot', kind, x: mx, y: my, face: u.face, tx: ax, ty: ay, shake: kind === 'shell' ? 2 : 0 });
  sound(world, K[3]);
}

// Drachenfeuer: Kegel vor dem Drachen
function breath(world, u, nx, ny) {
  const T = u.T, f = factionOf(world, u);
  u.fireT = 0;
  query(world, u.x, u.y, T.range + 30, v => {
    if (factionOf(world, v) === f) return;
    const dx = v.x - u.x, dy = v.y - u.y, d = Math.hypot(dx, dy);
    if (d > T.range + v.T.r) return;
    if ((dx * nx + dy * ny) / (d || 1) < .82) return;
    hurt(world, v, T.dmg, 'fire', u);
  });
  emit(world, { type: 'shot', kind: 'breath', x: u.x + nx * T.r, y: u.y - T.r * .6 + ny * T.r, face: u.face, nx, ny });
  sound(world, 'fire');
}

/* ---------- KI ---------- */
function groupInfo(world, u) {
  const R = u.type === 'wolf' ? 170 : u.type === 'biene' ? 60 : 70, f = factionOf(world, u);
  let cx = 0, cy = 0, n = 0;
  query(world, u.x, u.y, R, v => { if (v.type === u.type && factionOf(world, v) === f) { cx += v.x; cy += v.y; n++; } });
  u.gx = n ? cx / n : u.x; u.gy = n ? cy / n : u.y; u.gn = n; u.gt = .25 + world.rng() * .1;
}

function toward(u, px, py) { const x = px - u.x, y = py - u.y, l = Math.hypot(x, y) || 1; return [x / l, y / l]; }

export function think(world, u, dt) {
  const T = u.T;
  u.cd -= dt; u.rt -= dt; u.gt -= dt; if (u.st > 0) u.st -= dt; u.mx = 0; u.my = 0;
  // Animations-Timer für die Rigs (render/pose.js): seit dem Schuss, Rest von Schwung und Treffer
  if (u.fireT < 1) u.fireT += dt;
  u.swingT = u.swingT > dt ? u.swingT - dt : 0;
  u.hitT = u.hitT > dt ? u.hitT - dt : 0;
  // In der Luft oder betäubt: keine Entscheidung, keine Wunschbewegung (Timer laufen oben weiter)
  if (u.state !== 'ok') return;
  if (u.gt <= 0) groupInfo(world, u);
  u.wall = u.type === 'ritter' && u.gn >= 3;
  if (T.heal) { healer(world, u, dt); return; }
  if (u.rt <= 0 || !u.tg || !u.tg.alive || factionOf(world, u.tg) === factionOf(world, u)) {
    u.tg = nearestEnemy(world, u); u.rt = .35 + world.rng() * .3;
  }
  const t = u.tg;
  if (!t) return;
  const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
  u.face = dx < 0 ? -1 : 1; u.fx = nx; u.fy = ny;
  const reach = T.range + T.r + t.T.r;
  // Reiter reiten nach dem Sturmangriff durch die Reihen und wenden dann
  if (u.type === 'reiter' && u.st > 0) { u.mx = u.cvx; u.my = u.cvy; u.face = u.cvx < 0 ? -1 : 1; return; }
  // Mörser halten Mindestabstand
  if (u.type === 'moerser' && d < 90) { u.mx = -nx * T.speed; u.my = -ny * T.speed; return; }
  if (d <= reach) {
    // Gerade Schüsse: Zielpunkt (Vorhalt + Streuung) ziehen und die echte Bahn prüfen. Steht ein
    // Verbündeter darauf, nicht feuern, sondern seitlich ausweichen; sonst genau dorthin schießen.
    let ax, ay;
    if (STRAIGHT.has(u.type) && u.cd <= 0) {
      const kind = STRAIGHT_KIND[u.type];
      aimPoint(world, u, t, kind); ax = AIM.x; ay = AIM.y;
      if (!aimLine(world, u, t, kind, ax, ay)) { lineBlocked(world, u, nx, ny, dt); return; }
      u.blockedT = 0;
    }
    attack(world, u, t, d, dx, dy, ax, ay);
    if (KITE.has(u.type) && u.cd > .3 && d < T.range * .35 && t.T.range < 20 && !t.T.fly) { u.mx = -nx * T.speed * .5; u.my = -ny * T.speed * .5; }
    else if (u.type === 'drache' || u.type === 'heli') { const s = u.id % 2 ? 1 : -1; u.mx = -ny * s * T.speed * .5; u.my = nx * s * T.speed * .5; }
    return;
  }
  // Vor einer Mauer festgesteckt: draufhauen
  if (!T.fly && u.blk > .45 && world.terr[u.bcell] === 4) {
    if (u.cd <= 0) { u.cd = T.cd; u.swingT = .25; hitWall(world, u.bcell, (T.dmg || 8) * (T.splash ? 2.5 : 1.3), u.x, u.y); sound(world, 'hit'); }
    return;
  }
  let a = [nx, ny], sp = T.speed;
  switch (u.type) {
    case 'wolf':
      // Rudel: fächert sich um die Beute auf und greift von den Seiten und von hinten an
      if (u.gn >= 3 && d > 40) {
        const base = Math.atan2(u.gy - t.y, u.gx - t.x) + ((u.id % 5) - 2) * .55, R = Math.max(8, d * .45);
        a = toward(u, t.x + Math.cos(base) * R, t.y + Math.sin(base) * R);
      }
      break;
    case 'reiter':
      // Flankenritt: erst seitlich am Ziel vorbei, dann Sturmangriff
      if (d > 140) { const s = u.id % 2 ? 1 : -1, R = Math.min(130, d * .5); a = toward(u, t.x - ny * s * R, t.y + nx * s * R); }
      break;
    case 'biene': {
      // Schwarm: kreist ums Ziel, bleibt zusammen, schwirrt
      const s = u.id % 2 ? 1 : -1, o = d < 60 ? .45 : .3;
      const ax = nx - ny * s * o + (u.gx - u.x) * .01 + rnd(world, -.5, .5);
      const ay = ny + nx * s * o + (u.gy - u.y) * .01 + rnd(world, -.5, .5);
      const l = Math.hypot(ax, ay) || 1; a = [ax / l, ay / l]; break;
    }
    case 'krieger': case 'ritter': case 'geist': case 'baer':
      // Einkreisen: ist das Ziel schon umringt, sucht man sich einen freien Platz drumherum
      if (t.att > 3 && d < 130) {
        const g = Math.atan2(u.y - t.y, u.x - t.x) + ((u.id % 3) - 1) * .6, R = reach * .9;
        a = toward(u, t.x + Math.cos(g) * R, t.y + Math.sin(g) * R);
      }
      break;
  }
  // Reihe halten: wer vor der Gruppe läuft, wartet; wer hinterherhängt, schließt auf
  if (LINE.has(u.type) && u.gn >= 3 && d > reach + 20) { const depth = (u.x - u.gx) * nx + (u.y - u.gy) * ny; sp *= clamp(1 - depth / 45, .35, 1.3); }
  u.mx = a[0] * sp; u.my = a[1] * sp;
  u.run += dt;
}

// Verdeckter Schütze: weicht senkrecht zur Zielrichtung aus (Seite über id % 2, Tempo ×0.7) und zählt
// blockedT. Ab 2 s: neues Ziel mit freier Linie unter den 8 nächsten Gegnern; ohne Treffer hält er
// das Feuer weiter. blockedT beginnt in beiden Fällen neu. Läuft er dabei gegen eine Mauer oder den
// Kartenrand, wechselt er die Seite (u.lofFlip, an Mauern höchstens alle 0.5 s), damit er nie einfriert.
function lineBlocked(world, u, nx, ny, dt) {
  u.blockedT += dt;
  if (u.blockedT >= LOF_RETARGET) {
    u.blockedT = 0;
    const alt = clearTarget(world, u);
    if (alt) { u.tg = alt; u.rt = LOF_HOLD; }
  }
  const sp = u.T.speed * LOF_SIDE;
  const s = (u.id % 2 ? 1 : -1) * (u.lofFlip ? -1 : 1);
  let mx = -ny * s * sp, my = nx * s * sp;
  const { W, H } = world;
  const stuck = (u.blk > .3 && world.time - u.lofT > .5) ||
    (mx < 0 && u.x <= 7) || (mx > 0 && u.x >= W - 7) || (my < 0 && u.y <= 7) || (my > 0 && u.y >= H - 7);
  if (stuck) { u.lofFlip = !u.lofFlip; u.lofT = world.time; mx = -mx; my = -my; }
  u.mx = mx; u.my = my;
}

// ax/ay (optional): geprüfter Zielpunkt für gerade Schüsse (siehe think)
export function attack(world, u, t, d, dx, dy, ax, ay) {
  const T = u.T; if (u.cd > 0) return;
  u.cd = T.cd * (.85 + world.rng() * .3);
  switch (u.type) {
    case 'schuetze': fire(world, u, t, 'arrow'); break;
    case 'grenadier': fire(world, u, t, 'bomb'); break;
    case 'magier': case 'soldat': case 'mg': case 'sniper': case 'heli': case 'panzerfaust':
      fire(world, u, t, STRAIGHT_KIND[u.type], ax, ay); break;
    case 'panzer': fire(world, u, t, 'shell'); break;
    case 'moerser': fire(world, u, t, 'mortar'); break;
    case 'drache': breath(world, u, dx / d, dy / d); break;
    case 'baer': {
      // Prankenhieb trifft mehrere
      const f = factionOf(world, u);
      query(world, t.x, t.y, T.splash + 20, v => {
        if (factionOf(world, v) === f) return;
        const ex = v.x - t.x, ey = v.y - t.y;
        if (ex * ex + ey * ey > (T.splash + v.T.r) ** 2) return;
        knock(v, dx / d, dy / d, 140); hurt(world, v, T.dmg * (.85 + world.rng() * .3), 'melee', u);
      });
      u.swingT = .25;
      emit(world, { type: 'hit', x: t.x, y: t.y, flank: false, kind: 'melee', shake: 2 });
      sound(world, 'thud'); break;
    }
    default: {
      u.swingT = .25;
      let a = T.dmg * (.85 + world.rng() * .3);
      // Treffer von hinten
      const flank = t.fx !== undefined && ((u.x - t.x) * t.fx + (u.y - t.y) * t.fy) / d < -.3;
      if (flank) a *= 1.35;
      // Sturmangriff der Reiter, danach Durchritt
      if (u.type === 'reiter' && u.run > .7) {
        a *= 2.6; knock(t, dx / d, dy / d, 260);
        emit(world, { type: 'charge', x: t.x, y: t.y });
        u.st = .6; u.cvx = dx / d * T.speed; u.cvy = dy / d * T.speed;
      }
      // Rudelbonus
      if (u.type === 'wolf') {
        let n = 0; query(world, u.x, u.y, 70, v => { if (v.type === 'wolf' && v.team === u.team && ++n >= 3) return true; });
        if (n >= 3) a *= 1.4;
      }
      const dealt = hurt(world, t, a, 'melee', u);
      if (u.type === 'geist') u.hp = Math.min(T.hp, u.hp + dealt);
      emit(world, { type: 'hit', x: t.x, y: t.y, flank, kind: 'melee' });
      sound(world, u.type === 'krieger' || u.type === 'ritter' ? 'clink' : 'hit');
    }
  }
  u.run = 0;
}

function healer(world, u, dt) {
  const T = u.T, f = factionOf(world, u);
  if (u.rt <= 0 || !u.tg || !u.tg.alive || u.tg.hp >= u.tg.T.hp || factionOf(world, u.tg) !== f) {
    let best = null, bd = Infinity;
    query(world, u.x, u.y, 380, v => {
      if (v === u || factionOf(world, v) !== f || v.hp >= v.T.hp || v.T.heal) return;
      const d = (v.x - u.x) ** 2 + (v.y - u.y) ** 2; if (d < bd) { bd = d; best = v; }
    });
    if (!best) {
      query(world, u.x, u.y, 420, v => {
        if (v === u || factionOf(world, v) !== f || v.T.heal) return;
        const d = (v.x - u.x) ** 2 + (v.y - u.y) ** 2; if (d < bd) { bd = d; best = v; }
      });
      u.follow = true;
    } else u.follow = false;
    u.tg = best; u.rt = .4 + world.rng() * .2;
  }
  // Sanitäter halten sich aus dem Getümmel heraus
  let ex = 0, ey = 0;
  query(world, u.x, u.y, 110, v => {
    if (factionOf(world, v) === f) return;
    const qx = u.x - v.x, qy = u.y - v.y, q = Math.hypot(qx, qy) || 1; ex += qx / q; ey += qy / q;
  });
  if (ex || ey) { const l = Math.hypot(ex, ey); u.mx = ex / l * T.speed; u.my = ey / l * T.speed; u.face = ex < 0 ? -1 : 1; return; }
  const t = u.tg; if (!t) return;
  const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1; u.face = dx < 0 ? -1 : 1;
  const want = u.follow ? 55 : T.range * .6;
  if (d > want) { u.mx = dx / d * T.speed; u.my = dy / d * T.speed; }
  if (!u.follow && d <= T.range && u.cd <= 0) {
    u.cd = T.cd;
    query(world, t.x, t.y, 50, v => {
      if (factionOf(world, v) !== f || v.hp >= v.T.hp) return;
      v.hp = Math.min(v.T.hp, v.hp + T.heal);
      emit(world, { type: 'heal', x: v.x, y: v.y - v.T.r });
    });
  }
}

/* ---------- Geschosse ---------- */
// Bögen landen nach dur am Zielpunkt: Pfeil trifft den nächsten Körper (jede Fraktion außer dem
// Schützen) bis 8 px vom Landepunkt in Zielhöhe, Bomben/Mörser/Granaten explodieren.
// Gerade Schüsse bewegen sich je Schritt um speed·dt und treffen das Erste auf dem Segment:
// Kugeln enden dort (Mauer nimmt Schaden), Raketen und Feuerbälle explodieren dort.
// Ohne Treffer: Kugeln enden BULLET_OVERSHOOT px hinter dem Zielpunkt, Raketen/Feuer explodieren am Zielpunkt.
export function stepProjectiles(world, dt) {
  const proj = world.proj;
  for (let i = proj.length - 1; i >= 0; i--) {
    const p = proj[i]; p.t += dt;
    if (p.arc) {
      const q = p.t < p.dur ? p.t / p.dur : 1;
      p.x = p.x0 + (p.x1 - p.x0) * q; p.y = p.y0 + (p.y1 - p.y0) * q; p.z = Math.sin(q * Math.PI) * p.h;
      if (p.t < p.dur) continue;
      proj.splice(i, 1);
      landArc(world, p, p.src.alive ? p.src : null);
      continue;
    }
    const s1 = Math.min(p.len, p.t * p.sp), x1 = p.sx + p.nx * s1, y1 = p.sy + p.ny * s1;
    const z1 = zAlong(p.z0, p.zt, p.el, s1);
    const r = cast(world, p.x, p.y, x1, y1, p.z, z1, p.src, null, 0);
    if (r.unit || r.cell >= 0) {
      proj.splice(i, 1);
      const hx = p.x + (x1 - p.x) * r.t, hy = p.y + (y1 - p.y) * r.t;
      impact(world, p, r.unit, r.cell, hx, hy, p.src.alive ? p.src : null);
      continue;
    }
    p.x = x1; p.y = y1; p.z = z1;
    if (s1 >= p.len) { proj.splice(i, 1); impact(world, p, null, -1, x1, y1, p.src.alive ? p.src : null); }
  }
}

function landArc(world, p, src) {
  if (p.kind !== 'arrow') { blast(world, p.x1, p.y1, p.R, p.dmg, p.f, src, 'blast', 3); return; }
  let best = null, bd = Infinity;
  query(world, p.x1, p.y1, 26 + MAX_R, v => {
    if (v === p.src || Math.abs(v.z - p.tz) >= v.T.r + BODY_Z_PAD) return;
    const d = Math.hypot(v.x - p.x1, v.y - p.y1) - v.T.r; if (d < 8 && d < bd) { bd = d; best = v; }
  });
  if (best) {
    hurt(world, best, p.dmg * (.85 + world.rng() * .3), 'arrow', src);
    emit(world, { type: 'hit', x: best.x, y: best.y, flank: false, kind: 'arrow' });
    sound(world, 'hit');
  } else emit(world, { type: 'miss', kind: 'arrow', x: p.x1, y: p.y1, a: Math.atan2(p.y1 - p.y0, p.x1 - p.x0) });
}

// Gerader Schuss am Ende: v = getroffener Körper, cell = Mauerzelle (−1), (x, y) = Trefferpunkt am Boden
function impact(world, p, v, cell, x, y, src) {
  if (p.kind === 'bullet') {
    if (v) {
      hurt(world, v, p.dmg * (.85 + world.rng() * .3), 'bullet', src);
      emit(world, { type: 'hit', x: v.x, y: v.y, flank: false, kind: 'bullet' });
      sound(world, 'hit');
    } else {
      if (cell >= 0) hitWall(world, cell, p.dmg * BULLET_WALL, p.sx, p.sy);
      emit(world, { type: 'miss', kind: 'bullet', x, y, a: Math.atan2(p.ny, p.nx) });
    }
    return;
  }
  // Rakete/Feuerball: Volltreffer explodiert am Körper, sonst am Trefferpunkt
  const bx = v ? v.x : x, by = v ? v.y : y, kind = p.kind === 'fire' ? 'fire' : 'rocket';
  blast(world, bx, by, p.R, p.dmg, p.f, src, kind, p.kind === 'fire' ? 1.5 : 2);
}
