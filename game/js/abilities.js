// Fähigkeiten (Spez. #30, Nachtrag 3): rein, kein DOM, kein PIXI, Zufall nur über world.rng(). Nur das Verhalten;
// Name und Text jeder Fähigkeit stehen in data.js (ABIL → UNITS[t].abil), die Karten lesen nur dort (Vorgabe 2).
//
// ABILITY[type] = { cd, ready(world, u) → bool, start(world, u), update(world, u, dt) → bool (true = fertig),
// end?(world, u) }:
//   cd      Abklingzeit in s. Beim Spawn startet u.abCd bei cd · (0,3 + 0,7 · q), q nach u.id gestreut (goldener
//           Schnitt, world.spawn, ohne world.rng), damit gleichzeitig gemalte Einheiten nicht alle zugleich auslösen.
//           Gruppen (Schützen, Soldaten) teilen die Abklingzeit beim Auslösen (shareCd).
//   ready   Darf sie jetzt auslösen (Ziel, Lage)? Kann dabei Ziel bzw. Zielpunkt merken (u.tg, u.abX/u.abY). Ohne
//           Erfolg versucht stepAbility es erst nach ABILITY_RETRY s wieder (u.abCd), statt jeden Schritt zu suchen.
//   start   Beginn (einmal). Gleich danach läuft update mit dt = 0 im selben Schritt.
//   update  Jeder Schritt, solange sie läuft; u.abT = Zeit seit dem Start, u.abK = Zähler (z. B. Raketen). true:
//           fertig, dann läuft im selben Schritt das normale Verhalten weiter.
//   end     (optional) Aufräumen, beim regulären Ende wie beim Abbruch; läuft vor dem Zurücksetzen (sieht abT, abK).
// Nach dem Ende und nach jedem Abbruch beginnt die Abklingzeit neu (u.abCd = cd); während sie läuft, steht sie.
//
// Vorrang der Zustände (Festlegung 1), geführt in combat.think: tot > betäubt oder in der Luft > Schreck > Rückzug
// > laufende Fähigkeit > normales Verhalten. Betäubung, Abheben, Schreck und Rückzug brechen ab (cancelAbility);
// stepAbility selbst prüft das noch einmal, damit kein anderer Aufrufer den Vorrang umgehen kann.
//
// Importkreis: world → abilities → combat → formation/morale … Je nachdem, welches Modul zuerst geladen wird, sind
// die Exporte von world, combat, morale und formation beim Laden dieses Moduls noch nicht belegt. Darum hier keine
// Zugriffe auf sie auf oberster Ebene (nur in Funktionen); nur data.js darf beim Laden gelesen werden. Der Test
// "Importkreise: jedes Logikmodul lädt als Einstieg" (tests/abilities.test.js) wacht darüber.
import { UNITS, CELL, TERR_HAZ, BAT_FORM, UNDEAD } from './data.js';
import { factionOf, query, spawn } from './world.js';
import { fire, clearShot, hasLineOfFire, fling, hurt } from './combat.js';
import { isFleeing } from './morale.js';
import { leaveBlock } from './formation.js';
import { FLY_VZ } from './physics.js';

/* ---------- Feuer (Festlegung 7) ---------- */
// Feuerball, Drachenatem, Brand über Zeit, Brandpfeile, Phönixspur: gemeinsames Merkmal Feuer (combat.hurt: Panzer
// ×0,6, Geist voll; später Troll-Heilung, Vampir doppelt). Der Brandpfeil (Geschossart 'firearrow') trifft beim
// Aufprall wie ein Pfeil (Schadensart 'arrow': Rüstung, Deckung, Schild); sein Feuer wirkt über den Brand ('burn').
export const FIRE_KINDS = new Set(['fire', 'breath', 'burn', 'firearrow', 'phoenix']);
export const isFire = kind => FIRE_KINDS.has(kind);

// s bis zum nächsten Versuch, wenn ready ablehnt (kein Ziel in Reichweite)
export const ABILITY_RETRY = .5;

const MAX_R = Math.max(...Object.values(UNITS).map(T => T.r));

/* ---------- Schreck (Festlegung 1) ---------- */
// Kurzer erzwungener Rückzug von sec s, unabhängig vom Leben und ohne Erholung (morale.updateMorale führt ihn,
// combat.retreat steuert: Liegende stehen erst auf, in der Ecke wehrt sie sich). Ein längerer laufender Schreck
// bleibt (fearT = max). Verlässt sofort den Römerblock (kein Schildschutz), bricht eine laufende Fähigkeit ab und
// zählt sofort nicht mehr zum Schwerpunkt der Fraktion (wie der Fluchtbeginn). Wer betäubt oder in der Luft ist,
// erschrickt trotzdem; der Schreck läuft dann erst ab, wenn er wieder steht (Vorrang: betäubt > Schreck).
// Schreckwirkungen treffen nur Feinde: das prüft der Aufrufer.
export function scare(world, v, sec) {
  if (!v.alive || !(sec > 0)) return;
  if (!isFleeing(v)) {
    const c = world.cent.get(factionOf(world, v));
    if (c && c.n > 0) c.n--;
    v.safeT = 0; v.cornerT = 0; v.run = 0;
  }
  if (sec > v.fearT) v.fearT = sec;
  v.rt = 0; v.tg = null;   // Bedrohung gleich neu suchen (morale.updateMorale)
  leaveBlock(v);
  cancelAbility(world, v);
}

