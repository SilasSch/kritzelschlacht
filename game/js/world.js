// Reine Welt: Einheiten, Gelände-Gitter, Spatial Hash, Zielsuche. Zufall nur über world.rng().
import { UNITS, CELL, HASH_CELL, RANGED, PATH_RECHECK } from './data.js';
import { createRng } from './rng.js';
import { isFleeing } from './morale.js';
import { ABILITY } from './abilities.js';

const HC = HASH_CELL;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function makeHash(world) {
  world.HW = Math.ceil(world.W / HC) + 1;
  world.HH = Math.ceil(world.H / HC) + 1;
  world.hash = Array.from({ length: world.HW * world.HH }, () => []);
}

export function createWorld(W, H, seed = 1) {
  const GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL);
  const world = {
    W, H, rng: createRng(seed), time: 0, teamMode: false,
    units: [], proj: [], corpses: [], debris: [], events: [],
    GW, GH, terr: new Uint8Array(GW * GH), towner: new Uint8Array(GW * GH), whp: new Float32Array(GW * GH),
    HW: 0, HH: 0, hash: [], facCount: new Map(), totalAlive: 0, nextId: 1,
    terrainVersion: 0,   // zählt jede Geländeänderung (pathing.js berechnet daraufhin neu)
    flow: null,          // Flussfelder der Wegfindung (pathing.js), legt sim.step an
    formations: [], formT: 0, formNext: 1,   // Römerblöcke (formation.js): Liste, Zeit bis zur Neubildung, nächste id
    cent: new Map(), centT: 0,   // Schwerpunkt je Fraktion ohne Fliehende (morale.updateCentroids) und Zeit bis zur Neuberechnung
    // Zauber (spells.js): Steinwände { i: Zelle, t: Restzeit s } und Meteor-Kanäle { id, x, y, t, sx, sy, f, n, m }
    tempWalls: [], casts: [], castNext: 1,
    // Von Anfang an da (später angehängte Felder ändern die Form der Welt, V8 verwirft dann optimierten Code)
    dead: 0, contested: false, lastWinT: -9,
  };
  makeHash(world);
  return world;
}

// Fraktion: im Teammodus das Team, sonst die Art u.kin (beim Spawn der Typ; Ghule tragen die ihres Vampirs, Spez. #32)
export const factionOf = (world, u) => (world.teamMode ? u.team : u.kin);

// Fledermausform (Spez. #32, abilities.stepBat): ganz verwandelt und noch in der Luft (u.T ist BAT_FORM, solange batT > 0
// und die Form nicht erst entsteht)
export const isBat = v => v.batT > 0 && !!v.T.fly;
// Nahkämpfer am Boden (Reichweite < 20, nicht fliegend; der Vampir zählt auch als Fledermaus dazu, er beißt nur am
// Boden) erreichen weder den Hubschrauber noch einen Vampir in Fledermausform. Bienen und Geister schon (Festlegung 6).
export const groundMelee = u => u.T.range < 20 && (!u.T.fly || u.type === 'vampir');
export const outOfMelee = (u, v) => (v.type === 'heli' || isBat(v)) && groundMelee(u);

export const cellIndex = (world, x, y) =>
  clamp((y / CELL) | 0, 0, world.GH - 1) * world.GW + clamp((x / CELL) | 0, 0, world.GW - 1);

// Missionsrahmen: Missionen (data.js), Testpläne (tools/plans.mjs) und die Mallinie (paint.ZONE) sind in
// Anteilen eines Rahmens der Breite min(W, MISSION_ASPECT · H) angelegt, waagrecht mittig; y bleibt Anteil
// von H. So wachsen die Wege auf breiten Laptop-Welten (Welt = Viewport / Grundzoom) nicht mit W mit,
// sondern bleiben wie bei 1400×875 (1280×800-Viewport) im selben Verhältnis zur Höhe. Liefert px.
export const MISSION_ASPECT = 1.6;
export function frameX(world, f) {
  const L = Math.min(world.W, MISSION_ASPECT * world.H);
  return (world.W - L) / 2 + f * L;
}

// Nach jeder Änderung an terr (Malen, Rückgängig, Mission, Szene): Wegfindung neu berechnen lassen.
export const touchTerrain = world => { world.terrainVersion = (world.terrainVersion | 0) + 1; };

export function setCell(world, i, terrainId, owner = 0) {
  touchTerrain(world);
  world.terr[i] = terrainId;
  world.towner[i] = owner;
  world.whp[i] = terrainId === 4 ? 140 : 0;
}

function hidx(world, x, y) {
  return clamp((y / HC) | 0, 0, world.HH - 1) * world.HW + clamp((x / HC) | 0, 0, world.HW - 1);
}

