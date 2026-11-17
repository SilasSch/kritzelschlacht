// Reiner Kampf: KI, Waffen, Geschosse, Schaden/Rüstung, Explosionen, Mauertreffer.
// Port aus kritzelschlacht.html. Kein DOM, Zufall nur über world.rng(). Effekte und Töne
// werden als Ereignisse in world.events geschrieben.
import { CELL, HASH_CELL, UNITS, PATH_RECHECK, UNDEAD } from './data.js';
import { factionOf, cellIndex, query, nearestEnemy, touchTerrain, outOfMelee, isBat } from './world.js';
import { flowDir, directBlocked, pathOpen, PATH_BASH_DETOUR, PATH_BASH_MIN, PATH_BLOCK_LAVA } from './pathing.js';
import { applyImpulse, makeCorpse, makeDebris, WALL_CLEAR_Z, LAUNCH_VZ, MAX_FLING } from './physics.js';
import { bossMuzzle, hasMuzzle, tankMgMuzzle } from './muzzle.js';
import { FORM, FORM_GAIN, FORM_CATCHUP, hazardAt, shieldBlocks, SHIELD_MUL } from './formation.js';
import { MORALE, PIN_HOLD, updateMorale, fleeSteer, isFleeing } from './morale.js';
import { stepAbility, cancelAbility, isFire, stepBat, stepGhoul, riseGhoul, releaseUnit, VAMPIRE, BAT_NONE, BAT_FLY } from './abilities.js';
import { castSpell, spellReact, FIREBALL } from './spells.js';
// --- Task 6: Kreaturen ---
import { TROLL, CYCLOPS, UNICORN, stepTroll, stepTrail, stepAura, stepAsh, stepFrog, stepFrogCurse, phoenixAsh } from './abilities.js';
// --- Task 5: Tiere ---
import { stepAnimal, animalPassive, eagleStep, CROC } from './abilities.js';
import { aloft, unseen } from './world.js';

// Typen, die in Reihe marschieren bzw. vor Nahkämpfern zurückweichen
export const LINE = new Set(['krieger', 'ritter', 'soldat']);
// Geduldige Scharfschützen (Spez. #28): mit Ziel in Reichweite rückt er nicht weiter vor (er hält, wo er schießen kann, also vor Reichweite; ein eigener HOLD-Wert wäre nie wirksam); ohne Ziel
// in Reichweite WAIT s warten, dann vorrücken, aber höchstens bis BEHIND px hinter die eigene Frontlinie
// (morale: world.cent front); Feind näher als KEEP · Reichweite: zurückweichen (stehend, nicht liegend).
export const SNIPER = { KEEP: .6, WAIT: 3, BEHIND: 40 };
// Hysterese: nach dem Zurückweichen legt sich der Scharfschütze erst ab LIE_MIN · Reichweite wieder hin (kein Auf und Ab)
// Nur im Liegen (Nachtrag 4, #36, ersetzt den Teil von #22, nach dem auch Stehende schießen): stehend schießt er nie, er
// bewegt sich. Mit Ziel in Reichweite weicht er stehend bis LIE_MIN · Reichweite zurück (auch vor Nahkämpfern) und legt
// sich dann hin; sonst (Linie verdeckt, Sperre proneCd) weicht er seitlich aus. Eingeklemmt (Kartenrand, Mauer: pinned)
// gelten KEEP und LIE_MIN nicht: dann liegt und schießt er auch auf nähere Ziele. In der Ecke (Rückzug) wehrt er sich nicht.
export const LIE_MIN = .75;
const PIN_EDGE = 16;
const pinned = (world, u) => u.blk > .3 || u.x < PIN_EDGE || u.y < PIN_EDGE || u.x > world.W - PIN_EDGE || u.y > world.H - PIN_EDGE;
// Fernkämpfer, die nach dem Schuss vor Nahkämpfern zurückweichen (think, Zweig nach dem Angriff). Der
// Scharfschütze fehlt: er weicht schon im Zweig davor (SNIPER.KEEP) zurück, ein KITE-Eintrag käme nie zum Zug.
export const KITE = new Set(['schuetze', 'soldat']);
// Schützen mit geraden Schüssen (Kugel, Rakete, Feuerball): prüfen vor dem Schuss die Schusslinie
export const STRAIGHT = new Set(['soldat', 'mg', 'sniper', 'panzerfaust', 'heli', 'magier']);
const STRAIGHT_KIND = { soldat: 'bullet', mg: 'bullet', sniper: 'bullet', heli: 'bullet', panzerfaust: 'rocket', magier: 'fire' };
// --- Task 6: Kreaturen --- Hexe: gerader Zauber 'hex' (Schusslinie prüfen wie die Schützen)
STRAIGHT.add('hexe'); STRAIGHT_KIND.hexe = 'hex';

// Liegen (Spez. #22): MG-Schützen und Scharfschützen legen sich hin, wenn ein Ziel in Reichweite ist und
// kein Nahkämpfer (Reichweite < 20) näher als PRONE_MELEE_R ist. Haltung u.stance: 'stand' → 'down'
// (PRONE_DOWN_T s) → 'prone' → 'up' (PRONE_UP_T s) → 'stand'; u.stanceT ist die Restzeit des Übergangs.
// Beim Hinlegen und Aufstehen weder Schuss noch Bewegung, liegend keine Bewegung. Liegend: Schaden durch
// Kugel, Pfeil, Rakete und Explosion ×PRONE_DMG, fremde gerade Schüsse treffen nur mit PRONE_DODGE,
// Streuung ×PRONE_SPREAD, Reichweite ×PRONE_RANGE. Verdeckte Schusslinie: liegend kein Ausweichen, nach
// PRONE_BLOCK_T s steht er auf und legt sich frühestens PRONE_BLOCK_T s nach dem Aufstehen wieder hin.
export const PRONE = new Set(['mg', 'sniper']);
export const PRONE_DOWN_T = .6, PRONE_UP_T = .8, PRONE_MELEE_R = 140, PRONE_BLOCK_T = 2;
export const PRONE_DMG = .5, PRONE_DODGE = .5, PRONE_SPREAD = .4, PRONE_RANGE = 1.15;
const PRONE_HALF = new Set(['bullet', 'arrow', 'rocket', 'blast']);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (world, a, b) => a + world.rng() * (b - a);
const emit = (world, e) => { world.events.push(e); };
const sound = (world, k) => { world.events.push({ type: 'sound', k }); };