/* ---------- Ablauf ---------- */
// Ein Schritt Fähigkeit für u (aus combat.think, nach Schreck und Rückzug). Liefert true, solange eine Fähigkeit die
// Steuerung hat (think macht dann nichts anderes).
export function stepAbility(world, u, dt) {
  const A = ABILITY[u.type];
  // Typ ohne Fähigkeit (auch nach einem Typwechsel, z. B. Froschfluch): kein hängendes abOn
  if (A === undefined) { if (u.abOn) { u.abOn = false; u.abT = 0; u.abK = 0; } return false; }
  if (u.state !== 'ok' || isFleeing(u)) { if (u.abOn) finish(world, u, A); return false; }
  if (u.abOn) {
    u.abT += dt;
    if (A.update(world, u, dt)) { finish(world, u, A); return false; }
    return true;
  }
  if (u.abCd > 0) return false;
  if (!A.ready(world, u)) { u.abCd = ABILITY_RETRY; return false; }
  u.abOn = true; u.abT = 0; u.abK = 0;
  A.start(world, u);
  if (A.update(world, u, 0)) { finish(world, u, A); return false; }
  return true;
}

// Abbruch (Betäubung, Abheben, Schreck, Rückzug): wie das Ende, die Abklingzeit beginnt neu
export function cancelAbility(world, u) {
  const A = ABILITY[u.type];
  if (A !== undefined && u.abOn) finish(world, u, A);
}

// end läuft vor dem Zurücksetzen: es sieht noch u.abT und u.abK (z. B. wie viele Brandpfeile schon flogen)
function finish(world, u, A) {
  if (A.end) A.end(world, u);
  u.abOn = false; u.abT = 0; u.abK = 0; u.abCd = A.cd;
}

/* ---------- Hubschrauber: Raketensalve ---------- */
// N gerade Raketen im Abstand GAP s auf das Ziel: Schaden der Panzerfaust ÷ 2, Splash der Panzerfaust (trifft auch
// Eigene, #5). Ziel: unter den CAND nächsten Feinden in Reichweite (dazu das aktuelle Ziel) der mit der dichtesten
// Gruppe (Feinde minus Eigene im Umkreis GROUP_R; das aktuelle Ziel gewinnt Gleichstände), nur mit mehr Feinden als
// Eigenen und freier Schusslinie. Fällt es während der Salve, wird neu gewählt; ohne Ziel endet die Salve. Steht
// vor einer Rakete ein Verbündeter in der Bahn, fällt diese Rakete aus. Der Heli kreist dabei weiter.
export const HELI_SALVO = {
  N: 4, GAP: .25, DMG: UNITS.panzerfaust.dmg / 2, R: UNITS.panzerfaust.splash, GROUP_R: 40, CAND: 8,
};

// Kandidaten: die CAND nächsten Feinde in Reichweite (eine begrenzte Hash-Abfrage, nur beim Auslösen)
const CU = new Array(HELI_SALVO.CAND + 1).fill(null), CS = new Float64Array(HELI_SALVO.CAND + 1);
let CN = 0, Q_W = null, Q_U = null, Q_F = null, Q_R = 0;
function candTest(v) {
  if (factionOf(Q_W, v) === Q_F) return;
  const u = Q_U, dx = v.x - u.x, dy = v.y - u.y, d = dx * dx + dy * dy, r = Q_R + v.T.r, M = HELI_SALVO.CAND;
  if (d > r * r || (CN === M && d >= CS[M - 1])) return;
  let k = CN < M ? CN++ : M - 1;
  while (k > 0 && CS[k - 1] > d) { CS[k] = CS[k - 1]; CU[k] = CU[k - 1]; k--; }
  CS[k] = d; CU[k] = v;
}
// Gruppe um (x, y): +1 je Feind, −1 je Eigener der Fraktion f
let G_W = null, G_F = null, G_X = 0, G_Y = 0, G_R2 = 0, G_S = 0;
function groupTest(v) {
  const dx = v.x - G_X, dy = v.y - G_Y;
  if (dx * dx + dy * dy <= G_R2) G_S += factionOf(G_W, v) === G_F ? -1 : 1;
}
function groupScore(world, f, x, y, R = HELI_SALVO.GROUP_R) {
  G_W = world; G_F = f; G_X = x; G_Y = y; G_R2 = R * R; G_S = 0;
  query(world, x, y, R, groupTest);
  G_W = null; G_F = null;
  return G_S;
}

function salvoTarget(world, u) {
  const T = u.T, f = factionOf(world, u), reach = T.range + T.r;
  CN = 0; Q_W = world; Q_U = u; Q_F = f; Q_R = reach;
  query(world, u.x, u.y, reach + MAX_R, candTest);
  Q_W = null; Q_U = null; Q_F = null;
  const cur = u.tg;
  let has = false;
  for (let k = 0; k < CN; k++) if (CU[k] === cur) has = true;
  if (!has && cur && cur.alive && factionOf(world, cur) !== f) {
    const r = reach + cur.T.r;
    if ((cur.x - u.x) ** 2 + (cur.y - u.y) ** 2 <= r * r) CU[CN++] = cur;
  }
  for (let k = 0; k < CN; k++) CS[k] = groupScore(world, f, CU[k].x, CU[k].y) + (CU[k] === cur ? .5 : 0);
  let best = null;
  for (;;) {
    let bk = -1, bs = 0;
    for (let k = 0; k < CN; k++) if (CS[k] > bs) { bs = CS[k]; bk = k; }
    if (bk < 0 || bs < 1) break;   // nichts mehr oder höchstens so viele Eigene wie Feinde
    if (hasLineOfFire(world, u, CU[bk])) { best = CU[bk]; break; }
    CS[bk] = -Infinity;
  }
  CU.fill(null);   // keine Verweise auf Einheiten festhalten
  return best;
}