export function spawn(world, type, x, y, team) {
  const T = UNITS[type];
  const u = {
    id: world.nextId++, type, kin: type, T, team, x, y, z: T.flyZ || 0, vx: 0, vy: 0, vz: 0, mx: 0, my: 0,
    hp: T.hp, alive: true, state: 'ok', stunT: 0, peakZ: 0, face: team === 'rot' ? -1 : 1,
    aimX: 0, aimY: 0, tg: null, cd: world.rng() * T.cd, rt: world.rng() * 0.3, kills: 0,
    hitT: 0, fireT: 1, swingT: 0, seed: world.rng() * 10, gx: x, gy: y, gn: 1, gt: 0, att: 0, st: 0,
    cvx: 0, cvy: 0, run: 0, blk: 0, bcell: -1, wall: false, blockedT: 0, lofFlip: false, lofT: -9,
    // Brand (combat.ignite): Restdauer, Generation, Verursacher, Sprungtakt; lofWait: Drossel des Zielchecks (combat.lofCheck)
    burnT: 0, burnGen: 0, burnSrc: null, burnCk: 0, lofWait: 0,
    // Gift der Bienen (combat.poison, Nachtrag 4, #37): Restdauer (s), Verursacher; bei der Biene das Ziel ihres ersten Stichs
    poisonT: .5, poisonSrc: null, stingTg: null,
    // Gedämpfte Heilung (combat.HEAL_STACK): world.time der ersten Heilung im Fenster, Heilungen seitdem
    healAt: .5, healN: 0,
    // Bug-MG des Panzers (combat.hullMg): eigene Abklingzeit (s)
    mgCd: .5,
    meleeT: 0, meleeHit: false, fleeT: 0, fleeX: 0, fleeY: 0,   // Drosseln: Nahkämpfer-Check (combat.meleeNear), Flucht der Sanitäter
    stance: 'stand', stanceT: 0, proneCd: 0, aimOk: false, snipeT: 0,   // Liegen (combat.PRONE): Haltung, Restzeit, Sperre, letzter Zielcheck frei
    // Wegfindung (combat.think): Zeit bis zur nächsten Linienprüfung (nach id versetzt, nicht alle im selben
    // Schritt), Sperre der Linie zum Ziel (0 frei, pathing.PATH_BLOCK_WALL / PATH_BLOCK_LAVA)
    pathT: 0, pathBlk: 0,
    // Felder, die erst später gesetzt werden, schon hier anlegen (gleiche Form für alle Einheiten, Task 13):
    // px/py (physics.integrate; NaN = noch keine Lage vor dem Schritt), bounced/impact (Abheben), fx/fy
    // (Blickrichtung; 0/0 = noch keine: kein Flankenbonus), follow (Sanitäter). Zahlenfelder starten als Zahl
    // (nicht undefined), damit V8 sie als Double führt und Schreiben keine neuen HeapNumbers anlegt.
    px: NaN, py: NaN, bounced: false, impact: 0, fx: 0, fy: 0, follow: false,
    // Römer-Blockformation (formation.js, Spez. #25): Block-id (0 = keiner), im marschierenden Block, Platz
    // (px), Blickrichtung des Blocks, Blocktempo als Geschwindigkeit (formVx/formVy) und Betrag (formSp),
    // vom Platz freigegeben (Lava/Mauer, formFree), Speere übrig, Zeit seit der Freigabe des Speerwurfs (formVol,
    // s; < 0 noch nicht, formation.march). Für Nicht-Römer bleiben sie auf diesen Startwerten.
    form: 0, formOn: false, slotX: 0, slotY: 0, formAx: 0, formAy: 0, formVx: 0, formVy: 0, formSp: 0, formFree: false, pilum: 1,
    formVol: -1,
    // world.time des letzten Pfeil- oder Kugeltreffers im Block (combat.hurt, formation.FORM_CHASE); −9 = keiner
    rangedT: .5,
    // Rückzug (morale.js, Spez. #27): flieht, Zeit ohne Gegner in SAFE_R, Zeit mit Gegner in Nahkampfreichweite
    flee: false, safeT: 0, cornerT: 0,
    // Fähigkeiten (abilities.js, Spez. #30): Abklingzeit (s), läuft gerade, Zeit seit dem Start, Zähler (z. B.
    // abgefeuerte Raketen), Zielpunkt bzw. Richtung; Schreck: Restdauer (s, Festlegung 1, morale.isFleeing).
    // Abklingzeit beim Spawn ABILITY.cd · (0,3 + 0,7 · q), damit nicht alle zugleich auslösen; q nach id gestreut
    // (goldener Schnitt) statt aus world.rng(): bekommt ein Typ eine Fähigkeit, bleibt die Zufallsfolge der ganzen
    // Schlacht gleich (Task 2: sonst verschob jede neue Fähigkeit alle Saaten des Prüfstands).
    abCd: .5, abOn: false, abT: .5, abK: 0, abX: .5, abY: .5, fearT: .5,
    // Verstärkung (abilities.js, Heulen): Restdauer (s) und Faktoren auf Wunschtempo (physics.integrate) und
    // Nahkampfschaden (combat.attack); läuft buffT ab, gehen beide auf 1 zurück (combat.think).
    // fz: Flughöhe der Flieger (physics.integrate führt z mit höchstens FLY_VZ px/s dorthin; Sturzflug senkt sie).
    buffT: .5, spdMul: 1.5, dmgMul: 1.5, fz: .5,
    // Zauberbuch der Magier (spells.js, Spez. #31): Abklingzeiten von Windstoß, Steinwand und Meteor (s; laufen in
    // combat.think ab), Meteor-Kanal (world.casts-id, 0 = keiner). Für alle anderen bleiben sie 0.
    windCd: .5, wallCd: .5, meteorCd: .5, chanId: 0,
    // Vampir und Ghul (abilities.js, Spez. #32): Fledermausform 0..1 (0 Vampir, 1 ganz Fledermaus; dazwischen die
    // Verwandlung) und ihr Ziel (batOn: soll Fledermaus sein); Zahl der lebenden Ghule des Vampirs; beim Ghul sein Vampir
    // (owner) und die Restzeit des Aufstehens (riseT, s).
    batT: .5, batOn: false, ghouls: 0, owner: null, riseT: .5,
    // --- Task 6: Kreaturen (abilities.js, Spez. #34) --- Froschfluch: ursprünglicher Typ (null = kein Frosch) und Restzeit
    // (s); Phönix: schon wiedergeboren, Restzeit als Asche (s, dann unverwundbar und nicht anvisierbar); Troll: Restzeit ohne
    // Heilung nach einem Feuertreffer (s); Takt der Heilaura des Einhorns und der Feuerspur des Phönix (s bis zum nächsten).
    frogFrom: null, frogT: .5, reborn: false, ashT: .5, noHealT: .5, auraT: .5, trailT: .5,
  };
  // V8: als Double anlegen (Literal mit Nachkommastellen), dann auf den Startwert; sonst kippt die Feldart beim ersten
  // Bruchwert mitten in der Schlacht von Smi auf Double und alle Einheiten wandern auf eine neue Form (Ruckler)
  u.abCd = 0; u.abT = 0; u.abX = 0; u.abY = 0; u.fearT = 0; u.buffT = 0; u.spdMul = 1; u.dmgMul = 1; u.fz = T.flyZ || 0;
  u.windCd = 0; u.wallCd = 0; u.meteorCd = 0; u.batT = 0; u.riseT = 0; u.rangedT = -9; u.poisonT = 0; u.healAt = -9; u.mgCd = 0;
  // Task 6: Takte nach id versetzt (nicht alle Einhörner und Phönixe im selben Schritt), ohne world.rng
  u.frogT = 0; u.ashT = 0; u.noHealT = 0; u.auraT = (u.id % 5) * .1; u.trailT = (u.id % 4) * .06;
  const A = ABILITY[type];
  if (A) { const q = u.id * .6180339887; u.abCd = A.cd * (.3 + .7 * (q - Math.floor(q))); }
  u.pathT = (u.id % 8) * PATH_RECHECK / 8;
  world.units.push(u);   // fireT: 1 = letzter Schuss lange her (kein Rückstoß im Ruhezustand)
  if (world.hash.length) world.hash[hidx(world, x, y)].push(u);
  return u;
}