// Bögen (arc) fliegen über Köpfe und treffen nur am Zielpunkt; gerade Schüsse treffen das Erste im Weg.
// pilum: Speer der Römer (Spez. #25), landet wie ein Pfeil, Schaden UNITS.roemer.pilum.
// firearrow: Brandpfeil des Schützen (abilities.js), fliegt und trifft wie ein Pfeil und zündet dann an.
export const PROJECTILES = {
  arrow: { arc: true, speed: 520 }, bomb: { arc: true, speed: 450 }, mortar: { arc: true, speed: 500 },
  shell: { arc: true, speed: 850 }, bullet: { arc: false, speed: 1100 }, rocket: { arc: false, speed: 520 },
  fire: { arc: false, speed: 330 }, pilum: { arc: true, speed: 430 }, firearrow: { arc: true, speed: 520 },
  // --- Task 6: Kreaturen --- boulder: Felsbrocken des Zyklopen (Bogen, landBoulder); hex: Zauber der Hexe (gerade, hexImpact)
  boulder: { arc: true, speed: 380 }, hex: { arc: false, speed: 420 },
};
// Bögen, die wie ein Pfeil den nächsten Körper am Landepunkt treffen (alle anderen Bögen explodieren)
export const ARROW_LIKE = new Set(['arrow', 'pilum', 'firearrow']);
// Je Art: [Grundflugzeit (nur Bögen), Bogenhöhe je Distanz, Streuung, Ton]
const SHOT = {
  arrow: [.25, .16, 8, 'twang'],
  firearrow: [.25, .16, 8, 'twang'],
  pilum: [.2, .2, 6, 'throw'],
  bomb: [.55, .35, 14, 'throw'],
  mortar: [.9, .55, 18, 'thump'],
  shell: [0, .08, 6, 'cannon'],
  fire: [0, 0, 14, 'fire'],
  bullet: [0, 0, 5, 'shot'],
  rocket: [0, 0, 6, 'whoosh'],
  // --- Task 6: Kreaturen ---
  boulder: [.6, .42, 16, 'throw'],
  hex: [0, 0, 6, 'whoosh'],
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
// Verdeckte Schusslinie: neuer Zielcheck (Zielpunkt + Bahn) erst nach LOF_RECHECK s (+ id % 4 · LOF_STAGGER,
// gestaffelt); dazwischen gilt die Linie weiter als verdeckt (Ausweichen bzw. Feuer halten laufen weiter). Task 13.
export const LOF_RECHECK = .1, LOF_STAGGER = .02;
// Weitere Drosseln (Task 13): Nahkämpfer-Check der MG-Schützen/Scharfschützen alle MELEE_RECHECK s (gestaffelt),
// Fluchtrichtung der Sanitäter alle FLEE_RECHECK s, Zielsuche ohne Gegner im Umkreis RETARGET_FAR px seltener
// (Abstand ×RETARGET_FAR_MUL).
export const MELEE_RECHECK = .1, FLEE_RECHECK = .1, RETARGET_FAR = 300, RETARGET_FAR_MUL = 2;
// Takt der Zielsuche (s, Grundwert + Zufall) und der Gruppenmitte (groupInfo), gestreckt in Task 13
export const RETARGET_T = [.45, .3], GROUP_T = [.35, .15], HEAL_RETARGET_T = [.5, .3];
// Nur diese Typen lesen die Gruppenmitte (Rudel, Schwarm, Schildwall, Reihe halten); alle anderen sparen sich groupInfo
export const GROUP_USERS = new Set(['wolf', 'biene', 'krieger', 'ritter', 'soldat']);
GROUP_USERS.add('bueffel');   // Task 5: Herde (abilities.HERD, Gruppe bis HERD.R = 60 px)
const MAX_R = Math.max(...Object.values(UNITS).map(T => T.r));
const HC = HASH_CELL, WALL = 4;
const PATH_RANGE_PAD = 20;   // px: so weit über den Punkt in Reichweite hinaus prüfen Fernkämpfer die Linie
const PATH_STUCK_T = 3;      // s Festsitzen an einer dünnen Mauer, nach denen trotz Weg eingeschlagen wird
export const shotZ = t => (t.T.fly ? t.z : MUZZLE_Z);

/* ---------- Schaden ---------- */
// dot: Schaden über Zeit (Brand), quetscht nie, auch mit Verursacher.
// Feuerarten (abilities.FIRE_KINDS: Feuerball, Drachenatem, Brand 'burn', Brandpfeile, Phönixspur) teilen sich das
// Merkmal Feuer (Festlegung 7): Panzer ×0,6, Geister voll, Vampire doppelt (auch der Brand und in Fledermausform, #32).
export function hurt(world, v, a, kind, src, dot = false) {
  if (!v.alive) return 0;
  if (v.ashT > 0) return 0;   // Task 6: Asche des Phönix ist unverwundbar
  let m = 1; const t = v.type;
  if (t === 'vampir' && isFire(kind)) m *= 2;
  if (t === 'ritter') {
    m *= kind === 'poison' ? 1 : kind === 'arrow' ? .35 : kind === 'melee' ? .7 : kind === 'bullet' ? .8 : 1.5;
    if (v.wall && (kind === 'arrow' || kind === 'melee')) m *= .65;
  }
  if (t === 'panzer') m *= kind === 'bullet' ? .25 : kind === 'arrow' ? .2 : kind === 'melee' ? .7 : kind === 'rocket' ? 1.6 : isFire(kind) ? .6 : .8;
  if (t === 'heli') m *= kind === 'rocket' ? 1.4 : kind === 'arrow' || kind === 'melee' ? .5 : 1;
  if (t === 'geist' && !isFire(kind)) m *= .5;
  if (t === 'troll' && isFire(kind)) v.noHealT = TROLL.NO_HEAL;   // Task 6: Feuer stoppt die Troll-Heilung (Festlegung 7)
  if (v.stance === 'prone' && PRONE_HALF.has(kind)) m *= PRONE_DMG;
  // Wald gibt Bodentruppen Deckung gegen Fernkampf und Explosionen
  if (!v.T.fly && world.terr[cellIndex(world, v.x, v.y)] === 3 &&
      (kind === 'arrow' || kind === 'blast' || kind === 'bullet' || kind === 'rocket')) m *= .5;
  // Treffer-Quetschen (rig.js) nur bei echten Treffern: Schaden über Zeit (Lava, Brand) würde hitT sonst
  // jeden Schritt erneuern; dafür zeigt der Renderer das burn-Ereignis bzw. die Flammen am Körper.
  const d = a * m; v.hp -= d;
  // Römer im Block unter Beschuss (auch abgeblockt, shieldHit): der Block verfolgt schneller (formation.FORM_CHASE)
  if (v.formOn && (kind === 'arrow' || kind === 'bullet')) v.rangedT = world.time;
  if (!dot && (src || !isFire(kind))) v.hitT = .15;
  // Eigene Leute (Friendly Fire) zählen nicht als Abschuss
  // Task 6: der erste Tod des Phönix macht ihn zu Asche (abilities.phoenixAsh), ohne Abschuss
  if (v.hp <= 0 && phoenixAsh(world, v)) return d;
  if (v.hp <= 0) { if (src && factionOf(world, src) !== factionOf(world, v)) src.kills++; die(world, v, src, kind); }
  return d;
}

// Teile, die beim Sterben als eigene Leichenteile wegfliegen (Rig-Teil headgear/weapon; beim Ritter ist
// die "Waffe" der Schild, beim Panzer der Turm, beim Hubschrauber die Kopfbedeckung der Rotor; der Römer
// verliert Helm, Scutum (eigenes Rig-Teil 'shield') und Kurzschwert)
export const PARTS = {
  krieger: ['headgear', 'weapon'], schuetze: ['headgear', 'weapon'], ritter: ['headgear', 'shield'],
  grenadier: ['headgear', 'weapon'], reiter: ['weapon'], roemer: ['headgear', 'shield', 'weapon'], sani: ['headgear'], wolf: [], baer: [], biene: [],
  magier: ['headgear', 'weapon'], geist: [], drache: [], soldat: ['headgear', 'weapon'], mg: ['headgear', 'weapon'],
  sniper: ['headgear', 'weapon'], panzerfaust: ['headgear', 'weapon'], moerser: ['headgear', 'weapon'],
  panzer: ['turret'], heli: ['headgear', 'weapon'], vampir: [], ghul: [],
  // --- Task 6: Kreaturen --- (Troll: Keule, Zyklop: Felsen in der Hand, Hexe: Hut)
  troll: ['weapon'], zyklop: ['weapon'], hexe: ['headgear'], phoenix: [], einhorn: [], frosch: [],
};
// --- Task 5: Tiere --- (keine wegfliegenden Teile)
Object.assign(PARTS, { elefant: [], krokodil: [], gorilla: [], adler: [], bueffel: [] });
const VROT_MIN = 4, VROT_MAX = 10;                 // rad/s, Drehung der Leiche
const PART_V = [60, 160], PART_VZ = [160, 280], PART_VROT = [6, 14];
const HOP_VZ = [140, 200], HOP_V = [60, 110];      // Cartoon-Hüpfer beim Sterben ohne Abheben
// Abgeschossene Flieger, die beim Aufschlag abstürzen (combat.crash); Bienen und Geister fallen nur
export const CRASH = new Set(['heli', 'drache']);
export const HELI_CRASH_R = 50, HELI_CRASH_DMG = 60;     // Explosion beim Aufschlag des Helis
export const DRAGON_CRASH_R = 70, DRAGON_CRASH_I = 900;  // Stoß beim Aufschlag des Drachen, ohne Schaden

// Leiche mit der Geschwindigkeit der Einheit (Fremd- plus Wunschbewegung), in der Luft getötete (auch von
// einer Explosion geschleuderte) fliegen weiter. Alle anderen (Kugel, Nahkampf, Pfeil, Lava, Feuer,
// Explosion unter der Abhebeschwelle) bekommen einen Hüpfer: vz 140–200 und 60–110 px/s vom Mörder weg
// (ohne Mörder in Zufallsrichtung). Flieger bekommen nur den waagrechten Teil und fallen aus ihrer Höhe;
// Heli und Drache tragen crash (Absturz beim Aufschlag, stepCorpses → crash). Die Abschussgutschrift
// geschieht hier beim Tod (hurt), der Absturz selbst schreibt niemandem etwas gut. Dazu die Teile laut
// PARTS mit Zufallsimpuls. Das Seelchen zeichnet der Renderer zum death-Ereignis.
// Vampir und Ghul (Spez. #32, abilities.js): ein Ghul meldet sich bei seinem Vampir ab; stirbt ein Vampir, zerfallen seine
// Ghule. Tötet der Biss eines Vampirs (kind 'melee'), steht das Opfer womöglich als Ghul auf (riseGhoul): dann keine
// Leiche und keine Teile, das death-Ereignis trägt ghoul (Verlust in der Statistik, kein Seelchen).
function die(world, v, src, kind) {
  v.alive = false; world.dead = (world.dead || 0) + 1;
  releaseUnit(world, v);
  if (kind === 'melee' && riseGhoul(world, v, src)) {
    emit(world, {
      type: 'death', x: v.x, y: v.y, z: v.z, unitType: v.type, team: v.team, ghoul: true,
      killerId: src.id, killerType: src.type, killerTeam: src.team, killerKills: src.kills,
    });
    sound(world, 'die');
    return;
  }
  const T = v.T, sgn = () => (world.rng() < .5 ? -1 : 1);
  let vx = v.vx + v.mx, vy = v.vy + v.my, vz = v.vz;
  const vrot = sgn() * rnd(world, VROT_MIN, VROT_MAX);
  if (v.state !== 'air') {
    if (!T.fly) vz = Math.max(0, vz) + rnd(world, HOP_VZ[0], HOP_VZ[1]);
    const sp = rnd(world, HOP_V[0], HOP_V[1]);
    let dx = src && src !== v ? v.x - src.x : 0, dy = src && src !== v ? v.y - src.y : 0;
    const l = Math.hypot(dx, dy);
    if (l > 1e-6) { dx /= l; dy /= l; } else { const a = world.rng() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); }
    vx += dx * sp; vy += dy * sp;
  }
  world.corpses.push(makeCorpse('body', null, v.type, v.team, v.face, v.x, v.y, v.z, vx, vy, vz, 0, vrot,
    CRASH.has(v.type) ? v.type : null));
  const parts = PARTS[v.type];
  for (let i = 0; i < parts.length; i++) {
    const a = world.rng() * Math.PI * 2, sp = rnd(world, PART_V[0], PART_V[1]);
    const vz = rnd(world, PART_VZ[0], PART_VZ[1]), pr = sgn() * rnd(world, PART_VROT[0], PART_VROT[1]);
    world.corpses.push(makeCorpse('part', parts[i], v.type, v.team, v.face, v.x, v.y, v.z + T.r,
      vx + Math.cos(a) * sp, vy + Math.sin(a) * sp, Math.max(0, v.vz) + vz, 0, pr));
  }
  emit(world, {
    type: 'death', x: v.x, y: v.y, z: v.z, unitType: v.type, team: v.team,
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
// Schaden, damit die Leiche einer getöteten Einheit mitfliegt. gen ≥ 0: wer überlebt, fängt Feuer (ignite mit
// dieser Generation, Verursacher src; Feuerball und Meteor, spells.js).
const BLAST_PUSH = 9, BLAST_LIFT = .6;
// Stoß I vom Punkt weg (dx, dy: Abstand, d: Länge), gedeckelt auf MAX_FLING · Masse; hebt nur ab LAUNCH_VZ ab.
// Auch für Fähigkeiten (Ramme, Sturzflug, abilities.js).
export function fling(v, dx, dy, d, I) {
  const m = v.T.mass || 1;
  if (I > MAX_FLING * m) I = MAX_FLING * m;
  const iz = BLAST_LIFT * I;
  applyImpulse(v, dx / (d || 1) * I, dy / (d || 1) * I, iz >= LAUNCH_VZ * m ? iz : 0);
}
export function blast(world, x, y, R, dmg, f, src, kind, wallMul, gen = -1) {
  query(world, x, y, R + 16, v => {
    const dx = v.x - x, dy = v.y - y, d = Math.hypot(dx, dy);
    if (d > R + v.T.r) return;
    const fall = 1 - .5 * Math.min(1, d / R);
    fling(v, dx, dy, d, dmg * BLAST_PUSH * fall);
    hurt(world, v, dmg * fall * (v === src ? .5 : 1), kind, src);
    if (gen >= 0 && v.alive) ignite(world, v, gen, src);
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

// Absturz eines abgeschossenen Fliegers beim ersten Bodenkontakt seiner Leiche (aus stepCorpses).
// Heli: Explosion (R 50, Schaden 60, Mauern ×2) ohne Fraktion und ohne Schützen: trifft alle, schreibt
// niemandem etwas gut. Drache: Stoß DRAGON_CRASH_I im Radius 70 vom Aufschlag weg (Deckel und
// Abhebeschwelle wie bei Explosionen), ohne Schaden.
export function crash(world, kind, x, y) {
  emit(world, { type: 'crash', kind, x, y });
  if (kind === 'heli') blast(world, x, y, HELI_CRASH_R, HELI_CRASH_DMG, null, null, 'blast', 2);
  else if (kind === 'drache') {
    query(world, x, y, DRAGON_CRASH_R + 16, v => {
      const dx = v.x - x, dy = v.y - y, d = Math.hypot(dx, dy);
      if (d <= DRAGON_CRASH_R + v.T.r) fling(v, dx, dy, d, DRAGON_CRASH_I);
    });
  }
}

// Ab hier zeigt die Mauer Risse (Darstellung im Renderer)
export const WALL_CRACK_HP = 70;

// Mauerbrocken: DEBRIS_N je zerbrochener Zelle, vom Zerstörer weg (Streuung ±DEBRIS_SPREAD rad; ohne
// Herkunft in Zufallsrichtungen), dazu nach oben. Bewegung in physics.stepDebris.
const DEBRIS_N = 3, DEBRIS_SPREAD = .7, DEBRIS_V = [60, 160], DEBRIS_VZ = [80, 220], DEBRIS_Z = [2, 8], DEBRIS_VROT = [4, 12];
function spawnDebris(world, x, y, fromX, fromY) {
  const dx = fromX == null ? 0 : x - fromX, dy = fromY == null ? 0 : y - fromY;
  const aimed = dx * dx + dy * dy > 1e-6, base = aimed ? Math.atan2(dy, dx) : 0;
  for (let k = 0; k < DEBRIS_N; k++) {
    const a = aimed ? base + rnd(world, -DEBRIS_SPREAD, DEBRIS_SPREAD) : world.rng() * Math.PI * 2;
    const sp = rnd(world, DEBRIS_V[0], DEBRIS_V[1]), vz = rnd(world, DEBRIS_VZ[0], DEBRIS_VZ[1]);
    const z = rnd(world, DEBRIS_Z[0], DEBRIS_Z[1]), rot = world.rng() * Math.PI * 2;
    const vrot = (world.rng() < .5 ? -1 : 1) * rnd(world, DEBRIS_VROT[0], DEBRIS_VROT[1]);
    world.debris.push(makeDebris(x, y, z, Math.cos(a) * sp, Math.sin(a) * sp, vz, rot, vrot));
  }
}

// fromX/fromY: Herkunft des Treffers (Flugrichtung der Trümmer).
// Liefert true, wenn sich das Aussehen geändert hat (Risse ab WALL_CRACK_HP oder zerbrochen);
// nur dann gibt es ein terrain-Ereignis. Zerbricht die Zelle, fliegen Brocken (world.debris).
export function hitWall(world, i, d, fromX, fromY, emitTerrain = true) {
  const { GW, GH } = world;
  const before = world.whp[i];
  world.whp[i] -= d;
  const gx = i % GW, gy = i / GW | 0;
  let broken = false;
  if (world.whp[i] <= 0) {
    world.terr[i] = 0; world.towner[i] = 0; broken = true; touchTerrain(world);
    if (before > 0) spawnDebris(world, gx * CELL + 5, gy * CELL + 5, fromX, fromY);
  }
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
// duckF: Fraktion des Schützen oder null; liegende Körper dieser Fraktion zählen nicht (sie ducken sich
// unter dem eigenen Feuer, Spez. #22).
// Ergebnis in RAY: unit (oder null), cell (Mauerzelle oder −1), t (Anteil am Segment, 1 ohne Treffer).
function cast(world, x0, y0, x1, y1, za, zb, skip, skipSet, pad, duckF = null) {
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
        if (v.ashT > 0) continue;   // Task 6: Asche des Phönix
        if (duckF !== null && v.stance === 'prone' && factionOf(world, v) === duckF) continue;
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
// Liegende eigene Leute blockieren nicht (der Schuss geht über sie hinweg).
function clearPath(world, u, x1, y1, z0, z1) {
  const f = factionOf(world, u);
  const r = cast(world, u.x, u.y, x1, y1, z0, z1, u, null, LOF_PAD, f);
  return !(r.unit && factionOf(world, r.unit) === f);
}

// Falsch, wenn der erste Treffer auf dem Weg zur Zielmitte zur eigenen Fraktion gehört
// (Mauern und andere Gegner sind kein Hindernis). Dient der Zielwahl; vor dem Schuss prüft think
// die echte Bahn zum gezogenen Zielpunkt (aimLine).
export function hasLineOfFire(world, u, target) {
  const g = shotGeo(u, target, 'rocket', target.x, target.y);
  return clearPath(world, u, target.x, target.y, g.z0, g.zt);
}

// Zielpunkt eines Schusses: Vorhalt (Zielbewegung über die Flugzeit · 0.8) plus Streuung aus world.rng()
// (liegend ×PRONE_SPREAD).
const AIM = { x: 0, y: 0 };
function aimPoint(world, u, t, kind) {
  const K = SHOT[kind], d = Math.hypot(t.x - u.x, t.y - u.y) || 1;
  const lead = K[0] + d / PROJECTILES[kind].speed, sp = K[2] * (u.stance === 'prone' ? PRONE_SPREAD : 1);
  AIM.x = t.x + t.mx * lead * .8 + rnd(world, -sp, sp);
  AIM.y = t.y + t.my * lead * .8 + rnd(world, -sp, sp);
  return AIM;
}

// Echte Schussbahn (ganze Fluglänge inkl. Überflug, mit Höhenverlauf) frei von eigenen Leuten?
function aimLine(world, u, t, kind, ax, ay) {
  const g = shotGeo(u, t, kind, ax, ay);
  return clearPath(world, u, u.x + g.nx * g.len, u.y + g.ny * g.len, g.z0, zAlong(g.z0, g.zt, g.el, g.len));
}

// Zielcheck vor einem geraden Schuss mit Drossel: zieht den Zielpunkt (AIM) und prüft die echte Bahn; ist sie
// verdeckt, wartet die Einheit LOF_RECHECK (gestaffelt) bis zum nächsten Check und gilt so lange als verdeckt
// (u.lofWait, läuft in think ab). Liefert true bei freier Bahn (Zielpunkt in AIM).
function lofCheck(world, u, t, kind) {
  if (u.lofWait > 0) return false;
  aimPoint(world, u, t, kind);
  if (aimLine(world, u, t, kind, AIM.x, AIM.y)) return true;
  u.lofWait = LOF_RECHECK + (u.id % 4) * LOF_STAGGER;
  return false;
}

// Zielcheck ohne Drossel (Fähigkeiten, abilities.js): zieht den Zielpunkt eines geraden Schusses der Art kind und
// prüft die echte Bahn. Liefert den Zielpunkt (wiederverwendetes Objekt, gleich verbrauchen) oder null, wenn ein
// Verbündeter zuerst im Weg steht.
export function clearShot(world, u, t, kind) {
  aimPoint(world, u, t, kind);
  return aimLine(world, u, t, kind, AIM.x, AIM.y) ? AIM : null;
}

// Unter den 8 nächsten Gegnern (im Umkreis von 1.5 · Reichweite) der nächste mit freier Linie.
const NEAR_U = new Array(8).fill(null), NEAR_D = new Float64Array(8);
function clearTarget(world, u) {
  const f = factionOf(world, u), skip = u.tg; let n = 0;
  query(world, u.x, u.y, u.T.range * 1.5 + 40, v => {
    if (v === skip || factionOf(world, v) === f || (v.hidden && unseen(u, v))) return;   // Task 5: Krokodil
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
// Das Geschoss fliegt genau dorthin. dmg/R (optional, Fähigkeiten): Schaden und Splash statt der Werte der Einheit.
// mz (optional): Mündungsversatz zu (u.x, u.y − u.z) statt der Hauptwaffe (Bug-MG des Panzers); dann kein Rückstoß
// der Hauptwaffe (u.fireT bleibt).
export function fire(world, u, t, kind, ax, ay, dmgO, RO, mz) {
  const T = u.T, P = PROJECTILES[kind], K = SHOT[kind];
  if (ax === undefined) { aimPoint(world, u, t, kind); ax = AIM.x; ay = AIM.y; }
  const d = Math.hypot(t.x - u.x, t.y - u.y) || 1;
  // Mündung (Darstellung): vor dem Körper, etwas erhöht. Boss-Sticker (Panzer, Heli) schießen aus der
  // gezeichneten Mündung (muzzle.js, Bildschirmpunkt; gerade Schüsse unten um die Starthöhe verschoben)
  const boss = hasMuzzle(u.type);
  let mx = u.x + u.face * T.r * (T.r > 15 ? 1.3 : .9), my = u.y - T.r * (T.fly ? .6 : .3);
  if (mz) { mx = u.x + mz.x; my = u.y - (u.z || 0) + mz.y; }
  else if (boss) { bossMuzzle(u, t.x, t.y, MZ); mx = u.x + MZ.x; my = u.y - (u.z || 0) + MZ.y; }
  if (!mz) u.fireT = 0;   // Rückstoß (rig.js)
  const f = factionOf(world, u);
  const dmg = dmgO !== undefined ? dmgO : kind === 'pilum' ? T.pilum : T.dmg, R = RO !== undefined ? RO : T.splash || 0;
  if (P.arc) {
    // Bogen: fester Weg Mündung → Zielpunkt, Höhe sin(q·π)·h; trifft nur am Zielpunkt
    world.proj.push({ kind, arc: true, x0: mx, y0: my, x1: ax, y1: ay, t: 0, dur: K[0] + d / P.speed, h: d * K[1],
      x: mx, y: my, z: 0, tz: t.T.fly ? t.z : 0, f, src: u, dmg, R });
  } else {
    // Gerade: fliegt vom Körper des Schützen (Boden-x/y) zum Zielpunkt und prüft jeden Schritt das Segment;
    // die Höhe läuft linear von z0 nach zt (am Zielpunkt). x0/y0/x1/y1 sind die Darstellungspunkte (um den
    // Mündungsversatz verschoben), dur = len / speed: der Renderer interpoliert die Position wie bisher.
    // tg: gezieltes Ziel; pass: liegende Körper, an denen der Schuss schon vorbeiging (stepProjectiles).
    const g = shotGeo(u, t, kind, ax, ay);
    if (boss || mz) my += g.z0 - MUZZLE_Z;   // pose.projScreen hebt um z0 − MUZZLE_Z an
    const ox = mx - u.x, oy = my - u.y;
    world.proj.push({ kind, arc: false, x0: mx, y0: my, x1: u.x + g.nx * g.len + ox, y1: u.y + g.ny * g.len + oy,
      t: 0, dur: g.len / P.speed, h: 0, x: u.x, y: u.y, z: g.z0, z0: g.z0, zt: g.zt, el: g.el,
      sx: u.x, sy: u.y, nx: g.nx, ny: g.ny, len: g.len, sp: P.speed, f, src: u, dmg, R, tg: t, pass: null });
  }
  emit(world, { type: 'shot', kind, x: mx, y: my, z: u.z, face: u.face, tx: ax, ty: ay, shake: kind === 'shell' ? 2 : 0 });
  sound(world, K[3]);
}

/* ---------- Bug-MG des Panzers (Nachtrag 4, #39) ---------- */
// Lädt die Kanone (u.cd > 0), feuert das MG Kugeln (Schaden DMG alle CD s, eigene Abklingzeit u.mgCd) auf die nächste
// feindliche Infanterie (Bodentruppen außer Panzern) bis RANGE px. Wie jeder gerade Schuss: Zielpunkt mit Vorhalt und
// Streuung, Schusslinie frei von eigenen Leuten (clearShot), die Kugel trifft das Erste im Weg (auch Eigene). Ohne Ziel
// oder mit verdeckter Linie neuer Versuch nach RETRY s. Startpunkt: Mündung TANK_GEO.mg (muzzle.tankMgMuzzle).
export const TANK_MG = { DMG: 3, CD: .15, RANGE: 200, RETRY: .25 };
const infantry = v => !v.T.fly && v.type !== 'panzer';
// Integration Task 5/6: kein Ziel ist das versteckte Krokodil (world.unseen) und die Asche des Phönix
const mgSeen = (u, v) => !(v.ashT > 0) && !(v.hidden && unseen(u, v));
const MGZ = { x: 0, y: 0 };
function mgTarget(world, u) {
  const t = u.tg, R = TANK_MG.RANGE + u.T.r, f = factionOf(world, u);
  if (t && t.alive && infantry(t) && mgSeen(u, t) && factionOf(world, t) !== f && (t.x - u.x) ** 2 + (t.y - u.y) ** 2 <= (R + t.T.r) ** 2) return t;
  const { HW, HH, hash } = world, ux = u.x, uy = u.y;
  const gx0 = clamp((ux - R - MAX_R) / HC | 0, 0, HW - 1), gx1 = clamp((ux + R + MAX_R) / HC | 0, 0, HW - 1);
  const gy0 = clamp((uy - R - MAX_R) / HC | 0, 0, HH - 1), gy1 = clamp((uy + R + MAX_R) / HC | 0, 0, HH - 1);
  let best = null, bd = Infinity;
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
    const cell = hash[gy * HW + gx];
    for (let i = 0; i < cell.length; i++) {
      const v = cell[i];
      if (!v.alive || !infantry(v) || !mgSeen(u, v)) continue;
      const d2 = (v.x - ux) ** 2 + (v.y - uy) ** 2, rr = R + v.T.r;
      if (d2 <= rr * rr && d2 < bd && factionOf(world, v) !== f) { bd = d2; best = v; }
    }
  }
  return best;
}
export function hullMg(world, u, dt) {
  if (u.mgCd > 0) { u.mgCd -= dt; return; }
  if (!(u.cd > 0)) return;   // die Kanone ist bereit: sie schießt, nicht das MG
  const t = mgTarget(world, u), a = t ? clearShot(world, u, t, 'bullet') : null;
  if (!a) { u.mgCd = TANK_MG.RETRY; return; }
  fire(world, u, t, 'bullet', a.x, a.y, TANK_MG.DMG, 0, tankMgMuzzle(u, MGZ));
  u.mgCd = TANK_MG.CD * (.9 + world.rng() * .2);
}

// Drachenfeuer: Kegel vor dem Drachen; Getroffene fangen Feuer (Generation 0, Verursacher der Drache).
// t: das Ziel, sein Punkt (tx, ty, tz) geht für den Flammenstrahl ins shot-Ereignis. Der Strahl beginnt am
// gezeichneten Maul (muzzle.js): x, y − z des Ereignisses = Bildschirmpunkt des Mauls.
const MZ = {};
function breath(world, u, nx, ny, t) {
  const T = u.T, f = factionOf(world, u);
  u.fireT = 0;
  query(world, u.x, u.y, T.range + 30, v => {
    if (factionOf(world, v) === f) return;
    const dx = v.x - u.x, dy = v.y - u.y, d = Math.hypot(dx, dy);
    if (d > T.range + v.T.r) return;
    if ((dx * nx + dy * ny) / (d || 1) < .82) return;
    hurt(world, v, T.dmg, 'fire', u);
    if (v.alive) ignite(world, v, 0, u);
  });
  bossMuzzle(u, u.x + nx, u.y + ny, MZ);
  emit(world, { type: 'shot', kind: 'breath', x: u.x + MZ.x, y: u.y + MZ.y, z: u.z, face: u.face, nx, ny,
    tx: t ? t.x : u.x + nx * T.range * .8, ty: t ? t.y : u.y + ny * T.range * .8, tz: t ? t.z : 0 });
  sound(world, 'fire');
}

/* ---------- Brand (Spez. #21) ---------- */
// Getroffene brennen BURN_T s nach und nehmen BURN_DPS Schaden/s ('burn', Feuer, Schaden über Zeit) vom
// Verursacher burnSrc, solange er lebt (sonst ohne). Alle SPREAD_DT s (je Einheit nach id gestaffelt)
// darf eine brennende Einheit jede Nachbar-Einheit im Radius r + v.r + SPREAD_PAD mit Chance
// SPREAD_P · 0.5^burnGen anzünden (jede Fraktion; Flieger nur Flieger, Boden nur Boden), Generation +1,
// höchstens BURN_MAX_GEN. So fängt ein dichter Schwarm gut Feuer, eine verteilte Armee kaum.
// Wasser löscht Bodentruppen sofort (Flieger darüber brennen weiter). Drachen sind feuerfest.
export const BURN_T = 3, BURN_DPS = 8, BURN_MAX_GEN = 3;
export const SPREAD_DT = .25, SPREAD_P = .35, SPREAD_PAD = 6;
const WATER = 1, BURN_Z = 4;   // Bodentruppen unter dieser Höhe stehen im Wasser
const wet = (world, u) => !u.T.fly && u.z < BURN_Z && world.terr[cellIndex(world, u.x, u.y)] === WATER;

// Zündet u mit Generation gen an (Verursacher src), wenn gen ≤ BURN_MAX_GEN und u nicht schon mit einer
// niedrigeren Generation brennt; gleiche oder höhere Generation frischt auf bzw. ersetzt. Liefert true,
// wenn gesetzt. ignite-Ereignis nur beim Anzünden (nicht beim Auffrischen).
export function ignite(world, u, gen, src) {
  if (gen > BURN_MAX_GEN || !u.alive || u.type === 'drache') return false;
  if (u.type === 'phoenix' || u.ashT > 0) return false;   // Task 6: Feuervogel (und seine Asche) brennt nicht
  const burning = u.burnT > 0;
  if (burning && u.burnGen < gen) return false;
  if (wet(world, u)) return false;
  u.burnT = BURN_T; u.burnGen = gen; u.burnSrc = src || null;
  if (!burning) {
    // erste Prüfung nach (1..16)/16 · SPREAD_DT, nach id gestaffelt: nicht alle im selben Schritt
    u.burnCk = SPREAD_DT * ((u.id * 7) % 16 + 1) / 16;
    emit(world, { type: 'ignite', x: u.x, y: u.y, z: u.z });
  }
  return true;
}

function extinguish(u) { u.burnT = 0; u.burnGen = 0; u.burnSrc = null; u.burnCk = 0; }

// Nachbarn anzünden: wiederverwendeter Rückruf über Modulvariablen, keine Allokation je Schritt
let SP_W = null, SP_U = null, SP_P = 0;
function spreadTo(v) {
  const u = SP_U;
  if (v === u || !!v.T.fly !== !!u.T.fly) return;
  const R = u.T.r + v.T.r + SPREAD_PAD, dx = v.x - u.x, dy = v.y - u.y;
  if (dx * dx + dy * dy > R * R) return;
  if (v.burnT > 0 && v.burnGen <= u.burnGen + 1) return;   // brennt schon mindestens so früh: kein Wurf
  if (SP_W.rng() < SP_P) ignite(SP_W, v, u.burnGen + 1, u.burnSrc);
}

// Ein Schritt Brand für u (aus think, auch in der Luft oder betäubt). Kann u töten.
export function stepBurn(world, u, dt) {
  if (wet(world, u)) { extinguish(u); emit(world, { type: 'extinguish', x: u.x, y: u.y }); return; }
  const src = u.burnSrc && u.burnSrc.alive ? u.burnSrc : null;
  const a = dt < u.burnT ? dt : u.burnT;
  u.burnT -= a;
  hurt(world, u, BURN_DPS * a, 'burn', src, true);
  if (!u.alive) return;
  u.burnCk -= dt;
  if (u.burnCk <= 0 && u.burnGen < BURN_MAX_GEN && u.burnT > 0) {
    SP_W = world; SP_U = u; SP_P = SPREAD_P * Math.pow(.5, u.burnGen);
    query(world, u.x, u.y, u.T.r + MAX_R + SPREAD_PAD, spreadTo);
    SP_W = null; SP_U = null;
  }
  while (u.burnCk <= 0) u.burnCk += SPREAD_DT;
  if (u.burnT <= 0) extinguish(u);
}

/* ---------- Gift (Nachtrag 4, #37) ---------- */
// Der erste Stich einer Biene auf ein Ziel (u.stingTg) vergiftet es: POISON.T s lang POISON.DPS Schaden/s, Schadensart
// 'poison' (kein Feuer: Panzer, Vampir und Brand bleiben unberührt; Rüstung, Deckung und Liegen schützen nicht).
// Neues Gift frischt die Dauer auf, stapelt aber nicht (ein Wert je Ziel). Maschinen (Panzer, Hubschrauber) und Untote
// (Ghule, data.UNDEAD) vergiftet es nicht.
export const POISON = { DPS: 4, T: 3 };
const NO_POISON = new Set(['panzer', 'heli']);
export function poison(world, v, src) {
  if (!v.alive || NO_POISON.has(v.type) || UNDEAD.has(v.type)) return;
  if (!(v.poisonT > 0)) emit(world, { type: 'poison', x: v.x, y: v.y, z: v.z });
  v.poisonT = POISON.T; v.poisonSrc = src || null;
}
function stepPoison(world, u, dt) {
  const a = dt < u.poisonT ? dt : u.poisonT;
  u.poisonT -= a;
  const src = u.poisonSrc && u.poisonSrc.alive ? u.poisonSrc : null;
  if (u.poisonT <= 0) { u.poisonT = 0; u.poisonSrc = null; }
  hurt(world, u, POISON.DPS * a, 'poison', src, true);
}

/* ---------- KI ---------- */
// Rückruf über Modulvariablen (keine Closure je Aufruf; Task 13: weniger Müll, weniger GC-Spitzen)
let GI_W = null, GI_T = '', GI_F = null, GI_X = 0, GI_Y = 0, GI_N = 0;
function groupTest(v) { if (v.type === GI_T && factionOf(GI_W, v) === GI_F) { GI_X += v.x; GI_Y += v.y; GI_N++; } }
function groupInfo(world, u) {
  const R = u.type === 'wolf' ? 170 : u.type === 'biene' || u.type === 'bueffel' ? 60 : 70;
  GI_W = world; GI_T = u.type; GI_F = factionOf(world, u); GI_X = 0; GI_Y = 0; GI_N = 0;
  query(world, u.x, u.y, R, groupTest);
  const n = GI_N;
  u.gx = n ? GI_X / n : u.x; u.gy = n ? GI_Y / n : u.y; u.gn = n; u.gt = GROUP_T[0] + world.rng() * GROUP_T[1];
  GI_W = null; GI_F = null;
}

// Römer im Block: Blocktempo plus Abweichung vom Platz · FORM_GAIN, höchstens Blocktempo · FORM_CATCHUP (zum
// Aufholen). Blickrichtung ist die des Blocks. Vom Platz freigegeben (formFree: Platz oder Weg auf Lava/Mauer,
// formation.js): wie eine einzelne Bodeneinheit dem Flussfeld der Fraktion nach. Das Feld führt dicht an der
// Lava entlang, und im Gedränge schieben die Nachbarn: darum zusätzlich weg von Lava/Mauer, die in FREE_AVOID px
// (8 Richtungen) liegt. Ohne Weg nur diese Abstoßung (wer auf Lava steht, kommt so herunter).
const FREE_AVOID = 14;
const D8X = [1, -1, 0, 0, .7071, .7071, -.7071, -.7071], D8Y = [0, 0, 1, -1, .7071, -.7071, .7071, -.7071];
function holdSlot(world, u, dt) {
  u.tg = null;
  if (u.formFree) {
    const fd = world.flow ? flowDir(world.flow, factionOf(world, u), u.x, u.y) : null, sp = u.T.speed;
    let dx = 0, dy = 0, rx = 0, ry = 0;
    if (fd && fd.dist > 0) { dx = fd.dx; dy = fd.dy; }
    for (let k = 0; k < 8; k++) if (hazardAt(world, u.x + D8X[k] * FREE_AVOID, u.y + D8Y[k] * FREE_AVOID)) { rx -= D8X[k]; ry -= D8Y[k]; }
    const rl = Math.hypot(rx, ry);
    if (rl > 1e-6) { dx += rx / rl; dy += ry / rl; }
    const l = Math.hypot(dx, dy);
    if (l > 1e-6) { u.mx = dx / l * sp; u.my = dy / l * sp; if (dx < -.2 * l) u.face = -1; else if (dx > .2 * l) u.face = 1; u.run += dt; }
    else { u.mx = 0; u.my = 0; }
    u.fx = u.formAx; u.fy = u.formAy;
    return;
  }
  let vx = u.formVx + (u.slotX - u.x) * FORM_GAIN, vy = u.formVy + (u.slotY - u.y) * FORM_GAIN;
  const cap = u.formSp * FORM_CATCHUP, l = Math.hypot(vx, vy);
  if (l > cap) { vx *= cap / l; vy *= cap / l; }
  u.mx = vx; u.my = vy; u.fx = u.formAx; u.fy = u.formAy;
  if (u.formAx < -.2) u.face = -1; else if (u.formAx > .2) u.face = 1;
  u.run += dt;
}

// Speerwurf (Spez. #25): ein Römer im Block (formOn, nicht formFree), dessen Reihe schon werfen darf (formVol ≥ 0,
// formation.march), wirft seinen einen Speer, sobald sein nächster Gegner PILUM_MIN bis PILUM_MAX px entfernt ist.
// Ist er schon näher, wirft er nicht. Das Ziel wird nicht gemerkt (u.tg bleibt im Marsch leer).
// Gesucht wird nur in den Hash-Zellen um u bis PILUM_MAX (eigene Schleife ohne Rückruf, wie meleeScan), nicht mit
// der unbegrenzten Ringsuche nearestEnemy: volT läuft weiter, auch wenn der Gegner, der die Uhr gestartet hat, fällt
// oder abzieht, und dann sucht jeder Römer mit Speer jeden Schritt. Hubschrauber nicht (wie nearestEnemy für
// Nahkämpfer). PILUM_SCAN zählt Suchen und besuchte Zellen (Tests, Messungen).
// Gedrosselt (finale Prüfung; sonst bis zu 81 Zellen je Römer mit Speer in jedem Schritt): die erste Suche im
// Schritt, in dem die Reihe werfen darf (die Reihe wirft zugleich), danach alle PILUM_SCAN_T s (+ id % 4 · PILUM_STAGGER,
// gestaffelt wie morale.FLEE_SCAN). Takt über u.rt: im Block braucht der Römer es nicht (holdSlot hält u.tg leer,
// nach dem Auflösen sucht think wegen u.tg = null sofort ein Ziel).
// Verteilte Ziele (Nachtrag 4, #35): ist der nächste Gegner mindestens PILUM_MIN entfernt, wählt der Römer unter den
// Gegnern in [PILUM_MIN, PILUM_MAX] den mit dem kleinsten Abstand² · (1 + PILUM_CLAIM · k), k = Speere seiner Fraktion,
// die gerade fliegen und höchstens PILUM_CLAIM_R px neben dem Gegner landen. So verteilt sich die Salve, statt dass
// alle auf den nächsten Gegner werfen (die Reihen werfen nacheinander und sehen die Speere der Reihe davor).
export const PILUM_SCAN_T = .1, PILUM_STAGGER = .02, PILUM_CLAIM = 1.5, PILUM_CLAIM_R = 20;
export const PILUM_SCAN = { calls: 0, cells: 0 };
const PC_N = 16, PC_U = new Array(PC_N).fill(null), PC_D = new Float64Array(PC_N);
const PL_N = 64, PL_X = new Float64Array(PL_N), PL_Y = new Float64Array(PL_N);
function pilumTarget(world, u) {
  const { HW, HH, hash } = world, f = factionOf(world, u), R = FORM.PILUM_MAX, ux = u.x, uy = u.y, PIL_MAX2 = R * R;
  const MIN2 = FORM.PILUM_MIN * FORM.PILUM_MIN;
  const gx0 = clamp((ux - R) / HC | 0, 0, HW - 1), gx1 = clamp((ux + R) / HC | 0, 0, HW - 1);
  const gy0 = clamp((uy - R) / HC | 0, 0, HH - 1), gy1 = clamp((uy + R) / HC | 0, 0, HH - 1);
  PILUM_SCAN.calls++; PILUM_SCAN.cells += (gx1 - gx0 + 1) * (gy1 - gy0 + 1);
  let best = null, bd = Infinity, n = 0;
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
    const cell = hash[gy * HW + gx];
    for (let i = 0; i < cell.length; i++) {
      const v = cell[i];
      if (!v.alive || v.type === 'heli' || v.ashT > 0 || (v.hidden && unseen(u, v))) continue;   // Task 5: Krokodil; Task 6: Asche
      const d2 = (v.x - ux) ** 2 + (v.y - uy) ** 2;
      if (d2 > PIL_MAX2 || factionOf(world, v) === f) continue;
      if (d2 < bd) { bd = d2; best = v; }
      if (d2 >= MIN2 && n < PC_N) { PC_U[n] = v; PC_D[n] = d2; n++; }
    }
  }
  // zu nah (nächster unter PILUM_MIN: kein Wurf, throwPilum) oder nur einer in Wurfweite
  if (!best || bd < MIN2 || n < 2) { for (let k = 0; k < n; k++) PC_U[k] = null; return best; }
  // Landepunkte der fliegenden Speere der eigenen Fraktion
  let np = 0;
  const proj = world.proj;
  for (let k = 0; k < proj.length && np < PL_N; k++) { const p = proj[k]; if (p.kind === 'pilum' && p.f === f) { PL_X[np] = p.x1; PL_Y[np] = p.y1; np++; } }
  const CR2 = PILUM_CLAIM_R * PILUM_CLAIM_R;
  let bs = Infinity;
  for (let k = 0; k < n; k++) {
    const v = PC_U[k];
    let c = 0;
    for (let j = 0; j < np; j++) if ((PL_X[j] - v.x) ** 2 + (PL_Y[j] - v.y) ** 2 <= CR2) c++;
    const s = PC_D[k] * (1 + PILUM_CLAIM * c);
    if (s < bs) { bs = s; best = v; }
    PC_U[k] = null;
  }
  return best;
}
function throwPilum(world, u) {
  const t = pilumTarget(world, u);
  if (!t || (t.x - u.x) ** 2 + (t.y - u.y) ** 2 < FORM.PILUM_MIN * FORM.PILUM_MIN) return;
  fire(world, u, t, 'pilum');
  u.pilum = 0;
}

// Richtung von u nach (px, py) in DIR (wiederverwendet, keine Allokation)
const DIR = { x: 0, y: 0 };
function toward(u, px, py) { const x = px - u.x, y = py - u.y, l = Math.hypot(x, y) || 1; DIR.x = x / l; DIR.y = y / l; return DIR; }

// Flucht oder Schreck (morale.updateMorale liefert true): Liegende stehen erst auf (ohne Bewegung, wie sonst), dann fleeSteer.
// Kein Angriff, außer die Bedrohung u.tg klebt seit CORNER_T s an u (u.cornerT): dann schlägt bzw. schießt u
// zurück, sobald sie in Reichweite ist, und läuft dabei weiter. Sanitäter (kein Schaden) und Mörser (Mindestabstand)
// wehren sich nicht; Nahkämpfer am Boden erreichen keinen Hubschrauber (wie world.nearestEnemy).
function retreat(world, u, dt) {
  const T = u.T;
  if (PRONE.has(u.type)) {
    if (u.stance === 'prone') standUp(u);
    else if (u.stance === 'down') standUp(u, 1 - u.stanceT / PRONE_DOWN_T);
    if (transit(world, u, dt)) return;
  }
  // festgenagelt (keine freie Fluchtrichtung): sofort in die Ecke gedrängt, PIN_HOLD s lang (morale.js)
  if (fleeSteer(world, u, dt)) u.cornerT = MORALE.CORNER_T + PIN_HOLD;
  const t = u.tg;
  if (!t || u.cornerT < MORALE.CORNER_T || T.heal || u.type === 'moerser' || u.type === 'sniper') return;
  if (outOfMelee(u, t)) return;   // Hubschrauber, Fledermausform
  const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1;
  if (d > T.range + T.r + t.T.r) {
    // Bedrohung außer Reichweite (Fernkämpfer): nach dem Festnageln auf sie los, statt stehend beschossen zu werden
    if (u.cornerT > MORALE.CORNER_T) { u.mx = dx / d * T.speed; u.my = dy / d * T.speed; u.face = dx < 0 ? -1 : 1; u.fx = dx / d; u.fy = dy / d; }
    return;
  }
  u.face = dx < 0 ? -1 : 1;
  if (u.cd <= 0) attack(world, u, t, d, dx, dy);
}

// Vorrang der Zustände (Nachtrag 3, Festlegung 1), von oben nach unten: tot > betäubt oder in der Luft > Schreck >
// Rückzug > laufende Fähigkeit > Römerblock > normales Verhalten. Betäubung, Abheben, Schreck und Rückzug brechen eine
// laufende Fähigkeit ab (abilities.cancelAbility: Abklingzeit beginnt neu); Fliehende und Erschreckte lösen keine aus.
export function think(world, u, dt) {
  const T = u.T;
  u.cd -= dt; u.rt -= dt; u.gt -= dt; if (u.st > 0) u.st -= dt; u.mx = 0; u.my = 0;
  if (u.abCd > 0 && !u.abOn) u.abCd -= dt;
  // Zauberbuch (spells.js): Abklingzeiten von Windstoß, Steinwand und Meteor
  if (u.windCd > 0) u.windCd -= dt;
  if (u.wallCd > 0) u.wallCd -= dt;
  if (u.meteorCd > 0) u.meteorCd -= dt;
  // Verstärkung (Heulen, abilities.js) läuft ab
  if (u.buffT > 0) { u.buffT -= dt; if (u.buffT <= 0) { u.buffT = 0; u.spdMul = 1; u.dmgMul = 1; } }
  if (u.lofWait > 0) u.lofWait -= dt;
  if (u.meleeT > 0) u.meleeT -= dt;
  if (T.tier) stepAnimal(world, u, dt);   // Task 5: Zeiten der Tiere, Versteck des Krokodils
  if (u.fleeT > 0) u.fleeT -= dt;
  // Animations-Timer für die Rigs (render/pose.js): seit dem Schuss, Rest von Schwung und Treffer
  if (u.fireT < 1) u.fireT += dt;
  u.swingT = u.swingT > dt ? u.swingT - dt : 0;
  u.hitT = u.hitT > dt ? u.hitT - dt : 0;
  // Task 6: Asche des Phönix liegt still und steht nach 2 s wieder auf (abilities.stepAsh), sonst nichts
  if (u.ashT > 0) { stepAsh(world, u, dt); return; }
  // Brand läuft in jedem Zustand (kann töten)
  if (u.burnT > 0) { stepBurn(world, u, dt); if (!u.alive) return; }
  // Gift läuft ebenso in jedem Zustand (kann töten)
  if (u.poisonT > 0) { stepPoison(world, u, dt); if (!u.alive) return; }
  // Task 6: Froschfluch läuft ab, Troll heilt, Phönix zieht seine Feuerspur, Einhorn heilt (in jedem Zustand)
  if (u.frogT > 0) stepFrogCurse(world, u, dt);
  if (u.type === 'troll') stepTroll(u, dt);
  else if (u.type === 'phoenix') { stepTrail(world, u, dt); if (!u.alive) return; }
  else if (u.type === 'einhorn') stepAura(world, u, dt);
  // Ghul (abilities.stepGhoul): zerfällt in jedem Zustand; solange er aufsteht, tut er nichts
  if (u.type === 'ghul' && stepGhoul(world, u, dt)) return;
  // In der Luft oder betäubt: keine Entscheidung, keine Wunschbewegung (Timer laufen oben weiter).
  // Wer geschleudert wird, liegt nicht mehr: er landet stehend.
  if (u.state !== 'ok') { if (u.abOn) cancelAbility(world, u); if (u.stance !== 'stand') { u.stance = 'stand'; u.stanceT = 0; } return; }
  // Task 6: Frosch (Froschfluch) ist harmlos: kein Rückzug, keine Fähigkeit, kein Angriff, hüpft vom Feind weg
  if (u.type === 'frosch') { stepFrog(world, u, dt); return; }
  // Schreck und Rückzug (morale.js, Spez. #27): vor allem anderen, auch vor dem Block. Der Vampir flieht als
  // Fledermausschwarm (Festlegung 1: die Fledermausform ist die Flucht selbst) und beißt dabei nicht.
  if (updateMorale(world, u, dt)) {
    if (u.abOn) cancelAbility(world, u);
    if (u.type === 'vampir') { if (stepBat(world, u, dt, true) === BAT_FLY) fleeSteer(world, u, dt); return; }
    retreat(world, u, dt); return;
  }
  // Task 5: passive Teile der Tiere (Brustklopfen, Angst des Elefanten vor Bienen), nur im normalen Zustand
  if (T.tier) { animalPassive(world, u); if (isFleeing(u)) { retreat(world, u, dt); return; } }
  // Fähigkeit (abilities.js): solange sie die Steuerung hat, kein normales Verhalten
  if (stepAbility(world, u, dt)) return;
  // Meteor-Kanal (spells.js): steht still und schaut zum Ziel (beim Start gesetzt); spells.stepSpells führt den Kanal
  if (u.chanId > 0) return;
  // Bug-MG des Panzers: feuert, während die Kanone lädt (eigene Abklingzeit, unabhängig vom übrigen Verhalten)
  if (u.type === 'panzer') hullMg(world, u, dt);
  // Römer im marschierenden Block (formation.js): kein eigenes Ziel, kein Schlag, nur auf den Platz und
  // einmal den Speer werfen
  if (u.formOn) {
    holdSlot(world, u, dt);
    // erste Suche im Schritt der Freigabe (formVol wächst um dt je Schritt), danach gedrosselt
    if (u.pilum === 1 && u.formVol >= 0 && !u.formFree && (u.formVol < dt || u.rt <= 0)) {
      u.rt = PILUM_SCAN_T + (u.id % 4) * PILUM_STAGGER; throwPilum(world, u);
    }
    return;
  }
  if (u.gt <= 0 && GROUP_USERS.has(u.type)) groupInfo(world, u);
  u.wall = u.type === 'ritter' && u.gn >= 3;
  if (T.heal) { healer(world, u, dt); return; }
  if (u.tg !== null && u.tg.ashT > 0) u.tg = null;   // Task 6: Asche des Phönix ist kein Ziel
  // Ziel neu: Takt, kein oder totes Ziel, Seitenwechsel, oder es wurde für einen Nahkämpfer unerreichbar (Fledermausform)
  if (u.rt <= 0 || !u.tg || !u.tg.alive || factionOf(world, u.tg) === factionOf(world, u) || (u.tg.batT > 0 && outOfMelee(u, u.tg)) ||
      (u.tg.hidden && unseen(u, u.tg))) {   // Task 5: Krokodil taucht ab
    const nt = nearestEnemy(world, u); u.rt = RETARGET_T[0] + world.rng() * RETARGET_T[1];
    // weit weg vom nächsten Gegner: seltener neu suchen (das Ziel ändert sich auf dem Anmarsch kaum)
    if (nt && (nt.x - u.x) ** 2 + (nt.y - u.y) ** 2 > RETARGET_FAR * RETARGET_FAR) u.rt *= RETARGET_FAR_MUL;
    if (nt !== u.tg) { u.pathT = 0; u.lofWait = 0; }   // neues Ziel: Wege- und Schusslinie gleich neu prüfen
    if (u.stingTg !== null && !u.stingTg.alive) u.stingTg = null;   // Biene: erstes Stichziel ist gefallen
    u.tg = nt;
  }
  const t = u.tg;
  // Hinlegen und Aufstehen laufen auch ohne Ziel zu Ende (und ohne Umdrehen mitten in der Bewegung)
  if (PRONE.has(u.type) && transit(world, u, dt)) return;
  // ohne Ziel zurück zum Vampir, aber nie über Lava oder Mauer (wie mit Ziel, unten)
  if (!t) { if (u.type === 'vampir') stepBat(world, u, dt, u.batOn && hazardAt(world, u.x, u.y)); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
  u.face = dx < 0 ? -1 : 1; u.fx = nx; u.fy = ny;
  // Vampir auf langen Wegen (abilities.stepBat): ab BAT_START px als Fledermausschwarm geradewegs zum Ziel, ab BAT_END px
  // wieder Vampir, aber nie über Lava oder Mauer (dann fliegt er weiter aufs Ziel zu); beim Verwandeln steht er, als
  // Fledermaus beißt er nicht
  if (u.type === 'vampir') {
    const s = stepBat(world, u, dt, u.batOn ? d > VAMPIRE.BAT_END || hazardAt(world, u.x, u.y) : d > VAMPIRE.BAT_START);
    if (s === BAT_FLY) { u.mx = nx * T.speed; u.my = ny * T.speed; u.run += dt; return; }
    if (s !== BAT_NONE) return;
  }
  const reach = T.range + T.r + t.T.r;
  // Task 5: Adler pickt nur unten (abilities.eagleStep); Nahkämpfer am Boden erreichen ihn oben nicht (world.aloft)
  if (u.type === 'adler' && eagleStep(world, u, t, d, reach)) return;
  if (d <= reach && aloft(t) && outOfMelee(u, t)) return;
  // Magier: Windstoß und Steinwand auch zwischen den Würfen (spells.spellReact, gedrosselt)
  if (u.type === 'magier' && u.cd > 0 && spellReact(world, u)) return;
  // Reiter reiten nach dem Sturmangriff durch die Reihen und wenden dann
  if (u.type === 'reiter' && u.st > 0) { u.mx = u.cvx; u.my = u.cvy; u.face = u.cvx < 0 ? -1 : 1; return; }
  // Task 6: Einhorn läuft nach dem Hornstoß durch wie der Reiter
  if (u.type === 'einhorn' && u.st > 0) { u.mx = u.cvx; u.my = u.cvy; u.face = u.cvx < 0 ? -1 : 1; return; }
  // Mörser halten Mindestabstand
  if (u.type === 'moerser' && d < 90) { u.mx = -nx * T.speed; u.my = -ny * T.speed; return; }
  if (u.type === 'sniper' && d <= reach) u.snipeT = 0;   // Wartezeit beginnt neu, solange ein Ziel in Reichweite ist (auch liegend)
  // MG und Scharfschütze: Hinlegen, Liegen, Aufstehen (sonst weiter wie stehend)
  if (PRONE.has(u.type) && stance(world, u, t, d, dx, dy, reach, dt)) return;
  // Task 6: Zyklop wirft nicht auf nahe Feinde, sondern schlägt unbeholfen zu (cyclopsClose)
  if (u.type === 'zyklop' && cyclopsClose(world, u, t, d, dx, dy, dt)) return;
  if (d <= reach) {
    // Magier: Zauberbuch statt Feuerball (spells.castSpell: Meteor, Feuerball, Blitz, Windstoß, Steinwand); lädt er, steht er
    if (u.type === 'magier') { if (u.cd <= 0) castSpell(world, u, t); return; }
    // Scharfschütze stehend: kein Schuss (nur liegend, stance), sondern zurück auf LIE_MIN oder seitlich ausweichen
    if (u.type === 'sniper') {
      if ((d < T.range * LIE_MIN && !pinned(world, u)) || meleeNear(world, u)) { u.mx = -nx * T.speed; u.my = -ny * T.speed; }
      else lineBlocked(world, u, nx, ny, dt);
      return;
    }
    // Gerade Schüsse: Zielpunkt (Vorhalt + Streuung) ziehen und die echte Bahn prüfen. Steht ein
    // Verbündeter darauf, nicht feuern, sondern seitlich ausweichen; sonst genau dorthin schießen.
    let ax, ay;
    if (STRAIGHT.has(u.type) && u.cd <= 0) {
      const kind = STRAIGHT_KIND[u.type];
      if (!lofCheck(world, u, t, kind)) { u.aimOk = false; lineBlocked(world, u, nx, ny, dt); return; }
      ax = AIM.x; ay = AIM.y;
      u.blockedT = 0; u.aimOk = true;
    }
    attack(world, u, t, d, dx, dy, ax, ay);
    if (KITE.has(u.type) && u.cd > .3 && d < T.range * .35 && t.T.range < 20 && !t.T.fly) { u.mx = -nx * T.speed * .5; u.my = -ny * T.speed * .5; }
    else if (u.type === 'drache' || u.type === 'heli') { const s = u.id % 2 ? 1 : -1; u.mx = -ny * s * T.speed * .5; u.my = nx * s * T.speed * .5; }
    return;
  }
  // Scharfschütze ohne Ziel in Reichweite: erst WAIT s warten, dann vorrücken, nie über die Frontgrenze
  if (u.type === 'sniper') {
    u.snipeT += dt;
    if (u.snipeT < SNIPER.WAIT) return;
    const c = world.cent.get(factionOf(world, u));
    if (c && c.has && c.fn > 0 && u.x * c.ex + u.y * c.ey >= c.front - SNIPER.BEHIND) return;
  }
  // Wegfindung (Spez. #24, pathing.js), nur Bodentruppen mit Bodenziel: Ist die gerade Linie zum Ziel
  // verbaut (Mauerzelle oder ≥ 2 Lavazellen; Prüfung alle PATH_RECHECK s; Fernkämpfer prüfen nur das
  // Stück, das sie bis zur Reichweite noch laufen müssen, sie schießen über Mauern), folgt die Einheit dem
  // Flussfeld ihrer Fraktion statt der geraden Richtung; Gruppenverhalten gilt nur auf offener Fläche.
  // Vor einer Mauer festgesteckt wird nur eingeschlagen, wenn kein Weg führt (flowDir null) oder der
  // Weg (bei Mauer auf der Linie) länger ist als PATH_BASH_DETOUR × Luftlinie (und mindestens PATH_BASH_MIN px länger), oder nach
  // PATH_STUCK_T s Festsitzen an einer Mauer, die das grobe Raster für begehbar hält (dünne Mauer, durch
  // die der Fluss führt). Steht die Einheit schon im Feld eines Gegners (fd.dist 0), geht sie direkt.
  const stuck = !T.fly && u.blk > .45 && world.terr[u.bcell] === 4;
  let fd = null;
  if (!T.fly && !t.T.fly && world.flow) {
    u.pathT -= dt;
    if (u.pathT <= 0) {
      u.pathT = PATH_RECHECK + (u.id % 8) * .01;
      const L = T.range >= 20 ? Math.max(0, d - reach + PATH_RANGE_PAD) : d;
      u.pathBlk = L > 0 ? directBlocked(world, world.flow, u.x, u.y, u.x + nx * L, u.y + ny * L) : 0;
    }
    if (u.pathBlk || stuck) fd = flowDir(world.flow, factionOf(world, u), u.x, u.y);
  }
  // Kein sinnvoller Umweg: wie ohne Wegfindung gerade aufs Ziel zu und an der Mauer einschlagen. Die
  // Umweg-Grenze gilt nur für Mauern; versperrt nur Lava die Linie, folgt die Einheit dem Fluss immer
  // (er hat die Lava schon mit ×12 gegen den Umweg abgewogen).
  const lavaOnly = !stuck && u.pathBlk === PATH_BLOCK_LAVA;
  const noDetour = fd === null || (!lavaOnly && fd.dist > PATH_BASH_DETOUR * d && fd.dist > d + PATH_BASH_MIN);
  if (stuck && (noDetour || (u.blk > PATH_STUCK_T && pathOpen(world, world.flow, u.bcell)))) {
    if (u.cd <= 0) { u.cd = T.cd; u.swingT = .25; hitWall(world, u.bcell, (T.dmg || 8) * (T.splash ? 2.5 : 1.3), u.x, u.y); sound(world, 'hit'); }
    return;
  }
  if (!noDetour && fd.dist > 0) { u.mx = fd.dx * T.speed; u.my = fd.dy * T.speed; u.face = fd.dx < 0 ? -1 : 1; u.run += dt; return; }
  let ax = nx, ay = ny, sp = T.speed;
  switch (u.type) {
    case 'wolf':
      // Rudel: fächert sich um die Beute auf und greift von den Seiten und von hinten an
      if (u.gn >= 3 && d > 40) {
        const base = Math.atan2(u.gy - t.y, u.gx - t.x) + ((u.id % 5) - 2) * .55, R = Math.max(8, d * .45);
        toward(u, t.x + Math.cos(base) * R, t.y + Math.sin(base) * R); ax = DIR.x; ay = DIR.y;
      }
      break;
    case 'reiter':
      // Flankenritt: erst seitlich am Ziel vorbei, dann Sturmangriff
      if (d > 140) { const s = u.id % 2 ? 1 : -1, R = Math.min(130, d * .5); toward(u, t.x - ny * s * R, t.y + nx * s * R); ax = DIR.x; ay = DIR.y; }
      break;
    case 'biene': {
      // Schwarm: kreist ums Ziel, bleibt zusammen, schwirrt
      const s = u.id % 2 ? 1 : -1, o = d < 60 ? .45 : .3;
      const bx = nx - ny * s * o + (u.gx - u.x) * .01 + rnd(world, -.5, .5);
      const by = ny + nx * s * o + (u.gy - u.y) * .01 + rnd(world, -.5, .5);
      const l = Math.hypot(bx, by) || 1; ax = bx / l; ay = by / l; break;
    }
    case 'bueffel':
      // Task 5: Herde: bleibt bei den anderen Büffeln (zieht zur Gruppenmitte, solange das Ziel nicht ganz nah ist)
      if (u.gn >= 2 && d > 50) {
        const bx = nx + (u.gx - u.x) * .02, by = ny + (u.gy - u.y) * .02, l = Math.hypot(bx, by) || 1;
        ax = bx / l; ay = by / l;
      }
      break;
    case 'krieger': case 'roemer': case 'ritter': case 'geist': case 'baer':
      // Einkreisen: ist das Ziel schon umringt, sucht man sich einen freien Platz drumherum
      if (t.att > 3 && d < 130) {
        const g = Math.atan2(u.y - t.y, u.x - t.x) + ((u.id % 3) - 1) * .6, R = reach * .9;
        toward(u, t.x + Math.cos(g) * R, t.y + Math.sin(g) * R); ax = DIR.x; ay = DIR.y;
      }
      break;
  }
  // Reihe halten: wer vor der Gruppe läuft, wartet; wer hinterherhängt, schließt auf
  if (LINE.has(u.type) && u.gn >= 3 && d > reach + 20) { const depth = (u.x - u.gx) * nx + (u.y - u.gy) * ny; sp *= clamp(1 - depth / 45, .35, 1.3); }
  u.mx = ax * sp; u.my = ay * sp;
  u.run += dt;
}

// Gegnerischer Nahkämpfer (Reichweite < 20) näher als PRONE_MELEE_R? Dieselben Hash-Zellen wie
// query(world, u.x, u.y, PRONE_MELEE_R), aber als eigene Schleife ohne Rückruf (läuft für jeden stehenden
// oder liegenden MG-Schützen und Scharfschützen in Reichweite in jedem Schritt; Task 13), bricht beim
// ersten Treffer ab.
const MELEE_R2 = PRONE_MELEE_R * PRONE_MELEE_R;
// Gedrosselt: Ergebnis gilt MELEE_RECHECK s (+ id % 3 · 0,02 s, gestaffelt)
function meleeNear(world, u) {
  if (u.meleeT > 0) return u.meleeHit;
  u.meleeT = MELEE_RECHECK + (u.id % 3) * .02;
  return (u.meleeHit = meleeScan(world, u));
}
function meleeScan(world, u) {
  const { HW, HH, hash } = world, f = factionOf(world, u), R = PRONE_MELEE_R, ux = u.x, uy = u.y;
  const gx0 = clamp((ux - R) / HC | 0, 0, HW - 1), gx1 = clamp((ux + R) / HC | 0, 0, HW - 1);
  const gy0 = clamp((uy - R) / HC | 0, 0, HH - 1), gy1 = clamp((uy + R) / HC | 0, 0, HH - 1);
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
    const cell = hash[gy * HW + gx];
    for (let i = 0; i < cell.length; i++) {
      const v = cell[i];
      if (!v.alive || v.T.range >= 20) continue;
      const dx = v.x - ux, dy = v.y - uy;
      if (dx * dx + dy * dy < MELEE_R2 && factionOf(world, v) !== f) return true;
    }
  }
  return false;
}

function standUp(u, frac = 1) { u.stance = 'up'; u.stanceT = PRONE_UP_T * frac; }

// Übergänge von MG und Scharfschütze (jeder Denkschritt, auch ohne Ziel): Sperre proneCd läuft ab,
// 'down' und 'up' laufen weiter. Liefert true während 'down'/'up' (kein Schuss, keine Bewegung).
function transit(world, u, dt) {
  if (u.proneCd > 0) u.proneCd -= dt;
  if (u.stance === 'down') {
    // Nahkämpfer beim Hinlegen: umkehren, so weit wie schon hingelegt
    if (meleeNear(world, u)) { standUp(u, 1 - u.stanceT / PRONE_DOWN_T); return true; }
    u.stanceT -= dt;
    if (u.stanceT <= 0) { u.stance = 'prone'; u.stanceT = 0; }
    return true;
  }
  if (u.stance === 'up') {
    u.stanceT -= dt;
    if (u.stanceT <= 0) { u.stance = 'stand'; u.stanceT = 0; }
    return true;
  }
  return false;
}

// Haltung von MG und Scharfschütze (Spez. #22) für einen Denkschritt mit Ziel t im Abstand d (reach:
// normale Reichweite), stehend oder liegend (Übergänge: transit). Liefert true, wenn der Schritt damit
// erledigt ist, false, wenn die Einheit stehend wie sonst weitermacht. Hinlegen nur, wenn das Ziel in
// normaler Reichweite ist, kein Nahkämpfer nahe ist, keine Sperre läuft (proneCd) und ein frischer
// Zielcheck frei ist (u.aimOk: Ergebnis des letzten Zielchecks, stehend wie liegend). Liegend: Nahkämpfer nahe oder Ziel jenseits von PRONE_RANGE · Reichweite →
// aufstehen; sonst ohne Bewegung schießen. Verdeckte Linie: Feuer halten, nach PRONE_BLOCK_T s aufstehen
// und bis PRONE_BLOCK_T s nach dem Aufstehen nicht wieder hinlegen (Zeit zum Ausweichen bzw. Umsehen).
function stance(world, u, t, d, dx, dy, reach, dt) {
  const T = u.T;
  switch (u.stance) {
    case 'prone': {
      if (d > T.range * PRONE_RANGE + T.r + t.T.r || meleeNear(world, u) || (u.type === 'sniper' && d < T.range * SNIPER.KEEP && !pinned(world, u))) { standUp(u); return true; }
      if (u.cd > 0) return true;
      const kind = STRAIGHT_KIND[u.type];
      if (!lofCheck(world, u, t, kind)) {
        u.aimOk = false; u.blockedT += dt;
        if (u.blockedT >= PRONE_BLOCK_T) { u.blockedT = 0; u.proneCd = PRONE_UP_T + PRONE_BLOCK_T; standUp(u); }
        return true;
      }
      u.blockedT = 0; u.aimOk = true;
      attack(world, u, t, d, dx, dy, AIM.x, AIM.y);
      return true;
    }
    default: {
      if (u.proneCd > 0 || d > reach || (u.type === 'sniper' && d < T.range * LIE_MIN && !pinned(world, u)) || meleeNear(world, u)) return false;
      // Echter Zielcheck vor dem Hinlegen (nicht nur blockedT: das beginnt bei 0 und wird von lineBlocked
      // auch ohne freie Linie zurückgesetzt): nur mit freier Bahn hinlegen, sonst stehend weiter (Ausweichen)
      const kind = STRAIGHT_KIND[u.type];
      u.aimOk = lofCheck(world, u, t, kind);
      if (!u.aimOk) return false;
      u.stance = 'down'; u.stanceT = PRONE_DOWN_T;
      return true;
    }
  }
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
    if (alt) { u.tg = alt; u.rt = LOF_HOLD; u.lofWait = 0; }   // neues Ziel: Schusslinie gleich prüfen (wie think)
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
    case 'drache': breath(world, u, dx / d, dy / d, t); break;
    // --- Task 6: Kreaturen ---
    // Zyklop: nahe Feinde (auch in der Ecke auf der Flucht) unbeholfen schlagen statt werfen (cyclopsHit)
    case 'zyklop': if (d < CYCLOPS.MIN_D) { u.cd *= CYCLOPS.MELEE_CD; cyclopsHit(world, u, t); } else { fire(world, u, t, 'boulder'); u.swingT = .25; } break;
    case 'hexe': fire(world, u, t, 'hex', ax, ay); break;
    case 'baer': {
      // Prankenhieb trifft mehrere
      const f = factionOf(world, u);
      query(world, t.x, t.y, T.splash + 20, v => {
        if (factionOf(world, v) === f || isBat(v) || aloft(v)) return;   // Fledermausform, Adler oben (Task 5): für Nahkämpfer unerreichbar
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
      let a = T.dmg * (.85 + world.rng() * .3) * u.dmgMul;   // dmgMul: Verstärkung (Heulen)
      // Treffer von hinten
      const flank = ((u.x - t.x) * t.fx + (u.y - t.y) * t.fy) / d < -.3;   // fx/fy 0: noch keine Blickrichtung
      if (flank) a *= 1.35;
      // Sturmangriff der Reiter, danach Durchritt
      if (u.type === 'reiter' && u.run > .7) {
        a *= 2.6; knock(t, dx / d, dy / d, 260);
        emit(world, { type: 'charge', x: t.x, y: t.y });
        u.st = .6; u.cvx = dx / d * T.speed; u.cvy = dy / d * T.speed;
      }
      // Task 6: Hornstoß des Einhorns aus vollem Lauf (abilities.UNICORN), danach Durchlauf
      if (u.type === 'einhorn' && u.run > .7) {
        a *= UNICORN.CHARGE; knock(t, dx / d, dy / d, UNICORN.PUSH);
        emit(world, { type: 'charge', x: t.x, y: t.y, horn: true });
        u.st = UNICORN.THROUGH; u.cvx = dx / d * T.speed; u.cvy = dy / d * T.speed;
      }
      // Rudelbonus
      if (u.type === 'wolf') {
        let n = 0; query(world, u.x, u.y, 70, v => { if (v.type === 'wolf' && v.team === u.team && ++n >= 3) return true; });
        if (n >= 3) a *= 1.4;
      }
      if (u.type === 'krokodil') u.seenT = CROC.SEEN;   // Task 5: nach dem Biss sichtbar
      const before = t.hp, dealt = hurt(world, t, a, u.type === 'phoenix' ? 'phoenix' : 'melee', u);   // Phönix: Feuerkrallen (Task 6)
      // Biene: der erste Stich auf dieses Ziel vergiftet (Nachtrag 4, #37)
      if (u.type === 'biene' && u.stingTg !== t) { u.stingTg = t; if (t.alive) poison(world, t, u); }
      if (u.stingTg !== null && !u.stingTg.alive) u.stingTg = null;   // keinen Verweis auf Tote festhalten
      if (u.type === 'geist') u.hp = Math.min(T.hp, u.hp + dealt);
      // Lebensraub des Vampirs (Spez. #32): die Hälfte des Schadens, ohne den Überschuss über die LP des Opfers
      else if (u.type === 'vampir') { const h = u.hp + VAMPIRE.HEAL * (dealt < before ? dealt : before > 0 ? before : 0); u.hp = h < T.hp ? h : T.hp; }
      emit(world, { type: 'hit', x: t.x, y: t.y, flank, kind: 'melee' });
      sound(world, u.type === 'krieger' || u.type === 'ritter' ? 'clink' : 'hit');
    }
  }
  u.run = 0;
}

function healOne(world, f, v, a) {
  if (!v.alive || factionOf(world, v) !== f || v.hp >= v.T.hp || v.ashT > 0 || UNDEAD.has(v.type)) return;
  v.hp = Math.min(v.T.hp, v.hp + a * healMul(world, v));
  emit(world, { type: 'heal', x: v.x, y: v.y - v.T.r });
}
const HEAL_FLEE_BONUS = 1e12;   // px²: zieht jeden Fliehenden jedem anderen Verletzten vor
// Gedämpfte Heilung (Nachtrag 4, #38): heilen mehrere Sanitäter dasselbe Ziel zugleich (innerhalb von HEAL_STACK.T s ab der
// ersten Heilung, v.healAt/v.healN), wirkt die erste voll, die zweite zu MUL[1], jede weitere zu MUL[2]. T liegt klar unter
// der Abklingzeit der Sanitäter (1 s): mit T = 1 ließ der Rundungsfehler der Schritte (0,99999 s) die Heilungen eines
// einzelnen Sanitäters zwischen voll und halb wechseln (Prüfung Fix-Runde 1).
// SPLASH: Anteil für Verletzte bis SPLASH_R px um das Ziel (vorher voll). Der Prüfstand zeigte, dass dieser Umkreis die
// Sanitäter stark machte (ein Sanitäter heilte in einer dichten Reihe 5 und mehr Einheiten je Sekunde): 18 Soldaten mit
// 15 Sanitätern schlugen 35 Soldaten 8/8, mit SPLASH .5 noch 8/8, mit .25 7/8, mit 0 0/8. Den Umkreis heilt jetzt nur die
// Heilwelle (abilities.HEAL_WAVE).
export const HEAL_STACK = { T: .9, MUL: [1, .5, .25], SPLASH: 0, SPLASH_R: 50 };
export function healMul(world, v) {
  if (world.time - v.healAt >= HEAL_STACK.T - 1e-6) { v.healAt = world.time; v.healN = 0; }
  const M = HEAL_STACK.MUL, k = v.healN < M.length ? v.healN : M.length - 1;
  v.healN++;
  return M[k];
}
function healer(world, u, dt) {
  const T = u.T, f = factionOf(world, u);
  if (u.rt <= 0 || !u.tg || !u.tg.alive || u.tg.hp >= u.tg.T.hp || u.tg.ashT > 0 || factionOf(world, u.tg) !== f) {
    let best = null, bd = Infinity;
    // Fliehende und Erschreckte (morale.isFleeing) vor allen anderen, unter ihnen der nächste
    // Untote (Ghule, data.UNDEAD) heilt er nicht, die Asche des Phönix (Task 6) auch nicht: sie steht ohnehin mit halben LP auf
    query(world, u.x, u.y, 380, v => {
      if (v === u || factionOf(world, v) !== f || v.hp >= v.T.hp || v.T.heal || v.ashT > 0 || UNDEAD.has(v.type)) return;
      const d = (v.x - u.x) ** 2 + (v.y - u.y) ** 2 - (isFleeing(v) ? HEAL_FLEE_BONUS : 0); if (d < bd) { bd = d; best = v; }
    });
    if (!best) {
      query(world, u.x, u.y, 420, v => {
        if (v === u || factionOf(world, v) !== f || v.T.heal) return;
        const d = (v.x - u.x) ** 2 + (v.y - u.y) ** 2; if (d < bd) { bd = d; best = v; }
      });
      u.follow = true;
    } else u.follow = false;
    u.tg = best; u.rt = HEAL_RETARGET_T[0] + world.rng() * HEAL_RETARGET_T[1];
  }
  // Sanitäter halten sich aus dem Getümmel heraus (Fluchtrichtung alle FLEE_RECHECK s neu, gestaffelt)
  if (!(u.fleeT > 0)) {
    let sx = 0, sy = 0;
    query(world, u.x, u.y, 110, v => {
      if (factionOf(world, v) === f) return;
      const qx = u.x - v.x, qy = u.y - v.y, q = Math.hypot(qx, qy) || 1; sx += qx / q; sy += qy / q;
    });
    u.fleeX = sx; u.fleeY = sy; u.fleeT = FLEE_RECHECK + (u.id % 3) * .02;
  }
  const ex = u.fleeX, ey = u.fleeY;
  if (ex || ey) { const l = Math.hypot(ex, ey); u.mx = ex / l * T.speed; u.my = ey / l * T.speed; u.face = ex < 0 ? -1 : 1; return; }
  const t = u.tg; if (!t) return;
  const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1; u.face = dx < 0 ? -1 : 1;
  const want = u.follow ? 55 : T.range * .6;
  if (d > want) { u.mx = dx / d * T.speed; u.my = dy / d * T.speed; }
  if (!u.follow && d <= T.range && u.cd <= 0) {
    u.cd = T.cd;
    if (HEAL_STACK.SPLASH > 0) query(world, t.x, t.y, HEAL_STACK.SPLASH_R, v => { if (v !== t) healOne(world, f, v, T.heal * HEAL_STACK.SPLASH); });
    healOne(world, f, t, T.heal);
  }
}

/* ---------- Geschosse ---------- */
// Bögen landen nach dur am Zielpunkt: Pfeil trifft den nächsten Körper (jede Fraktion außer dem
// Schützen) bis 8 px vom Landepunkt in Zielhöhe, Bomben/Mörser/Granaten explodieren.
// Gerade Schüsse bewegen sich je Schritt um speed·dt und treffen das Erste auf dem Segment:
// Kugeln enden dort (Mauer nimmt Schaden), Raketen und Feuerbälle explodieren dort.
// Ohne Treffer: Kugeln enden BULLET_OVERSHOOT px hinter dem Zielpunkt, Raketen/Feuer explodieren am Zielpunkt.
// Liegende Verbündete des Schützen (Fraktion p.f) trifft er nie (sie ducken sich). Andere liegende Körper,
// auf die der Schuss nicht gezielt ist, trifft er nur mit PRONE_DODGE: ein Wurf je Geschoss und Körper;
// geht er vorbei, kommt der Körper in p.pass und der Strahl läuft dahinter weiter.
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
    let r = cast(world, p.x, p.y, x1, y1, p.z, z1, p.src, p.pass, 0, p.f);
    while (r.unit && r.unit.stance === 'prone' && r.unit !== p.tg && world.rng() >= PRONE_DODGE) {
      (p.pass || (p.pass = new Set())).add(r.unit);
      r = cast(world, p.x, p.y, x1, y1, p.z, z1, p.src, p.pass, 0, p.f);
    }
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

// Schildblock (Spez. #25): Schaden ×SHIELD_MUL, block-Ereignis am Schild statt hit. a: Abprallwinkel, die
// Flugrichtung (dx, dy) an der Blickrichtung des Blocks gespiegelt.
function shieldHit(world, v, a, kind, dx, dy, src) {
  const ax = v.formAx, ay = v.formAy, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, k = 2 * (ux * ax + uy * ay);
  hurt(world, v, a * SHIELD_MUL, kind === 'pilum' || kind === 'firearrow' ? 'arrow' : kind, src);
  emit(world, { type: 'block', x: v.x + ax * v.T.r, y: v.y + ay * v.T.r, kind, a: Math.atan2(uy - k * ay, ux - k * ax) });
  sound(world, 'clink');
}

// Pfeil, Speer und Brandpfeil treffen den nächsten Körper am Landepunkt (Schaden als 'arrow': Rüstung, Deckung,
// Liegen wie beim Pfeil); Römer im Block halten sie von vorn mit dem Schild ab (Flugrichtung Start → Landepunkt).
// Der Brandpfeil zündet danach an (Verursacher der Schütze) mit der höchsten Generation BURN_MAX_GEN: der Getroffene
// brennt, das Feuer springt nicht über (abilities.FIRE_ARROWS); ein abgeblockter zündet nicht (Vorgabe 5).
function landArc(world, p, src) {
  if (p.kind === 'boulder') { landBoulder(world, p, src); return; }   // Task 6
  if (!ARROW_LIKE.has(p.kind)) { blast(world, p.x1, p.y1, p.R, p.dmg, p.f, src, 'blast', 3); return; }
  let best = null, bd = Infinity;
  query(world, p.x1, p.y1, 26 + MAX_R, v => {
    if (v === p.src || Math.abs(v.z - p.tz) >= v.T.r + BODY_Z_PAD) return;
    const d = Math.hypot(v.x - p.x1, v.y - p.y1) - v.T.r; if (d < 8 && d < bd) { bd = d; best = v; }
  });
  if (best) {
    const a = p.dmg * (.85 + world.rng() * .3), dx = p.x1 - p.x0, dy = p.y1 - p.y0;
    if (shieldBlocks(best, p.kind, dx, dy)) { shieldHit(world, best, a, p.kind, dx, dy, src); return; }
    hurt(world, best, a, 'arrow', src);
    if (p.kind === 'firearrow' && best.alive) ignite(world, best, BURN_MAX_GEN, src);
    emit(world, { type: 'hit', x: best.x, y: best.y, flank: false, kind: p.kind });
    sound(world, 'hit');
  } else emit(world, { type: 'miss', kind: p.kind, x: p.x1, y: p.y1, a: Math.atan2(p.y1 - p.y0, p.x1 - p.x0) });
}

// Gerader Schuss am Ende: v = getroffener Körper, cell = Mauerzelle (−1), (x, y) = Trefferpunkt am Boden
function impact(world, p, v, cell, x, y, src) {
  if (p.kind === 'hex') { hexImpact(world, p, v, x, y, src); return; }   // Task 6
  if (p.kind === 'bullet') {
    if (v) {
      const a = p.dmg * (.85 + world.rng() * .3);
      if (shieldBlocks(v, 'bullet', p.nx, p.ny)) { shieldHit(world, v, a, 'bullet', p.nx, p.ny, src); return; }
      hurt(world, v, a, 'bullet', src);
      emit(world, { type: 'hit', x: v.x, y: v.y, flank: false, kind: 'bullet' });
      sound(world, 'hit');
    } else {
      if (cell >= 0) hitWall(world, cell, p.dmg * BULLET_WALL, p.sx, p.sy);
      emit(world, { type: 'miss', kind: 'bullet', x, y, a: Math.atan2(p.ny, p.nx) });
    }
    return;
  }
  // Rakete/Feuerball: Volltreffer explodiert am Körper, sonst am Trefferpunkt
  // Der Feuerball setzt die Getroffenen in Brand (Spez. #31, Generation spells.FIREBALL.GEN)
  const bx = v ? v.x : x, by = v ? v.y : y, fb = p.kind === 'fire';
  blast(world, bx, by, p.R, p.dmg, p.f, src, fb ? 'fire' : 'rocket', fb ? 1.5 : 2, fb ? FIREBALL.GEN : -1);
}

/* ---------- Task 6: Kreaturen (Spez. #34) ----------
   Zyklop: Felsbrocken und unbeholfener Nahkampf; Hexe: Zauber 'hex'. Werte in abilities.js (CYCLOPS, FROG). */

// Felsbrocken am Landepunkt: Explosion mit Radius p.R (Schaden, Abfall und Schleudern wie blast, trifft alle Fraktionen,
// der Werfer ×0,5; Schadensart 'blast', also kein Schildblock und Deckung im Wald), dazu CYCLOPS.DEBRIS Brocken, die nur
// liegen bleiben (world.debris, ohne Schaden). Kein Mauerschaden und kein Feuerball-Blitz: eigener Staub-Effekt (creature
// 'boulder').
function landBoulder(world, p, src) {
  const x = p.x1, y = p.y1, R = p.R, dmg = p.dmg;
  query(world, x, y, R + 16, v => {
    const dx = v.x - x, dy = v.y - y, d = Math.hypot(dx, dy);
    if (d > R + v.T.r) return;
    const fall = 1 - .5 * Math.min(1, d / R);
    fling(v, dx, dy, d, dmg * BLAST_PUSH * fall);
    hurt(world, v, dmg * fall * (v === src ? .5 : 1), 'blast', src);
  });
  for (let k = 0; k < CYCLOPS.DEBRIS; k++) {
    const a = world.rng() * Math.PI * 2, sp = rnd(world, 40, 110);
    world.debris.push(makeDebris(x, y, rnd(world, 2, 6), Math.cos(a) * sp, Math.sin(a) * sp, rnd(world, 90, 180),
      world.rng() * Math.PI * 2, (world.rng() < .5 ? -1 : 1) * rnd(world, 4, 10)));
  }
  emit(world, { type: 'creature', k: 'boulder', x, y, R, shake: 4 });
  sound(world, 'impact');
}

// Hexenzauber am Ende: trifft den Körper mit dem Schaden der Hexe (Art 'hex': kein Feuer, kein Schildblock), sonst verpufft er
function hexImpact(world, p, v, x, y, src) {
  if (v) {
    hurt(world, v, p.dmg * (.85 + world.rng() * .3), 'hex', src);
    emit(world, { type: 'hit', x: v.x, y: v.y, flank: false, kind: 'hex' });
    emit(world, { type: 'creature', k: 'hexhit', x: v.x, y: v.y, z: v.z });
    sound(world, 'pop');
  } else emit(world, { type: 'creature', k: 'hexhit', x, y, z: 0 });
}

// Zyklop mit Ziel näher als CYCLOPS.MIN_D (Bodenziel, nicht Hubschrauber/Fledermaus): in Nahkampfreichweite ein
// unbeholfener Schlag (attack: Abklingzeit ×MELEE_CD, cyclopsHit: Schaden ×MELEE_DMG), sonst geht er hin. Liefert true,
// wenn der Schritt damit erledigt ist (weiter weg: false, er wirft).
function cyclopsClose(world, u, t, d, dx, dy, dt) {
  if (d >= CYCLOPS.MIN_D || t.type === 'heli' || isBat(t)) return false;
  const T = u.T, reach = CYCLOPS.MELEE + T.r + t.T.r;
  if (d > reach) { u.mx = dx / d * T.speed; u.my = dy / d * T.speed; u.run += dt; return true; }
  if (u.cd <= 0) attack(world, u, t, d, dx, dy);
  return true;
}
function cyclopsHit(world, u, t) {
  u.swingT = .25;
  hurt(world, t, u.T.dmg * CYCLOPS.MELEE_DMG * (.85 + world.rng() * .3), 'melee', u);
  emit(world, { type: 'hit', x: t.x, y: t.y, flank: false, kind: 'melee', shake: 2 });
  sound(world, 'thud');
}