function heliReady(world, u) {
  const t = salvoTarget(world, u);
  if (!t) return false;
  u.tg = t; u.abX = t.x; u.abY = t.y;
  return true;
}

function heliUpdate(world, u) {
  const S = HELI_SALVO;
  let t = u.tg;
  if (!t || !t.alive || factionOf(world, t) === factionOf(world, u)) {
    t = salvoTarget(world, u);
    if (!t) return true;
    u.tg = t;
  }
  const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
  u.face = dx < 0 ? -1 : 1; u.fx = nx; u.fy = ny;
  // weiter kreisen wie beim normalen Feuer (combat.think)
  const s = u.id % 2 ? 1 : -1, sp = u.T.speed * .5;
  u.mx = -ny * s * sp; u.my = nx * s * sp;
  while (u.abK < S.N && u.abT >= u.abK * S.GAP - 1e-9) {
    const a = clearShot(world, u, t, 'rocket');
    if (a) fire(world, u, t, 'rocket', a.x, a.y, S.DMG, S.R);
    u.abK++;
  }
  u.abX = t.x; u.abY = t.y;
  return u.abK >= S.N;
}


/* ---------- Gemeinsame Hilfen (Task 2) ---------- */
const TAU = Math.PI * 2;
const emit = (world, e) => { world.events.push(e); };
const sound = (world, k) => { world.events.push({ type: 'sound', k }); };
const done = () => true;
const nothing = () => {};

// Wen Brüllen und Spuk nicht erschrecken: Maschinen und Drachen
export const FEARLESS = new Set(['panzer', 'heli', 'drache']);

// Das aktuelle Ziel u.tg, wenn es ein lebender Feind in Reichweite R ist (Mitte zu Mitte plus beide Radien);
// ground: nur Bodenziele. Gesucht wird nicht neu: u.tg führt combat.think.
function foeInReach(world, u, R, ground) {
  const t = u.tg;
  if (!t || !t.alive || factionOf(world, t) === factionOf(world, u) || (ground && t.T.fly)) return null;
  const r = R + u.T.r + t.T.r;
  return (t.x - u.x) ** 2 + (t.y - u.y) ** 2 <= r * r ? t : null;
}
function faceTo(u, x, y) {
  const dx = x - u.x, dy = y - u.y, d = Math.hypot(dx, dy) || 1;
  u.face = dx < 0 ? -1 : 1; u.fx = dx / d; u.fy = dy / d;
}

// Gruppen-Abklingzeit: löst u aus, laden eigene Einheiten seines Typs bis R px mit neu, auf cd · (1 + SHARE_JITTER · q),
// q nach id gestreut (goldener Schnitt). So gibt es eine Salve je Gruppe statt einer Welle beim ersten Feindkontakt
// (wenn die versetzten Startzeiten auf dem Anmarsch schon abgelaufen sind), und die Gruppe löst danach nicht wieder
// im Gleichtakt aus. Wer seine Fähigkeit gerade ausführt, bleibt unberührt.
export const SHARE_JITTER = .3;
let SC_W = null, SC_U = null, SC_F = null, SC_R2 = 0, SC_CD = 0;
function shareTest(v) {
  if (v === SC_U || v.type !== SC_U.type || v.abOn || factionOf(SC_W, v) !== SC_F) return;
  const dx = v.x - SC_U.x, dy = v.y - SC_U.y;
  if (dx * dx + dy * dy > SC_R2) return;
  const q = v.id * .6180339887, c = SC_CD * (1 + SHARE_JITTER * (q - Math.floor(q)));
  if (v.abCd < c) v.abCd = c;
}
function shareCd(world, u, R) {
  SC_W = world; SC_U = u; SC_F = factionOf(world, u); SC_R2 = R * R; SC_CD = ABILITY[u.type].cd;
  query(world, u.x, u.y, R, shareTest);
  SC_W = null; SC_U = null; SC_F = null;
}