export function rebuildHash(world) {
  const { hash, units, facCount } = world;
  for (let i = 0; i < hash.length; i++) hash[i].length = 0;
  facCount.clear(); world.totalAlive = 0;
  for (const u of units) {
    if (!u.alive) continue;
    hash[hidx(world, u.x, u.y)].push(u);
    const f = factionOf(world, u);
    facCount.set(f, (facCount.get(f) || 0) + 1);
    world.totalAlive++;
  }
}

export function query(world, x, y, r, cb) {
  const { HW, HH, hash } = world;
  const gx0 = clamp((x - r) / HC | 0, 0, HW - 1), gx1 = clamp((x + r) / HC | 0, 0, HW - 1);
  const gy0 = clamp((y - r) / HC | 0, 0, HH - 1), gy1 = clamp((y + r) / HC | 0, 0, HH - 1);
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
    const cell = hash[gy * HW + gx];
    for (let i = 0; i < cell.length; i++) { const v = cell[i]; if (v.alive && cb(v) === true) return; }
  }
}

// Zielwahl: ein fliehender Gegner (morale.js) zählt FLEE_DIST-mal so weit weg; ist er der einzige, wird er trotzdem gejagt
export const FLEE_DIST = 2;
const FLEE_DIST2 = FLEE_DIST * FLEE_DIST;
export function nearestEnemy(world, u) {
  const { HW, HH, hash } = world;
  const f = factionOf(world, u);
  if (world.totalAlive - (world.facCount.get(f) || 0) <= 0) return null;
  const cx = clamp(u.x / HC | 0, 0, HW - 1), cy = clamp(u.y / HC | 0, 0, HH - 1), maxR = Math.max(HW, HH);
  const gm = groundMelee(u);   // erreicht keinen Hubschrauber und keine Fledermausform (outOfMelee)
  // Geister und Reiter jagen bevorzugt die hinteren Reihen; überall gilt: Ziele verteilen statt Schlange stehen
  const pref = u.type === 'geist' ? .45 : u.type === 'reiter' ? .7 : 1, sq = Math.sqrt(pref);
  let best = null, bd = Infinity;
  for (let r = 0; r <= maxR; r++) {
    if (best && (r - 1) * HC * sq > Math.sqrt(bd)) break;
    for (let gy = cy - r; gy <= cy + r; gy++) {
      if (gy < 0 || gy >= HH) continue;
      const edge = (gy === cy - r || gy === cy + r), stp = edge ? 1 : Math.max(1, 2 * r);
      for (let gx = cx - r; gx <= cx + r; gx += stp) {
        if (gx < 0 || gx >= HW) continue;
        const cell = hash[gy * HW + gx];
        for (let i = 0; i < cell.length; i++) {
          const v = cell[i];
          if (!v.alive || factionOf(world, v) === f || (gm && (v.type === 'heli' || isBat(v)))) continue;
          if (v.ashT > 0) continue;   // Task 6: Asche des Phönix ist nicht anvisierbar
          const dx = v.x - u.x, dy = v.y - u.y;
          let d = (dx * dx + dy * dy) * (1 + .12 * (v.tg === u ? 0 : (v.att || 0)));
          if (pref < 1 && (v.T.heal || RANGED.has(v.type))) d *= pref;
          if (isFleeing(v)) d *= FLEE_DIST2;   // Fliehende und Erschreckte zählen doppelt so weit (Spez. #27): erst die, die noch kämpfen
          if (d < bd) { bd = d; best = v; }
        }
      }
    }
  }
  return best;
}