/* ---------- Schütze: Brandpfeile ---------- */
// N Brandpfeile im Abstand GAP s auf das aktuelle Ziel in Reichweite (Bogen wie der Pfeil, Schaden des Schützen).
// Ein Treffer zündet das Ziel an, das Feuer springt aber nicht über (combat.landArc: höchste Generation
// BURN_MAX_GEN; Entscheidung des Controllers in Fix-Runde 2, ersetzt "Generation 0" der Plantabelle: über 144 Duelle
// gewannen Römer gegen Schützen mit überspringendem Feuer 55 %, ohne 71 %, ohne Fähigkeit 76 %). Ein Römerschild hält
// ihn ab und er zündet nicht (Vorgabe 5). Kein Drache als Ziel (feuerfest). Verlässt das Ziel die Reichweite oder fällt es, endet die Salve.
// Balance (Task 2, Prüfstand): in Masse kippten die Brandpfeile die Konter ritter > schuetze und roemer > schuetze
// sowie M2 und M5 (ein Brand macht am Ritter ×1,5 gut 36 Schaden, etwa 8 normale Pfeile). Darum: Abklingzeit 30 s
// statt des Richtwerts 20 s; eigene Schützen bis SHARE px laden beim Auslösen mit neu (shareCd: eine Salve je Gruppe,
// über eine lange Reihe mehrere); und die Salve ersetzt die nächsten Pfeile (archerEnd: danach Nachladen für sie).
// Fix-Runde 1: SHARE 300 → 120 (bei 300 schoss eine Reihe von 80 Schützen in 30 s nur eine Salve: kaum sichtbar).
export const FIRE_ARROWS = { N: 3, GAP: .2, SHARE: 120 };
function archerReady(world, u) {
  const t = foeInReach(world, u, u.T.range, false);
  return !!t && t.type !== 'drache';
}
function archerStart(world, u) { shareCd(world, u, FIRE_ARROWS.SHARE); }
function archerUpdate(world, u) {
  const S = FIRE_ARROWS, t = foeInReach(world, u, u.T.range, false);
  if (!t) return true;
  faceTo(u, t.x, t.y);
  while (u.abK < S.N && u.abT >= u.abK * S.GAP - 1e-9) { fire(world, u, t, 'firearrow'); u.abK++; }
  return u.abK >= S.N;
}
// Die Salve ersetzt die nächsten Pfeile: danach lädt er für sie nach (sonst kämen N Pfeile obendrauf)
function archerEnd(world, u) { const c = (u.abK - 1) * u.T.cd; if (u.cd < c) u.cd = c; }

/* ---------- Sanitäter: Heilwelle ---------- */
// Alle Verbündeten (auch er selbst) bis R px um den Sanitäter bekommen FRAC ihrer max. LP (gedeckelt). Löst aus,
// wenn mindestens MIN Verletzte im Kreis sind. Heilungen treffen nur Verbündete (Festlegung 2).
export const HEAL_WAVE = { R: 90, FRAC: .25, MIN: 2 };
let HW_W = null, HW_U = null, HW_F = null, HW_N = 0, HW_DO = false;
function waveTest(v) {
  // Untote (Ghule) heilt sie nicht (data.UNDEAD)
  if (v.hp >= v.T.hp || factionOf(HW_W, v) !== HW_F || UNDEAD.has(v.type)) return;
  const dx = v.x - HW_U.x, dy = v.y - HW_U.y, R = HEAL_WAVE.R;
  if (dx * dx + dy * dy > R * R) return;
  HW_N++;
  if (HW_DO) {
    const hp = v.hp + HEAL_WAVE.FRAC * v.T.hp;
    v.hp = hp < v.T.hp ? hp : v.T.hp;
    emit(HW_W, { type: 'heal', x: v.x, y: v.y - v.T.r });
  }
}
// Verletzte Verbündete im Kreis zählen (apply: und heilen)
function healWave(world, u, apply) {
  HW_W = world; HW_U = u; HW_F = factionOf(world, u); HW_N = 0; HW_DO = apply;
  query(world, u.x, u.y, HEAL_WAVE.R, waveTest);
  HW_W = null; HW_U = null; HW_F = null;
  return HW_N;
}
const saniReady = (world, u) => healWave(world, u, false) >= HEAL_WAVE.MIN;
function saniStart(world, u) {
  healWave(world, u, true);
  emit(world, { type: 'ability', k: 'heal', x: u.x, y: u.y, z: u.z, R: HEAL_WAVE.R });
  sound(world, 'pop');
}

/* ---------- Soldat: Handgranate ---------- */
// Ein Bogenwurf 'bomb' (Schaden DMG, Splash R; trifft wie jede Explosion auch Eigene, Festlegung 2) auf das aktuelle
// Bodenziel, wenn es MIN_D bis RANGE px entfernt ist und an ihm mehr Feinde als Eigene im Umkreis R stehen.
// Eigene Soldaten bis SHARE px laden beim Wurf mit neu (shareCd; Fix-Runde 1: sonst warfen 80 Soldaten beim ersten
// Feindkontakt bis zu 30 Granaten in einer Sekunde).
export const GRENADE = { DMG: 24, R: 36, RANGE: 160, MIN_D: 50, SHARE: 80 };
function grenadeReady(world, u) {
  const t = foeInReach(world, u, GRENADE.RANGE, true);
  if (!t || (t.x - u.x) ** 2 + (t.y - u.y) ** 2 < GRENADE.MIN_D * GRENADE.MIN_D) return false;
  return groupScore(world, factionOf(world, u), t.x, t.y, GRENADE.R) >= 1;
}
function grenadeStart(world, u) {
  shareCd(world, u, GRENADE.SHARE);
  const t = u.tg;
  faceTo(u, t.x, t.y);
  fire(world, u, t, 'bomb', undefined, undefined, GRENADE.DMG, GRENADE.R);
  u.swingT = .25;   // Wurfbewegung (rig.js)
}

/* ---------- Mörser: Sperrfeuer ---------- */
// N Mörsergranaten im Abstand GAP s, jede auf einen Zufallspunkt bis SPREAD px um das Ziel (es wird verfolgt), mit
// Schaden und Splash des Mörsers (treffen auch Eigene). Nur auf Bodenziele ab MIN_D px (Mindestabstand) und mit mehr
// Feinden als Eigenen im Splash. Danach lädt er normal nach (u.cd).
export const BARRAGE = { N: 3, GAP: .4, SPREAD: 30, MIN_D: 90 };
function barrageReady(world, u) {
  const t = foeInReach(world, u, u.T.range, true);
  if (!t || (t.x - u.x) ** 2 + (t.y - u.y) ** 2 < BARRAGE.MIN_D * BARRAGE.MIN_D) return false;
  if (groupScore(world, factionOf(world, u), t.x, t.y, u.T.splash) < 1) return false;
  u.abX = t.x; u.abY = t.y;
  return true;
}
function barrageUpdate(world, u) {
  const S = BARRAGE;
  let t = u.tg;
  if (t && t.alive && factionOf(world, t) !== factionOf(world, u)) { u.abX = t.x; u.abY = t.y; } else t = null;
  faceTo(u, u.abX, u.abY);
  while (u.abK < S.N && u.abT >= u.abK * S.GAP - 1e-9) {
    if (!t) return true;
    const a = world.rng() * TAU, r = S.SPREAD * Math.sqrt(world.rng());
    fire(world, u, t, 'mortar', u.abX + Math.cos(a) * r, u.abY + Math.sin(a) * r);
    u.abK++;
  }
  return u.abK >= S.N;
}
function barrageEnd(world, u) { if (u.cd < u.T.cd) u.cd = u.T.cd; }

/* ---------- Panzer: Ramme ---------- */
// T s lang mit SPEED-fachem Tempo geradeaus in Richtung des Ziels (fest beim Start, u.abX/u.abY). Jeder Bodenkörper,
// den er vorn oder seitlich berührt (Abstand < beide Radien + PAD) und der nicht schon fliegt, wird schräg nach vorn
// zur Seite geschleudert (combat.fling, Tempo PUSH unabhängig von der Masse); nur Feinde nehmen DMG Schaden
// (Festlegung 2). Wer fliegt, wird nicht noch einmal getroffen. Löst aus bei einem Bodenziel MIN_D bis RANGE px
// entfernt, wenn auf der ganzen Rammstrecke keine Mauer, keine Lava und kein Kartenrand liegt.
export const RAM = { T: 1.2, SPEED: 3, DMG: 20, RANGE: 170, MIN_D: 50, PUSH: 260, PAD: 4 };
function ramPathFree(world, u, nx, ny) {
  const L = u.T.speed * RAM.SPEED * RAM.T + u.T.r, { GW, terr, W, H } = world;
  for (let s = 0; s <= L; s += CELL / 2) {
    const x = u.x + nx * s, y = u.y + ny * s;
    if (x < 6 || y < 6 || x > W - 6 || y > H - 6) return false;
    if (TERR_HAZ[terr[((y / CELL) | 0) * GW + ((x / CELL) | 0)]]) return false;
  }
  return true;
}
function ramReady(world, u) {
  const t = foeInReach(world, u, RAM.RANGE, true);
  if (!t) return false;
  const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy);
  if (d < RAM.MIN_D || !ramPathFree(world, u, dx / d, dy / d)) return false;
  u.abX = dx / d; u.abY = dy / d;
  return true;
}
function ramStart(world, u) {
  emit(world, { type: 'ability', k: 'ram', x: u.x, y: u.y, z: 0, R: u.T.r, nx: u.abX, ny: u.abY });
  sound(world, 'impact');
}
let RM_W = null, RM_U = null, RM_F = null;
function ramTest(v) {
  const u = RM_U;
  if (v === u || v.T.fly || v.state === 'air') return;
  const dx = v.x - u.x, dy = v.y - u.y, rr = u.T.r + v.T.r + RAM.PAD;
  if (dx * dx + dy * dy > rr * rr) return;
  const nx = u.abX, ny = u.abY;
  if (dx * nx + dy * ny < -.3 * u.T.r) return;   // hinter dem Panzer
  const c = nx * dy - ny * dx, s = c > 1e-6 ? 1 : c < -1e-6 ? -1 : (v.id % 2 ? 1 : -1);
  const ex = nx * .6 - ny * s, ey = ny * .6 + nx * s;
  fling(v, ex, ey, Math.hypot(ex, ey), (v.T.mass || 1) * RAM.PUSH);
  if (factionOf(RM_W, v) !== RM_F) {
    hurt(RM_W, v, RAM.DMG, 'melee', u);
    emit(RM_W, { type: 'hit', x: v.x, y: v.y, flank: false, kind: 'melee', shake: 2 });
  }
}
function ramUpdate(world, u) {
  if (u.abT >= RAM.T) return true;
  const sp = u.T.speed * RAM.SPEED;
  u.mx = u.abX * sp; u.my = u.abY * sp;
  u.face = u.abX < 0 ? -1 : 1; u.fx = u.abX; u.fy = u.abY;
  RM_W = world; RM_U = u; RM_F = factionOf(world, u);
  query(world, u.x, u.y, u.T.r + MAX_R + RAM.PAD, ramTest);
  RM_W = null; RM_U = null; RM_F = null;
  return false;
}