export function resizeWorld(world, W, H) {
  const nGW = Math.ceil(W / CELL), nGH = Math.ceil(H / CELL);
  const t = new Uint8Array(nGW * nGH), o = new Uint8Array(nGW * nGH), h = new Float32Array(nGW * nGH);
  const mw = Math.min(nGW, world.GW), mh = Math.min(nGH, world.GH);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const a = y * world.GW + x, b = y * nGW + x;
    t[b] = world.terr[a]; o[b] = world.towner[a]; h[b] = world.whp[a];
  }
  // Steinwände (spells.js) auf die neuen Zellindizes; was außerhalb liegt, fällt weg
  let n = 0;
  for (const e of world.tempWalls) {
    const x = e.i % world.GW, y = (e.i / world.GW) | 0;
    if (x < mw && y < mh) { e.i = y * nGW + x; world.tempWalls[n++] = e; }
  }
  world.tempWalls.length = n;
  world.W = W; world.H = H; world.GW = nGW; world.GH = nGH; world.terr = t; world.towner = o; world.whp = h;
  touchTerrain(world);
  makeHash(world);
  for (const u of world.units) { u.x = clamp(u.x, 6, W - 6); u.y = clamp(u.y, 6, H - 6); }
  for (const c of world.corpses) { c.x = clamp(c.x, 6, W - 6); c.y = clamp(c.y, 6, H - 6); c.px = c.x; c.py = c.y; }
  for (const d of world.debris) { d.x = clamp(d.x, 6, W - 6); d.y = clamp(d.y, 6, H - 6); }
  rebuildHash(world);
}

// Leert alles, was zu einer Schlacht gehört (Wiederholen, Mission laden, Leeren, Zufallsschlacht).
// Gelände und Einstellungen bleiben.
export function clearBattle(world) {
  world.units = []; world.proj = []; world.corpses = []; world.debris = [];
  world.events.length = 0; world.dead = 0;
  world.formations = []; world.formT = 0;
  world.cent.clear(); world.centT = 0;
  // Steinwände gehören zur Schlacht (spells.js): ihre Zellen werden wieder frei, Meteor-Kanäle enden
  for (const e of world.tempWalls) if (world.terr[e.i] === 4 && world.towner[e.i] === 2) { world.terr[e.i] = 0; world.towner[e.i] = 0; world.whp[e.i] = 0; touchTerrain(world); }
  world.tempWalls = []; world.casts = [];
}