/* ---------- Wolf: Heulen ---------- */
// Ab MIN Wölfen der eigenen Fraktion bis R px (er selbst mitgezählt), mit einem Ziel bis ENGAGE px: alle diese Wölfe
// bekommen T s lang Tempo ×SPEED und Biss ×DMG (u.buffT, u.spdMul, u.dmgMul; combat.think lässt es ablaufen). Das
// ganze Rudel lädt danach neu (Abklingzeit der Mitglieder mindestens cd, wie die Herde in Festlegung 4), sonst
// heulte reihum immer ein anderer und das Rudel wäre dauernd verstärkt. Ein verstärkter Wolf heult nicht.
export const HOWL = { R: 120, T: 5, SPEED: 1.3, DMG: 1.3, MIN: 3, ENGAGE: 220 };
let PK_W = null, PK_U = null, PK_F = null, PK_N = 0, PK_DO = false;
function packTest(v) {
  if (v.type !== 'wolf' || factionOf(PK_W, v) !== PK_F) return;
  const dx = v.x - PK_U.x, dy = v.y - PK_U.y, R = HOWL.R;
  if (dx * dx + dy * dy > R * R) return;
  PK_N++;
  if (PK_DO) {
    v.buffT = HOWL.T; v.spdMul = HOWL.SPEED; v.dmgMul = HOWL.DMG;
    const cd = ABILITY.wolf.cd;
    if (v !== PK_U && !v.abOn && v.abCd < cd) v.abCd = cd;
  }
}
function pack(world, u, apply) {
  PK_W = world; PK_U = u; PK_F = factionOf(world, u); PK_N = 0; PK_DO = apply;
  query(world, u.x, u.y, HOWL.R, packTest);
  PK_W = null; PK_U = null; PK_F = null;
  return PK_N;
}
function howlReady(world, u) {
  return !(u.buffT > 0) && !!foeInReach(world, u, HOWL.ENGAGE, false) && pack(world, u, false) >= HOWL.MIN;
}
function howlStart(world, u) {
  pack(world, u, true);
  emit(world, { type: 'ability', k: 'howl', x: u.x, y: u.y - u.T.r, z: u.z, R: HOWL.R, face: u.face });
}

/* ---------- Bär: Brüllen ---------- */
// Alle Feinde bis R px (Mitte zu Mitte), die nicht schon fliehen und nicht furchtlos sind (FEARLESS), erschrecken
// T s (scare, Festlegung 1). Löst aus ab MIN solchen Feinden. Schreck trifft nur Feinde (Festlegung 2).
export const ROAR = { R: 80, T: 2, MIN: 2 };
let RO_W = null, RO_U = null, RO_F = null, RO_N = 0, RO_DO = false;
function roarTest(v) {
  if (FEARLESS.has(v.type) || isFleeing(v) || factionOf(RO_W, v) === RO_F) return;
  const dx = v.x - RO_U.x, dy = v.y - RO_U.y, R = ROAR.R;
  if (dx * dx + dy * dy > R * R) return;
  RO_N++;
  if (RO_DO) { scare(RO_W, v, ROAR.T); emit(RO_W, { type: 'fear', x: v.x, y: v.y - v.T.r, z: v.z }); }
}
function roar(world, u, apply) {
  RO_W = world; RO_U = u; RO_F = factionOf(world, u); RO_N = 0; RO_DO = apply;
  query(world, u.x, u.y, ROAR.R, roarTest);
  RO_W = null; RO_U = null; RO_F = null;
  return RO_N;
}
const roarReady = (world, u) => roar(world, u, false) >= ROAR.MIN;
function roarStart(world, u) {
  roar(world, u, true);
  u.swingT = .25;
  emit(world, { type: 'ability', k: 'roar', x: u.x, y: u.y, z: 0, R: ROAR.R, shake: 3 });
  sound(world, 'thud');
}

/* ---------- Geist: Spuk ---------- */
// Das aktuelle Ziel bis RANGE px (nicht furchtlos, flieht noch nicht) erschrickt T s; der Geist sucht sich danach
// gleich ein neues Ziel (der Erschreckte zählt jetzt doppelt so weit, world.nearestEnemy).
export const SPOOK = { T: 2.5, RANGE: 120 };
function spookReady(world, u) {
  const t = foeInReach(world, u, SPOOK.RANGE, false);
  return !!t && !FEARLESS.has(t.type) && !isFleeing(t);
}
function spookStart(world, u) {
  const t = u.tg;
  scare(world, t, SPOOK.T);
  emit(world, { type: 'fear', x: t.x, y: t.y - t.T.r, z: t.z });
  emit(world, { type: 'ability', k: 'spook', x: t.x, y: t.y, z: t.z, R: t.T.r });
  sound(world, 'whoosh');
  u.tg = null; u.rt = 0;
}

/* ---------- Drache: Sturzflug ---------- */
// Auf ein Bodenziel bis RANGE px, um das mindestens MIN Feinde und mehr Feinde als Eigene (Boden) im Kreis R stehen:
// Phase 0 (u.abK) fliegt er mit höchstens V px/s zum Zielpunkt (u.abX/u.abY, beim Start) und sinkt erst, wenn der
// Restweg nicht länger dauert als das Sinken auf Z (Flughöhe u.fz, physics.FLY_VZ): so setzt er am Zielpunkt auf, nicht
// davor (Fix-Runde 1). Unten (Notfall: nach FALL_MAX s sinkt er, wo er ist) Aufschlag: jeder Bodenkörper im Kreis R wird
// weggeschleudert (combat.fling, Stoß I · Abfall wie bei Explosionen), nur Feinde nehmen DMG Schaden (Festlegung 2).
// Phase 1 hält er HOLD s am Boden (abT beginnt beim Aufschlag neu), Phase 2 steigt er auf T.flyZ und ist fertig,
// sobald er oben ist. Beim Abbruch steigt er weich zurück (end setzt u.fz).
export const DIVE = { Z: 6, R: 90, DMG: 30, I: 500, V: 160, HOLD: .25, RANGE: 160, MIN: 3, FALL_MAX: 2 };
let DV_W = null, DV_U = null, DV_F = null, DV_X = 0, DV_Y = 0, DV_FOE = 0, DV_OWN = 0;
function diveCount(v) {
  if (v.T.fly) return;
  const dx = v.x - DV_X, dy = v.y - DV_Y, R = DIVE.R;
  if (dx * dx + dy * dy > R * R) return;
  if (factionOf(DV_W, v) === DV_F) DV_OWN++; else DV_FOE++;
}
function diveReady(world, u) {
  const t = foeInReach(world, u, DIVE.RANGE, true);
  if (!t) return false;
  DV_W = world; DV_F = factionOf(world, u); DV_X = t.x; DV_Y = t.y; DV_FOE = 0; DV_OWN = 0;
  query(world, t.x, t.y, DIVE.R, diveCount);
  DV_W = null; DV_F = null;
  if (DV_FOE < DIVE.MIN || DV_FOE <= DV_OWN) return false;
  u.abX = t.x; u.abY = t.y;
  return true;
}
function diveStart(world, u) { sound(world, 'whoosh'); }
function slamTest(v) {
  const u = DV_U;
  if (v === u || v.T.fly) return;
  const dx = v.x - u.x, dy = v.y - u.y, d = Math.hypot(dx, dy), R = DIVE.R;
  if (d > R + v.T.r) return;
  fling(v, dx, dy, d, DIVE.I * (1 - .5 * Math.min(1, d / R)));
  if (factionOf(DV_W, v) !== DV_F) hurt(DV_W, v, DIVE.DMG, 'blast', u);
}
function slam(world, u) {
  DV_W = world; DV_U = u; DV_F = factionOf(world, u);
  query(world, u.x, u.y, DIVE.R + MAX_R, slamTest);
  DV_W = null; DV_U = null; DV_F = null;
  emit(world, { type: 'ability', k: 'dive', x: u.x, y: u.y, z: 0, R: DIVE.R, shake: 7 });
  sound(world, 'impact');
}
function diveUpdate(world, u, dt) {
  if (u.abK === 0) {
    const dx = u.abX - u.x, dy = u.abY - u.y, d = Math.hypot(dx, dy);
    if (d > 1) {
      const sp = dt > 0 ? Math.min(DIVE.V, d / dt) : DIVE.V;
      u.mx = dx / d * sp; u.my = dy / d * sp; u.face = dx < 0 ? -1 : 1; u.fx = dx / d; u.fy = dy / d;
    }
    // sinken, sobald der Restweg in der Sinkzeit zu schaffen ist (oder im Notfall)
    if (d / DIVE.V <= (u.z - DIVE.Z) / FLY_VZ + dt || u.abT > DIVE.FALL_MAX) u.fz = DIVE.Z;
    if (u.z <= DIVE.Z + 1e-6) { slam(world, u); u.abK = 1; u.abT = 0; u.mx = 0; u.my = 0; }
    return false;
  }
  if (u.abK === 1) {
    if (u.abT >= DIVE.HOLD) { u.fz = u.T.flyZ; u.abK = 2; }
    return false;
  }
  return u.z >= u.T.flyZ - 1e-9;
}
function diveEnd(world, u) { u.fz = u.T.flyZ; }

/* ---------- Vampir und Ghul (Spez. #32, Festlegung 1 und 3, Task 4) ----------
   Keine ABILITY: die Fledermausform ist die Flucht selbst (Festlegung 1), und Fliehende lösen keine Fähigkeit aus.
   combat.think führt sie im Rückzugszweig (immer Fledermaus) und in der Bewegung (Weg zum Ziel) über stepBat.
   Lebensraub (combat.attack): ein Biss heilt um HEAL · Schaden (ohne Überschuss über die LP des Opfers), gedeckelt.
   Fledermausform: beginnt, wenn das Ziel weiter als BAT_START px entfernt ist oder der Vampir flieht (morale.isFleeing);
   endet, wenn er nicht flieht und das Ziel höchstens BAT_END px entfernt ist (oder er keins hat). Verwandlung MORPH s
   in jede Richtung, mit Wölkchen (vamp-Ereignis 'bat'); dabei steht er. Ganz verwandelt ist u.T = data.BAT_FORM (fliegt
   in 22 px Höhe, doppeltes Tempo): Nahkämpfer am Boden erreichen ihn nicht (world.outOfMelee), er beißt nicht, Fernkampf
   und Feuer treffen ihn. Zum Zusammensetzen sinkt er auf den Boden (u.fz 0), am Ende ist u.T wieder UNITS.vampir.
   Ghule: der tödliche Biss (Schadensart 'melee' vom Vampir, nicht in Fledermausform) lässt das Opfer als Ghul im Team
   (und in der Art, world.factionOf) des Vampirs aufstehen, am Ort des Opfers und ohne Leiche, solange der Vampir weniger
   als MAX_GHOULS lebende Ghule hat. Nie aus NO_GHOUL (Ghul, Frosch, Bosse) und nie aus Fliegern; sonst bleibt die normale
   Leiche. Der Ghul steht RISE s lang auf (riseT, ohne Handlung), verliert DECAY seiner max. LP je s und zerfällt bei 0
   (crumble: ohne Leiche, Staubwölkchen); stirbt sein Vampir, zerfallen alle seine Ghule sofort. Ghule fliehen nicht
   (hirnlos, morale.updateMorale) und werden nicht geheilt (data.UNDEAD). */
export const VAMPIRE = { HEAL: .5, BAT_START: 220, BAT_END: 40, MORPH: .3, BAT_Z: BAT_FORM.flyZ, MAX_GHOULS: 3 };
export const GHOUL = { DECAY: .04, RISE: .6 };
export const NO_GHOUL = new Set(['ghul', 'frosch', 'panzer', 'heli', 'drache', 'elefant']);
// Ergebnis von stepBat: kein Fledermaus-Schritt (normales Verhalten), Verwandlung (steht), Fledermaus (Aufrufer bewegt)
export const BAT_NONE = 0, BAT_MORPH = 1, BAT_FLY = 2;

// Ein Schritt Fledermausform für den Vampir u; want: soll Fledermaus sein.
export function stepBat(world, u, dt, want) {
  if (want !== u.batOn) {
    if (want || u.batT > 0) emit(world, { type: 'vamp', k: 'bat', x: u.x, y: u.y, z: u.z });
    u.batOn = want;
    if (!want && u.batT > 0) u.fz = 0;   // sinkt zum Zusammensetzen
  }
  if (u.batOn) {
    if (u.batT >= 1) return BAT_FLY;
    u.batT += dt / VAMPIRE.MORPH; u.mx = 0; u.my = 0;
    if (u.batT >= 1) { u.batT = 1; u.T = BAT_FORM; u.fz = BAT_FORM.flyZ; }
    return BAT_MORPH;
  }
  if (u.batT <= 0) return BAT_NONE;
  u.batT -= dt / VAMPIRE.MORPH; u.mx = 0; u.my = 0;
  if (u.batT <= 0) { u.batT = 0; u.T = UNITS.vampir; u.fz = 0; u.z = 0; u.vz = 0; }
  return BAT_MORPH;
}

// Tötet der Biss des Vampirs src das Opfer v (combat.die, Schadensart 'melee'): Ghul statt Leiche? Legt ihn an und liefert true.
export function riseGhoul(world, v, src) {
  if (!src || src.type !== 'vampir' || !src.alive || src.batT > 0 || src.ghouls >= VAMPIRE.MAX_GHOULS) return false;
  if (NO_GHOUL.has(v.type) || v.T.fly || factionOf(world, v) === factionOf(world, src)) return false;
  const g = spawn(world, 'ghul', v.x, v.y, src.team);
  g.kin = src.kin; g.owner = src; g.face = v.face; g.riseT = GHOUL.RISE;
  src.ghouls++;
  emit(world, { type: 'vamp', k: 'rise', x: v.x, y: v.y, team: src.team });
  return true;
}

// Ein Schritt Ghul (combat.think, in jedem Zustand wie der Brand): Zerfall, Aufstehen. Liefert true, wenn der Schritt damit
// erledigt ist (zerfallen oder steht noch auf).
export function stepGhoul(world, u, dt) {
  u.hp -= GHOUL.DECAY * u.T.hp * dt;
  if (u.hp <= 1e-6) { crumble(world, u); return true; }
  if (u.riseT > 0) { u.riseT = u.riseT > dt ? u.riseT - dt : 0; u.mx = 0; u.my = 0; return true; }
  return false;
}

// Ghul zerfällt (Zerfall oder Tod seines Vampirs): ohne Leiche und ohne Abschuss, Staubwölkchen; zählt als Verlust (death)
export function crumble(world, g) {
  if (!g.alive) return;
  g.alive = false; world.dead = (world.dead || 0) + 1;
  if (g.owner !== null) { g.owner.ghouls--; g.owner = null; }
  emit(world, { type: 'vamp', k: 'crumble', x: g.x, y: g.y });
  emit(world, { type: 'death', x: g.x, y: g.y, z: g.z, unitType: g.type, team: g.team, killerId: null, killerType: null,
    killerTeam: null, killerKills: null, crumble: true });
}
// Eine Einheit verlässt die Schlacht (Tod in combat.die, Radierer und Rückgängig in paint.js): ein Ghul meldet sich bei
// seinem Vampir ab (der darf wieder einen haben), die Ghule eines Vampirs zerfallen.
export function releaseUnit(world, v) {
  if (v.owner !== null) { v.owner.ghouls--; v.owner = null; }
  if (v.ghouls > 0) crumbleGhouls(world, v);
}
// Alle lebenden Ghule des Vampirs v zerfallen (sein Tod, combat.die)
export function crumbleGhouls(world, v) {
  const us = world.units;
  for (let i = 0; i < us.length; i++) if (us[i].owner === v) crumble(world, us[i]);
  v.ghouls = 0;
}

/* ---------- Tabelle ---------- */
export const ABILITY = {
  heli: { cd: 25, ready: heliReady, start: nothing, update: heliUpdate },
  schuetze: { cd: 30, ready: archerReady, start: archerStart, update: archerUpdate, end: archerEnd },
  sani: { cd: 20, ready: saniReady, start: saniStart, update: done },
  soldat: { cd: 15, ready: grenadeReady, start: grenadeStart, update: done },
  moerser: { cd: 30, ready: barrageReady, start: nothing, update: barrageUpdate, end: barrageEnd },
  panzer: { cd: 25, ready: ramReady, start: ramStart, update: ramUpdate },
  wolf: { cd: 25, ready: howlReady, start: howlStart, update: done },
  baer: { cd: 20, ready: roarReady, start: roarStart, update: done },
  geist: { cd: 15, ready: spookReady, start: spookStart, update: done },
  drache: { cd: 30, ready: diveReady, start: diveStart, update: diveUpdate, end: diveEnd },
};
