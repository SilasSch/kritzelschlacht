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
// --- Task 6: Kreaturen --- (nur in Funktionen gelesen, siehe Importkreis oben)
import { nearestEnemy } from './world.js';
import { ignite } from './combat.js';
import { hazardAt } from './formation.js';
// --- Task 5: Tiere ---
import { TERRAIN, RANGED } from './data.js';
import { cellIndex, unseen, EAGLE_REACH_Z } from './world.js';
import { applyImpulse, GRAVITY, GROUND_FRICTION } from './physics.js';

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
// Ghule sind hirnlos (Festlegung 3): sie erschrecken nicht.
export function scare(world, v, sec) {
  if (!v.alive || !(sec > 0) || v.type === 'ghul' || v.type === 'frosch' || v.ashT > 0) return;   // Frosch und Asche (Task 6) erschrecken nicht: ihr Schreck liefe nie ab (kein updateMorale)
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
  if (factionOf(Q_W, v) === Q_F || (v.hidden && unseen(Q_U, v))) return;   // Task 5: verstecktes Krokodil
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
// Task 7: SHARE 120 → 200, ein Mittelweg zwischen sichtbaren Salven und dem Konter roemer > schuetze (mit 120 an
// einzelnen Formen 1–2/4; mit 200 und Römern zu 100 LP an allen Formen mindestens 3/4).
export const FIRE_ARROWS = { N: 3, GAP: .2, SHARE: 200 };
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
// Gruppen-Abklingzeit wie die Brandpfeile (Nachtrag 4, #38): eigene Sanitäter bis SHARE px laden beim Auslösen mit neu
// (shareCd), damit viele Sanitäter nicht mehrere Wellen zugleich auf dieselben Verbündeten legen.
export const HEAL_WAVE = { R: 90, FRAC: .25, MIN: 2, SHARE: 120 };
let HW_W = null, HW_U = null, HW_F = null, HW_N = 0, HW_DO = false;
function waveTest(v) {
  // Untote (Ghule) heilt sie nicht (data.UNDEAD), die Asche des Phönix (Task 6) auch nicht
  if (v.hp >= v.T.hp || v.ashT > 0 || factionOf(HW_W, v) !== HW_F || UNDEAD.has(v.type)) return;
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
  shareCd(world, u, HEAL_WAVE.SHARE);
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
  if (FEARLESS.has(v.type) || v.type === 'frosch' || v.ashT > 0 || isFleeing(v) || factionOf(RO_W, v) === RO_F) return;
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
  if (v.grabbed !== null) dropGrabbed(v);   // Task 5: ein Gorilla lässt fallen, was er hält
}
// Alle lebenden Ghule des Vampirs v zerfallen (sein Tod, combat.die)
export function crumbleGhouls(world, v) {
  const us = world.units;
  for (let i = 0; i < us.length; i++) if (us[i].owner === v) crumble(world, us[i]);
  v.ghouls = 0;
}

/* ---------- Task 6: Kreaturen (Spez. #34; Festlegung 1, 3, 6 und 7) ----------
   Troll, Zyklop, Hexe, Phönix, Einhorn und der Frosch (nicht malbar). Eine ABILITY hat nur die Hexe (Froschfluch); alles
   andere ist ständig da und läuft aus combat.think (stepTroll, stepTrail, stepAura in jedem Zustand wie der Brand; stepAsh
   und stepFrog statt des normalen Verhaltens). Felsbrocken und Hexenzauber fliegen als Geschosse (combat.PROJECTILES). */

// Troll: heilt REGEN seiner max. LP je s. Jeder Feuertreffer (isFire, auch der Brand über Zeit; combat.hurt) setzt
// u.noHealT = NO_HEAL: so lange keine Heilung (Festlegung 7).
export const TROLL = { REGEN: .03, NO_HEAL: 4 };
export function stepTroll(u, dt) {
  if (u.noHealT > 0) { u.noHealT = u.noHealT > dt ? u.noHealT - dt : 0; return; }
  const T = u.T;
  if (u.hp < T.hp) { const h = u.hp + TROLL.REGEN * T.hp * dt; u.hp = h < T.hp ? h : T.hp; }
}

// Zyklop (combat.js): Felsbrocken 'boulder' im Bogen, am Landepunkt eine Explosion mit Radius R (Schaden wie blast, trifft
// auch Eigene, Festlegung 2; als Explosion halten Römerschilde sie nicht ab) und DEBRIS Trümmerbrocken ohne Schaden
// (world.debris, Festlegung 5). Feinde näher als MIN_D: unbeholfener Nahkampf, Abklingzeit ×MELEE_CD, Schaden ×MELEE_DMG,
// Reichweite MELEE px (Rand zu Rand); dazwischen geht er auf sie zu.
export const CYCLOPS = { R: UNITS.zyklop.splash, MIN_D: 70, MELEE: 4, MELEE_CD: 2, MELEE_DMG: .5, DEBRIS: 2 };

// Hexe: Zauber 'hex' (combat.js, gerade, grünlich, kein Feuer, Schaden UNITS.hexe.dmg). Froschfluch (ABILITY, Abklingzeit
// CD): ihr aktuelles Ziel in Reichweite wird T s lang zum Frosch (curseFrog). Der Frosch behält die LP und das Team (u.kin:
// auch jeder gegen jeden), greift nicht an und hüpft vor dem nächsten Feind weg (stepFrog: HOP_HZ Sprünge je s, je Sprung
// den Anteil HOP der Zeit in Bewegung, Feinde bis FLEE_R px, neue Suche alle LOOK_T s). Danach ist er wieder er selbst
// (endFrog), LP höchstens seine max. LP. Immun (FROG_IMMUNE): Panzer, Hubschrauber, Drache, Elefant, Ghul; dazu Frösche
// und die Asche des Phönix.
export const FROG = { T: 5, CD: 14, HOP_HZ: 1.6, HOP: .45, FLEE_R: 180, LOOK_T: .5 };
export const FROG_IMMUNE = new Set(['panzer', 'heli', 'drache', 'elefant', 'ghul']);
export const canCurse = v => v.alive && !(v.ashT > 0) && v.type !== 'frosch' && !FROG_IMMUNE.has(v.type);

// Zählt u wieder zum Schwerpunkt seiner Fraktion (wie morale.endFlee), wenn es floh oder erschreckt war
function unflee(world, u) {
  if (isFleeing(u)) { const c = world.cent.get(factionOf(world, u)); if (c) c.n++; }
  u.flee = false; u.fearT = 0; u.safeT = 0; u.cornerT = 0;
}

// Froschfluch auf v für sec s (Typwechsel u.type/u.T, alter Typ in u.frogFrom). Vorher: laufende Fähigkeit abbrechen (mit
// end), Römerblock verlassen (kein Schild, Vorgabe 1), Schreck und Flucht enden, Fledermausform, Meteor-Kanal, Liegen,
// Durchritt und Verstärkung enden. Ein Flieger fällt als Frosch aus seiner Höhe (landet betäubt). Liefert true, wenn verwandelt.
export function curseFrog(world, v, sec = FROG.T) {
  if (!canCurse(v)) return false;
  cancelAbility(world, v);
  leaveBlock(v);
  unflee(world, v);
  v.batT = 0; v.batOn = false; v.chanId = 0;
  v.stance = 'stand'; v.stanceT = 0; v.st = 0; v.buffT = 0; v.spdMul = 1; v.dmgMul = 1;
  if (v.T.fly && v.z > 0 && v.state === 'ok') { v.state = 'air'; v.vz = 0; v.peakZ = v.z; v.bounced = true; v.impact = 0; }
  v.frogFrom = v.type; v.frogT = sec; v.type = 'frosch'; v.T = UNITS.frosch; v.fz = 0;
  v.hidden = false;   // ein verstecktes Krokodil (stepAnimal setzt hidden nur für Krokodile) bliebe sonst als Frosch unsichtbar
  v.tg = null; v.rt = 0; v.mx = 0; v.my = 0; v.swingT = 0;
  emit(world, { type: 'creature', k: 'frog', x: v.x, y: v.y, z: v.z });
  return true;
}
// Der Frosch wird wieder er selbst (Ablauf oder Tod des verwandelten Phönix): Typ zurück, LP gedeckelt, Flieger steigen auf
export function endFrog(world, u) {
  const T = UNITS[u.frogFrom];
  u.type = u.frogFrom; u.T = T; u.frogFrom = null; u.frogT = 0;
  if (u.hp > T.hp) u.hp = T.hp;
  u.fz = T.flyZ || 0;
  if (T.fly && u.state !== 'ok') { u.state = 'ok'; u.stunT = 0; u.vz = 0; }
  u.tg = null; u.rt = 0;
  emit(world, { type: 'creature', k: 'unfrog', x: u.x, y: u.y, z: u.z });
}
// Restzeit des Fluchs (combat.think, in jedem Zustand)
export function stepFrogCurse(world, u, dt) {
  // die Sperre der Troll-Heilung (nur Trolle setzen noHealT) läuft auch als Frosch ab, wie sonst in stepTroll
  if (u.noHealT > 0) u.noHealT = u.noHealT > dt ? u.noHealT - dt : 0;
  u.frogT -= dt;
  if (u.frogT <= 0) endFrog(world, u);
}
// Verhalten des Froschs (statt Moral, Fähigkeit und Angriff): hüpft vom nächsten Feind weg, nie auf Lava oder Mauer
export function stepFrog(world, u, dt) {
  if (u.rt <= 0) { u.tg = nearestEnemy(world, u); u.rt = FROG.LOOK_T + (u.id % 4) * .05; }
  const t = u.tg;
  if (!t || !t.alive) return;
  const dx = u.x - t.x, dy = u.y - t.y, d = Math.hypot(dx, dy) || 1;
  u.face = dx < 0 ? 1 : -1;   // schaut den Feind an
  if (d > FROG.FLEE_R) return;
  const ph = world.time * FROG.HOP_HZ + u.seed;
  if (ph - Math.floor(ph) >= FROG.HOP) return;
  const nx = dx / d, ny = dy / d;
  if (hazardAt(world, u.x + nx * 12, u.y + ny * 12)) return;
  const sp = u.T.speed * 2;
  u.mx = nx * sp; u.my = ny * sp; u.run += dt;
}

function hexReady(world, u) {
  const t = foeInReach(world, u, u.T.range, false);
  // stepAbility läuft vor der Neuwahl in combat.think: ein inzwischen abgetauchtes Krokodil (Task 5) nicht verfluchen
  return !!t && canCurse(t) && !(t.hidden && unseen(u, t));
}
function hexStart(world, u) {
  const t = u.tg;
  faceTo(u, t.x, t.y);
  emit(world, { type: 'creature', k: 'curse', x: u.x, y: u.y, z: u.z, tx: t.x, ty: t.y, tz: t.z });
  curseFrog(world, t, FROG.T);
  u.fireT = 0;
  sound(world, 'pop');
}

// Phönix: beim ersten Tod (combat.hurt) wird er zu Asche statt zu sterben: ASH_T s am Boden, unverwundbar (hurt), nicht
// anvisierbar (world.nearestEnemy, combat.cast) und lebendig (zählt für Sieg, Missionsende und facCount, Festlegung 6).
// Dann steht er mit HP seiner max. LP wieder auf (u.reborn); der zweite Tod ist endgültig. Auch ein verwandelter Phönix
// (Frosch) wird beim ersten Tod zur Asche. Feuerspur: alle TRAIL_DT s im Flug trifft er feindliche Bodentruppen bis
// TRAIL_R px (plus ihr Radius) mit TRAIL_DMG Schaden 'phoenix' (Feuer) und zündet sie an (Generation TRAIL_GEN: das Feuer
// springt höchstens einmal weiter). Er selbst fängt kein Feuer (combat.ignite).
export const PHOENIX = { ASH_T: 2, HP: .5, TRAIL_DT: .25, TRAIL_R: 16, TRAIL_DMG: 2, TRAIL_GEN: 2 };
const unburn = u => { u.burnT = 0; u.burnGen = 0; u.burnSrc = null; u.burnCk = 0; };
export function phoenixAsh(world, v) {
  if (v.reborn || v.ashT > 0 || (v.type !== 'phoenix' && v.frogFrom !== 'phoenix')) return false;
  if (v.frogFrom !== null) endFrog(world, v);
  cancelAbility(world, v);
  unflee(world, v);
  unburn(v);
  v.hp = 0; v.ashT = PHOENIX.ASH_T; v.fz = 0; v.mx = 0; v.my = 0; v.tg = null; v.hitT = 0;
  emit(world, { type: 'creature', k: 'ash', x: v.x, y: v.y, z: v.z });
  sound(world, 'fire');
  return true;
}
// Ein Schritt Asche (combat.think, vor allem anderen): liegt still, steht nach ASH_T s wieder auf
export function stepAsh(world, u, dt) {
  u.mx = 0; u.my = 0;
  u.ashT -= dt;
  if (u.ashT > 0) return;
  u.ashT = 0; u.reborn = true; u.hp = PHOENIX.HP * u.T.hp; u.fz = u.T.flyZ;
  u.abOn = false; u.abT = 0; u.abK = 0;
  unflee(world, u);
  unburn(u);
  u.rt = 0; u.cd = 0; u.tg = null;
  emit(world, { type: 'creature', k: 'rise', x: u.x, y: u.y, z: u.z });
  sound(world, 'whoosh');
}
let TR_W = null, TR_U = null, TR_F = null;
function trailTest(v) {
  if (v.T.fly || v.ashT > 0 || factionOf(TR_W, v) === TR_F) return;
  const dx = v.x - TR_U.x, dy = v.y - TR_U.y, R = PHOENIX.TRAIL_R + v.T.r;
  if (dx * dx + dy * dy > R * R) return;
  hurt(TR_W, v, PHOENIX.TRAIL_DMG, 'phoenix', TR_U, true);
  if (v.alive) ignite(TR_W, v, PHOENIX.TRAIL_GEN, TR_U);
}
// Feuerspur (combat.think, in jedem Zustand): nur im Flug (seit dem letzten Schritt bewegt, u.px/u.py aus physics.integrate)
export function stepTrail(world, u, dt) {
  if (u.ashT > 0 || u.state !== 'ok') return;
  u.trailT -= dt;
  if (u.trailT > 0) return;
  u.trailT = u.trailT + PHOENIX.TRAIL_DT > 0 ? u.trailT + PHOENIX.TRAIL_DT : PHOENIX.TRAIL_DT;
  const mx = u.x - u.px, my = u.y - u.py;
  if (!(mx * mx + my * my > .04)) return;
  TR_W = world; TR_U = u; TR_F = factionOf(world, u);
  query(world, u.x, u.y, PHOENIX.TRAIL_R + MAX_R, trailTest);
  TR_W = null; TR_U = null; TR_F = null;
  emit(world, { type: 'creature', k: 'trail', x: u.x, y: u.y, z: u.z });
}

// Einhorn: Sturmlauf wie der Reiter, aber geradeaus mit dem Horn voran (combat.attack): der Stoß aus vollem Lauf macht
// CHARGE-fachen Schaden, stößt das Ziel mit PUSH zurück, und es läuft THROUGH s durch. Heilaura: alle AURA_DT s bekommen
// verletzte Verbündete bis AURA_R px (Mitte zu Mitte, ohne das Einhorn selbst) AURA_HP · AURA_DT LP (gedeckelt); Untote
// (Ghule, data.UNDEAD) nicht, Heilungen nur Verbündete (Festlegung 2). Ein Glitzern zeigt sie etwa alle 2 s.
export const UNICORN = { CHARGE: 1.5, PUSH: 200, THROUGH: .6, AURA_R: 70, AURA_HP: 2, AURA_DT: .5 };
let AU_W = null, AU_U = null, AU_F = null, AU_N = 0;
function auraTest(v) {
  if (v === AU_U || v.hp >= v.T.hp || v.ashT > 0 || UNDEAD.has(v.type) || factionOf(AU_W, v) !== AU_F) return;
  const dx = v.x - AU_U.x, dy = v.y - AU_U.y, R = UNICORN.AURA_R;
  if (dx * dx + dy * dy > R * R) return;
  // Task 7: Auren stapeln nicht (die Karte sagt 2 LP je s): höchstens eine Heilung je AURA_DT s, auch neben mehreren
  // Einhörnern. Gestapelt heilte ein Pulk aus 20 Einhörnern jedes um bis zu 12 % LP je s und gewann vier Missionen allein.
  if (v.auraAt > AU_W.time - UNICORN.AURA_DT + 1e-3) return;
  v.auraAt = AU_W.time;
  const h = v.hp + UNICORN.AURA_HP * UNICORN.AURA_DT;
  v.hp = h < v.T.hp ? h : v.T.hp;
  AU_N++;
}
// Ein Schritt Heilaura (combat.think, in jedem Zustand)
export function stepAura(world, u, dt) {
  u.auraT -= dt;
  if (u.auraT > 0) return;
  u.auraT = u.auraT + UNICORN.AURA_DT > 0 ? u.auraT + UNICORN.AURA_DT : UNICORN.AURA_DT;
  AU_W = world; AU_U = u; AU_F = factionOf(world, u); AU_N = 0;
  query(world, u.x, u.y, UNICORN.AURA_R, auraTest);
  AU_W = null; AU_U = null; AU_F = null;
  if (AU_N > 0 && (u.id + Math.round(world.time / UNICORN.AURA_DT)) % 4 === 0) emit(world, { type: 'creature', k: 'aura', x: u.x, y: u.y, z: u.z, R: UNICORN.AURA_R });
}

/* ---------- Task 5: Tiere (Spez. #33; Festlegungen 1, 2, 4, 6, 8) ----------
   Fünf neue Tiere. Jedes hat höchstens eine ABILITY (Trampeln, Packen, Wurf, Sturzflug, Stampede); dazu kommen
   passive Teile ohne ABILITY-Platz (Entscheidungen des Controllers):
   - stepAnimal (combat.think, jeder Schritt, jeder Zustand): eigene Zeiten laufen ab (seenT, herdCd, beatCd, beeCd),
     das Krokodil ist versteckt (u.hidden), solange es am Boden im Wasser ist.
   - animalPassive (combat.think, nur im normalen Zustand: nach Schreck und Rückzug, vor der Fähigkeit):
     Brustklopfen des Gorillas (eigene Zeit beatCd: beim ersten Kontakt, dann alle CHEST_BEAT.CD s) und die Angst des
     Elefanten vor feindlichen Bienen (eigene Drossel beeCd: höchstens einmal je BEE_FEAR.CD s).
   - eagleStep (combat.think, normales Verhalten des Adlers mit Ziel): er kreist auf T.flyZ und stößt zum Picken herab.
   Der Elefant ist furchtlos gegen Brüllen und Spuk (FEARLESS), nie Ghul (NO_GHOUL) und nie Frosch. */
export const TIERE = new Set(['elefant', 'krokodil', 'gorilla', 'adler', 'bueffel']);
FEARLESS.add('elefant');
const WATER_ID = TERRAIN.wasser.id, WET_Z = 4;

// Ein Schritt Zeiten und Versteck (jeder Zustand; auch betäubt und auf der Flucht, die Zielwahl der Feinde liest hidden)
export function stepAnimal(world, u, dt) {
  if (u.seenT > 0) u.seenT -= dt;
  if (u.herdCd > 0) u.herdCd -= dt;
  if (u.beatCd > 0) u.beatCd -= dt;
  if (u.beeCd > 0) u.beeCd -= dt;
  if (u.type === 'krokodil') u.hidden = u.z < WET_Z && world.terr[cellIndex(world, u.x, u.y)] === WATER_ID;
  // Adler: ohne Sturzflug zurück auf Flughöhe; eagleStep senkt ihn im normalen Verhalten wieder zum Picken (auf der
  // Flucht und ohne Ziel bleibt er oben)
  else if (u.type === 'adler' && !u.abOn) u.fz = u.T.flyZ;
}
// Passive Teile im normalen Zustand (Vorrang, Festlegung 1: nicht betäubt, nicht in der Luft, nicht auf der Flucht)
export function animalPassive(world, u) {
  if (u.type === 'elefant') { if (u.beeCd <= 0) beeFear(world, u); }
  else if (u.type === 'gorilla') { if (u.beatCd <= 0 && !u.abOn) chestBeat(world, u); }
}

/* Elefant: Angst vor Bienen. Ist eine feindliche Biene höchstens R px vom Körper entfernt, erschrickt er T s
   (scare, auch mitten im Trampeln). Danach CD s Ruhe; ohne Biene prüft er alle SCAN s wieder. */
export const BEE_FEAR = { R: 50, T: 1.5, CD: 6, SCAN: .2 };
let BF_W = null, BF_U = null, BF_F = null, BF_HIT = false;
function beeTest(v) {
  if (v.type !== 'biene' || factionOf(BF_W, v) === BF_F) return;
  const dx = v.x - BF_U.x, dy = v.y - BF_U.y, R = BEE_FEAR.R + BF_U.T.r;
  if (dx * dx + dy * dy > R * R) return;
  BF_HIT = true; return true;
}
function beeFear(world, u) {
  BF_W = world; BF_U = u; BF_F = factionOf(world, u); BF_HIT = false;
  query(world, u.x, u.y, BEE_FEAR.R + u.T.r, beeTest);
  BF_W = null; BF_U = null; BF_F = null;
  if (!BF_HIT) { u.beeCd = BEE_FEAR.SCAN; return; }
  u.beeCd = BEE_FEAR.CD;
  scare(world, u, BEE_FEAR.T);
  emit(world, { type: 'fear', x: u.x, y: u.y - u.T.r, z: u.z });
  sound(world, 'pop');
}

/* Gorilla: Brustklopfen. Alle Feinde bis R px (Mitte zu Mitte) mit weniger LP als der Gorilla gerade hat, die nicht
   furchtlos sind und nicht schon fliehen, erschrecken T s (Schreck trifft nur Feinde, Festlegung 2). Löst aus, sobald
   es mindestens einen solchen gibt (der erste Kontakt der Schlacht: beatCd startet bei 0), danach alle CD s; ohne
   Opfer prüft er alle RETRY s wieder. */
export const CHEST_BEAT = { R: 70, T: 1.5, CD: 20, RETRY: .25 };
let BT_W = null, BT_U = null, BT_F = null, BT_N = 0, BT_DO = false;
function beatTest(v) {
  if (FEARLESS.has(v.type) || v.type === 'frosch' || v.ashT > 0 || isFleeing(v) || !(v.hp < BT_U.hp) || factionOf(BT_W, v) === BT_F) return;
  const dx = v.x - BT_U.x, dy = v.y - BT_U.y, R = CHEST_BEAT.R;
  if (dx * dx + dy * dy > R * R) return;
  BT_N++;
  if (BT_DO) { scare(BT_W, v, CHEST_BEAT.T); emit(BT_W, { type: 'fear', x: v.x, y: v.y - v.T.r, z: v.z }); }
}
function beat(world, u, apply) {
  BT_W = world; BT_U = u; BT_F = factionOf(world, u); BT_N = 0; BT_DO = apply;
  query(world, u.x, u.y, CHEST_BEAT.R, beatTest);
  BT_W = null; BT_U = null; BT_F = null;
  return BT_N;
}
function chestBeat(world, u) {
  if (!beat(world, u, false)) { u.beatCd = CHEST_BEAT.RETRY; return; }
  beat(world, u, true);
  u.beatCd = CHEST_BEAT.CD; u.swingT = .25;
  emit(world, { type: 'ability', k: 'beat', x: u.x, y: u.y, z: 0, R: CHEST_BEAT.R, face: u.face });
  sound(world, 'thud');
}

/* Ansturm (Trampeln des Elefanten, Stampede der Büffel): u läuft mit T.speed · SPEED in Richtung (u.abX, u.abY).
   Jeder Bodenkörper vorn oder seitlich (Abstand < beide Radien + PAD, nicht hinter u), der nicht schon fliegt und nicht
   schwerer ist als MAXM, wird quer zur Laufrichtung weggeschleudert (combat.fling, Stoß PUSH · Masse, Anteil FWD nach
   vorn); nur Feinde nehmen DMG Schaden (Festlegung 2). Wer fliegt, wird nicht noch einmal getroffen. Stürmende
   Artgenossen (Herde) bleiben unberührt. */
let CH_W = null, CH_U = null, CH_F = null, CH_C = null;
function chargeTest(v) {
  const u = CH_U, C = CH_C;
  if (v === u || v.T.fly || v.state === 'air' || (v.T.mass || 1) > C.MAXM || (v.type === u.type && v.abOn)) return;
  const dx = v.x - u.x, dy = v.y - u.y, rr = u.T.r + v.T.r + C.PAD;
  if (dx * dx + dy * dy > rr * rr) return;
  const nx = u.abX, ny = u.abY;
  if (dx * nx + dy * ny < -.3 * u.T.r) return;   // hinter u
  const c = nx * dy - ny * dx, s = c > 1e-6 ? 1 : c < -1e-6 ? -1 : (v.id % 2 ? 1 : -1);
  const ex = nx * C.FWD - ny * s, ey = ny * C.FWD + nx * s;
  fling(v, ex, ey, Math.hypot(ex, ey), (v.T.mass || 1) * C.PUSH);
  if (factionOf(CH_W, v) !== CH_F) {
    hurt(CH_W, v, C.DMG, 'melee', u);
    emit(CH_W, { type: 'hit', x: v.x, y: v.y, flank: false, kind: 'melee', shake: 2 });
  }
}
function charge(world, u, C) {
  const sp = u.T.speed * C.SPEED;
  u.mx = u.abX * sp; u.my = u.abY * sp;
  u.face = u.abX < 0 ? -1 : 1; u.fx = u.abX; u.fy = u.abY;
  CH_W = world; CH_U = u; CH_F = factionOf(world, u); CH_C = C;
  query(world, u.x, u.y, u.T.r + MAX_R + C.PAD, chargeTest);
  CH_W = null; CH_U = null; CH_F = null; CH_C = null;
}
// Strecke L px von u in Richtung (nx, ny) frei von Mauer, Lava und Kartenrand?
function lineFree(world, u, nx, ny, L) {
  const { GW, terr, W, H } = world;
  for (let s = 0; s <= L; s += CELL / 2) {
    const x = u.x + nx * s, y = u.y + ny * s;
    if (x < 6 || y < 6 || x > W - 6 || y > H - 6) return false;
    if (TERR_HAZ[terr[((y / CELL) | 0) * GW + ((x / CELL) | 0)]]) return false;
  }
  return true;
}

/* Elefant: Trampeln. Auf ein Bodenziel bis RANGE px, wenn die ganze Strecke (T s mit SPEED-fachem Tempo) frei ist:
   T s Ansturm geradeaus (Richtung beim Start fest), Körper fliegen seitlich weg. */
export const TRAMPLE = { T: 1.5, SPEED: 2.5, DMG: 26, PUSH: 240, FWD: .3, PAD: 4, MAXM: 12, RANGE: 150 };
function trampleReady(world, u) {
  const t = foeInReach(world, u, TRAMPLE.RANGE, true);
  if (!t) return false;
  const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
  if (!lineFree(world, u, nx, ny, u.T.speed * TRAMPLE.SPEED * TRAMPLE.T + u.T.r)) return false;
  u.abX = nx; u.abY = ny;
  return true;
}
function trampleStart(world, u) {
  emit(world, { type: 'ability', k: 'trample', x: u.x, y: u.y, z: 0, R: u.T.r, nx: u.abX, ny: u.abY });
  sound(world, 'thud');
}
function trampleUpdate(world, u) {
  if (u.abT >= TRAMPLE.T) return true;
  charge(world, u, TRAMPLE);
  return false;
}

/* Büffel: Stampede (Festlegung 4: Herde über die Gruppierung wie beim Wolfsrudel; combat.GROUP_USERS, groupInfo mit
   R px). Ab MIN bereiten Büffeln der Fraktion bis R px (er selbst mitgezählt; bereit: steht, flieht nicht, herdCd 0,
   stürmt nicht schon) und mit einem Bodenziel bis ENGAGE px: alle diese stürmen T s mit SPEED-fachem Tempo in Richtung
   des Ziels (eine Richtung für alle) und rammen alles beiseite (Ansturm). Die Herde hat danach CD s Abklingzeit als
   gemeinsamer Wert u.herdCd auf allen Mitgliedern (beim Start CD + T). Die anderen Mitglieder übernehmen die laufende
   Fähigkeit direkt (abOn), ihr update führt sie. ABILITY.bueffel.cd ist nur die Pause zwischen zwei Versuchen. */
export const HERD = { R: 60, MIN: 3, T: 2, SPEED: 2.2, CD: 20, ENGAGE: 220, DMG: 12, PUSH: 200, FWD: .4, PAD: 3, MAXM: 6 };
let HD_W = null, HD_U = null, HD_F = null, HD_N = 0, HD_DO = false, HD_X = 0, HD_Y = 0;
function herdTest(v) {
  if (v.type !== 'bueffel' || v.state !== 'ok' || isFleeing(v) || v.herdCd > 0 || (v.abOn && v !== HD_U) || factionOf(HD_W, v) !== HD_F) return;
  const dx = v.x - HD_U.x, dy = v.y - HD_U.y, R = HERD.R;
  if (dx * dx + dy * dy > R * R) return;
  // wie beim Trampeln: nur wer auf der ganzen Strecke keine Mauer, keine Lava und keinen Kartenrand vor sich hat (Review Task 5)
  if (!lineFree(HD_W, v, HD_X, HD_Y, herdRun(v))) return;
  HD_N++;
  if (HD_DO) {
    v.herdCd = HERD.CD + HERD.T; v.abX = HD_X; v.abY = HD_Y;
    if (v !== HD_U) { v.abOn = true; v.abT = 0; v.abK = 0; }
  }
}
function herd(world, u, apply) {
  HD_W = world; HD_U = u; HD_F = factionOf(world, u); HD_N = 0; HD_DO = apply;
  query(world, u.x, u.y, HERD.R, herdTest);
  HD_W = null; HD_U = null; HD_F = null;
  return HD_N;
}
// Länge der Stampede (T s mit SPEED-fachem Tempo) plus Radius, die frei sein muss (lineFree)
const herdRun = v => v.T.speed * HERD.SPEED * HERD.T + v.T.r;
// gemeinsame Richtung der Herde: zum Ziel des Auslösers (HD_X, HD_Y)
function herdDir(u, t) { const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1; HD_X = dx / d; HD_Y = dy / d; }
function herdReady(world, u) {
  if (u.herdCd > 0 || u.gn < HERD.MIN) return false;
  const t = foeInReach(world, u, HERD.ENGAGE, true);
  if (!t) return false;
  herdDir(u, t);
  return herd(world, u, false) >= HERD.MIN;   // zählt nur Büffel mit freier Strecke (herdTest), u selbst eingeschlossen
}
function herdStart(world, u) {
  herdDir(u, u.tg);
  herd(world, u, true);
  emit(world, { type: 'ability', k: 'stampede', x: u.x, y: u.y, z: 0, R: HERD.R, nx: HD_X, ny: HD_Y });
  sound(world, 'thud');
}
function herdUpdate(world, u) {
  if (u.abT >= HERD.T) return true;
  charge(world, u, HERD);
  return false;
}

/* Krokodil: Packen. Ein Bodenziel in Bissweite: Biss mit MUL-fachem Schaden, das Opfer ist STUN s betäubt (stunT;
   nicht Flieger und nichts ab MAXM Masse), das Krokodil bleibt SEEN s sichtbar (seenT, wie nach jedem Biss:
   combat.attack). Ersetzt den nächsten normalen Biss (u.cd). */
export const CROC = { SEEN: 2, MUL: 2, STUN: 1, MAXM: 20, PAD: 2 };
const snapReady = (world, u) => !!foeInReach(world, u, u.T.range + CROC.PAD, true);
function snapStart(world, u) {
  const t = u.tg, T = u.T;
  faceTo(u, t.x, t.y);
  u.cd = T.cd; u.swingT = .25; u.seenT = CROC.SEEN;
  hurt(world, t, T.dmg * CROC.MUL * (.85 + world.rng() * .3), 'melee', u);
  if (t.alive && !t.T.fly && (t.T.mass || 1) < CROC.MAXM) {
    if (t.state === 'ok') { t.state = 'stun'; t.stunT = CROC.STUN; t.vx = 0; t.vy = 0; }
    else if (t.state === 'stun' && t.stunT < CROC.STUN) t.stunT = CROC.STUN;
  }
  emit(world, { type: 'hit', x: t.x, y: t.y, flank: false, kind: 'melee', shake: 2 });
  emit(world, { type: 'ability', k: 'snap', x: t.x, y: t.y, z: 0, R: t.T.r });
  sound(world, 'hit');
}

/* Gorilla: Wurf. Packt einen Feind in Reichweite (das Ziel, sonst einen anderen) mit Masse ≤ MAXM, der am Boden steht:
   Schaden wie ein Schlag, HOLD s hochgehoben (betäubt, u.grabbed), dann ein Flug mit Landung (#15: fliegt, bis er
   landet, dann betäubt) DIST px weit in die dichteste Feindgruppe (unter den CAND nächsten Feinden bis SEARCH px die
   mit den meisten Feinden minus Eigenen im Umkreis GROUP_R; ohne Gruppe vom Gorilla weg). Der Wurf rechnet Luft-
   widerstand und Rutschen ein (DRAG wie physics.AIR_DRAG), steigt mit VZ (unter der Abprallschwelle, kein Hüpfer).
   Beim Aufprall werden Körper bis LAND_R px weggestoßen (Stoß LAND_I), Feinde des Gorillas nehmen LAND_DMG. Bricht
   der Wurf vor dem Loslassen ab (Schreck, Betäubung, Tod des Gorillas), fällt das Opfer herunter. */
export const THROW = { MAXM: 2, DIST: 120, VZ: 190, HOLD: .3, LIFT: 12, PAD: 4, CAND: 8, SEARCH: 240, GROUP_R: 50,
  LAND_R: 26, LAND_I: 150, LAND_DMG: 10, MAX_T: 2, DRAG: .4 };
const canThrow = (world, u, v) => v.alive && v.state === 'ok' && !v.T.fly && (v.T.mass || 1) <= THROW.MAXM &&
  factionOf(world, v) !== factionOf(world, u);
let TV_W = null, TV_U = null, TV_B = null, TV_D = 0;
function victimTest(v) {
  if (!canThrow(TV_W, TV_U, v)) return;
  const dx = v.x - TV_U.x, dy = v.y - TV_U.y, d = dx * dx + dy * dy, r = TV_U.T.range + TV_U.T.r + v.T.r + THROW.PAD;
  if (d <= r * r && d < TV_D) { TV_D = d; TV_B = v; }
}
function throwReady(world, u) {
  let v = foeInReach(world, u, u.T.range + THROW.PAD, true);
  if (!v || !canThrow(world, u, v)) {
    TV_W = world; TV_U = u; TV_B = null; TV_D = Infinity;
    query(world, u.x, u.y, u.T.range + u.T.r + MAX_R + THROW.PAD, victimTest);
    v = TV_B; TV_W = null; TV_U = null; TV_B = null;
  }
  if (!v) return false;
  u.grabbed = v;
  return true;
}
function throwStart(world, u) {
  const v = u.grabbed;
  faceTo(u, v.x, v.y);
  leaveBlock(v); cancelAbility(world, v);
  v.state = 'stun'; v.stunT = THROW.HOLD + .2; v.vx = 0; v.vy = 0; v.mx = 0; v.my = 0;
  hurt(world, v, u.T.dmg * (.85 + world.rng() * .3), 'melee', u);
  emit(world, { type: 'hit', x: v.x, y: v.y, flank: false, kind: 'melee' });
  sound(world, 'thud');
  if (!v.alive) u.grabbed = null;
}
// Wohin: Richtung von v zur dichtesten Feindgruppe des Gorillas (sonst vom Gorilla weg)
function hurl(world, u, v) {
  const f = factionOf(world, u);
  CN = 0; Q_W = world; Q_U = u; Q_F = f; Q_R = THROW.SEARCH;
  query(world, u.x, u.y, THROW.SEARCH + MAX_R, candTest);
  Q_W = null; Q_U = null; Q_F = null;
  let best = null, bs = 0;
  for (let k = 0; k < CN && k < THROW.CAND; k++) {
    const c = CU[k];
    if (c === v || (c.x - v.x) ** 2 + (c.y - v.y) ** 2 < 400) continue;
    const s = groupScore(world, f, c.x, c.y, THROW.GROUP_R);
    if (s > bs) { bs = s; best = c; }
  }
  let dx = best ? best.x - v.x : v.x - u.x, dy = best ? best.y - v.y : v.y - u.y;
  CU.fill(null);
  let d = Math.hypot(dx, dy);
  if (d < 1e-6) { dx = u.face; dy = 0; d = 1; }
  const vz = THROW.VZ, tf = (vz + Math.sqrt(vz * vz + 2 * GRAVITY * v.z)) / GRAVITY, e = Math.exp(-THROW.DRAG * tf);
  const sp = THROW.DIST / ((1 - e) / THROW.DRAG + e / GROUND_FRICTION), m = v.T.mass || 1;
  v.vx = 0; v.vy = 0; v.vz = 0;
  applyImpulse(v, dx / d * sp * m, dy / d * sp * m, vz * m);
  emit(world, { type: 'ability', k: 'throw', x: v.x, y: v.y, z: v.z, R: v.T.r, nx: dx / d, ny: dy / d });
  sound(world, 'whoosh');
}
let LK_W = null, LK_U = null, LK_V = null, LK_F = null;
function landTest(o) {
  const v = LK_V;
  if (o === v || o === LK_U || o.T.fly || o.state === 'air') return;
  const dx = o.x - v.x, dy = o.y - v.y, d = Math.hypot(dx, dy);
  if (d > THROW.LAND_R + o.T.r) return;
  fling(o, dx, dy, d, THROW.LAND_I);
  if (factionOf(LK_W, o) !== LK_F) hurt(LK_W, o, THROW.LAND_DMG, 'melee', LK_U);
}
function landKnock(world, u, v) {
  LK_W = world; LK_U = u; LK_V = v; LK_F = factionOf(world, u);
  query(world, v.x, v.y, THROW.LAND_R + MAX_R, landTest);
  LK_W = null; LK_U = null; LK_V = null; LK_F = null;
  emit(world, { type: 'ability', k: 'thrown', x: v.x, y: v.y, z: 0, R: THROW.LAND_R, shake: 3 });
}
function throwUpdate(world, u) {
  const v = u.grabbed;
  if (!v || !v.alive) return true;
  u.mx = 0; u.my = 0;
  if (u.abK === 0) {
    if (v.state === 'air') return true;   // wurde ihm aus der Hand geschleudert
    const s = u.face < 0 ? -1 : 1;
    v.x = u.x + s * (u.T.r + v.T.r) * .95; v.y = u.y - 1; v.z = THROW.LIFT * Math.min(1, u.abT / THROW.HOLD);
    v.state = 'stun'; if (v.stunT < .1) v.stunT = .1; v.vx = 0; v.vy = 0;
    if (u.abT >= THROW.HOLD) { hurl(world, u, v); u.abK = 1; u.abT = 0; }
    return false;
  }
  if (v.state === 'air' && u.abT < THROW.MAX_T) return false;
  if (v.state !== 'air') landKnock(world, u, v);
  return true;
}
// Abbruch vor dem Loslassen: fallen lassen (aus der Hubhöhe, Landung wie nach einem Flug)
function throwEnd(world, u) { if (u.abK === 0) dropGrabbed(u); u.grabbed = null; }
function dropGrabbed(u) {
  const v = u.grabbed;
  u.grabbed = null;
  if (!v || !v.alive || v.state === 'air') return;
  v.vz = 0; applyImpulse(v, 0, 0, 1e-3 * (v.T.mass || 1));
}

/* Adler (Festlegung 6, Spez. #33): kreist auf T.flyZ; Nahkämpfer erreichen ihn nur unten (world.aloft, z ≤
   EAGLE_REACH_Z). Picken (eagleStep, normales Verhalten): ist das Ziel in Reichweite + NEAR px und der nächste Biss
   höchstens LEAD s entfernt, sinkt er auf LOW; erst unten beißt er (oben wartet er über dem Ziel), nach dem Biss steigt
   er wieder. Liefert true, wenn der Schritt damit erledigt ist. */
export const EAGLE = { LOW: 8, NEAR: 24, LEAD: .25 };
export function eagleStep(world, u, t, d, reach) {
  u.fz = d <= reach + EAGLE.NEAR && u.cd <= EAGLE.LEAD ? EAGLE.LOW : u.T.flyZ;
  if (d <= reach && u.z > EAGLE_REACH_Z) { u.mx = 0; u.my = 0; return true; }
  return false;
}
/* Sturzflug: aus der Flughöhe auf einen Bodenfeind bis RANGE px, Fernkämpfer (data.RANGED) vor allen anderen (jeder
   Fernkämpfer in RANGE schlägt jeden Nahkämpfer), unter ihnen der nächste (Fliehende zählen doppelt so weit; versteckte
   Krokodile nicht). Fliegt mit SPEED-fachem Tempo hin, sinkt rechtzeitig auf LOW; der erste Treffer
   unten macht MUL-fachen Schaden. Danach HOLD s unten (erreichbar), dann steigt er wieder (fertig). Ohne Treffer nach
   MAX_T s oder ohne Ziel bricht er ab. */
export const SWOOP = { RANGE: 260, SPEED: 1.8, MUL: 3, HOLD: .35, MAX_T: 3, LOW: 6 };
let SW_W = null, SW_U = null, SW_F = null, SW_B = null, SW_S = 0;
function swoopTest(v) {
  if (v.T.fly || v.state === 'air' || factionOf(SW_W, v) === SW_F || (v.hidden && unseen(SW_U, v))) return;
  const dx = v.x - SW_U.x, dy = v.y - SW_U.y, d2 = dx * dx + dy * dy, R = SWOOP.RANGE;
  if (d2 > R * R) return;
  let s = isFleeing(v) ? 4 * d2 : d2;
  if (!RANGED.has(v.type)) s += 4 * R * R;
  if (s < SW_S) { SW_S = s; SW_B = v; }
}
function swoopReady(world, u) {
  if (u.z < u.T.flyZ - 2) return false;
  SW_W = world; SW_U = u; SW_F = factionOf(world, u); SW_B = null; SW_S = Infinity;
  query(world, u.x, u.y, SWOOP.RANGE, swoopTest);
  const t = SW_B;
  SW_W = null; SW_U = null; SW_F = null; SW_B = null;
  if (!t) return false;
  u.tg = t;
  return true;
}
function swoopStart(world, u) {
  emit(world, { type: 'ability', k: 'swoop', x: u.x, y: u.y, z: u.z, R: u.T.r });
  sound(world, 'whoosh');
}
function swoopUpdate(world, u) {
  const t = u.tg, T = u.T;
  if (!t || !t.alive || factionOf(world, t) === factionOf(world, u)) return true;
  if (u.abK === 0) {
    if (u.abT > SWOOP.MAX_T) return true;
    const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1, V = T.speed * SWOOP.SPEED, reach = T.range + T.r + t.T.r;
    faceTo(u, t.x, t.y);
    if (d > reach) { u.mx = dx / d * V; u.my = dy / d * V; } else { u.mx = 0; u.my = 0; }
    if ((d - reach) / V <= (u.z - SWOOP.LOW) / FLY_VZ + .05) u.fz = SWOOP.LOW;
    if (d <= reach + 2 && u.z <= EAGLE_REACH_Z) {
      hurt(world, t, T.dmg * SWOOP.MUL * (.85 + world.rng() * .3), 'melee', u);
      emit(world, { type: 'hit', x: t.x, y: t.y, flank: false, kind: 'melee', shake: 2 });
      emit(world, { type: 'ability', k: 'swoopHit', x: t.x, y: t.y, z: 0, R: t.T.r });
      sound(world, 'hit');
      u.cd = T.cd; u.swingT = .25; u.abK = 1; u.abT = 0;
    }
    return false;
  }
  u.mx = 0; u.my = 0;
  return u.abT >= SWOOP.HOLD;
}
function swoopEnd(world, u) { u.fz = u.T.flyZ; }

/* ---------- König (Wunsch Silas, 18.11.) ----------
   Teure Armee-Einheit, um die sich die Schlacht dreht.
   - Königsaura (stepKingAura, jeder Zustand außer tot): alle AURA_DT s bekommen eigene Armee-Einheiten bis AURA_R px
     (er selbst nicht) u.braveT = AURA_T: sie fliehen nicht (morale.updateMorale) und schlagen im Nahkampf ×AURA_DMG
     (combat.attack). Mehrere Könige stapeln nicht (braveT wird nur gesetzt). Alle PULSE s ein goldener Ring als Zeichen.
   - Schlachtruf (ABILITY, Abklingzeit cd): mit einem Feind bis CRY_ENGAGE px und mindestens CRY_MIN Verbündeten bis
     CRY_R px heilen alle Verbündeten dort (nicht Untote, nicht Asche) CRY_HEAL ihrer max. LP und sind CRY_T s lang
     ×CRY_SPEED schneller und ×CRY_DMG stärker im Nahkampf (u.buffT, wie das Heulen der Wölfe).
   - Königsmord (kingFall, aus combat.die): fällt er, erschrecken eigene Einheiten bis FALL_R px FALL_T s lang (scare;
     furchtlose Maschinen und Drachen nicht). Darum lohnt es sich, ihn mit Scharfschützen, Reitern oder Geistern zu jagen. */
export const KING = {
  AURA_R: 150, AURA_DT: .5, AURA_T: .8, AURA_DMG: 1.2, PULSE: 2.5,
  CRY_R: 170, CRY_ENGAGE: 220, CRY_MIN: 3, CRY_HEAL: .25, CRY_T: 5, CRY_SPEED: 1.25, CRY_DMG: 1.25,
  FALL_R: 250, FALL_T: 3,
};
let KG_W = null, KG_U = null, KG_F = null, KG_N = 0, KG_DO = false;
function kingAuraTest(v) {
  if (v === KG_U || !v.alive || v.T.cat !== 'armee' || factionOf(KG_W, v) !== KG_F) return;
  const dx = v.x - KG_U.x, dy = v.y - KG_U.y, R = KING.AURA_R;
  if (dx * dx + dy * dy > R * R) return;
  v.braveT = KING.AURA_T; KG_N++;
}
export function stepKingAura(world, u, dt) {
  u.auraT -= dt;
  if (u.auraT > 0) return;
  u.auraT = u.auraT + KING.AURA_DT > 0 ? u.auraT + KING.AURA_DT : KING.AURA_DT;
  KG_W = world; KG_U = u; KG_F = factionOf(world, u); KG_N = 0;
  query(world, u.x, u.y, KING.AURA_R, kingAuraTest);
  KG_W = null; KG_U = null; KG_F = null;
  const k = Math.round(KING.PULSE / KING.AURA_DT);
  if ((u.id + Math.round(world.time / KING.AURA_DT)) % k === 0) emit(world, { type: 'ability', k: 'kingAura', x: u.x, y: u.y, z: 0, R: KING.AURA_R });
}
function cryTest(v) {
  if (v.ashT > 0 || !v.alive || factionOf(KG_W, v) !== KG_F) return;
  const dx = v.x - KG_U.x, dy = v.y - KG_U.y, R = KING.CRY_R;
  if (dx * dx + dy * dy > R * R) return;
  KG_N++;
  if (!KG_DO) return;
  if (!UNDEAD.has(v.type)) { const h = v.hp + KING.CRY_HEAL * v.T.hp; v.hp = h < v.T.hp ? h : v.T.hp; }
  if (!(v.buffT > KING.CRY_T) || v.spdMul < KING.CRY_SPEED) { v.buffT = KING.CRY_T; v.spdMul = KING.CRY_SPEED; v.dmgMul = KING.CRY_DMG; }
}
function cry(world, u, apply) {
  KG_W = world; KG_U = u; KG_F = factionOf(world, u); KG_N = 0; KG_DO = apply;
  query(world, u.x, u.y, KING.CRY_R, cryTest);
  KG_W = null; KG_U = null; KG_F = null;
  return KG_N;
}
const cryReady = (world, u) => !!foeInReach(world, u, KING.CRY_ENGAGE, false) && cry(world, u, false) >= KING.CRY_MIN + 1;
function cryStart(world, u) {
  cry(world, u, true);
  u.swingT = .25;
  emit(world, { type: 'ability', k: 'kingCry', x: u.x, y: u.y, z: 0, R: KING.CRY_R, face: u.face });
  sound(world, 'horn');
}
function fallTest(v) {
  if (v === KG_U || !v.alive || FEARLESS.has(v.type) || v.type === 'frosch' || v.ashT > 0 || UNDEAD.has(v.type) || factionOf(KG_W, v) !== KG_F) return;
  const dx = v.x - KG_U.x, dy = v.y - KG_U.y, R = KING.FALL_R;
  if (dx * dx + dy * dy > R * R) return;
  v.braveT = 0; scare(KG_W, v, KING.FALL_T); emit(KG_W, { type: 'fear', x: v.x, y: v.y - v.T.r, z: v.z });
}
export function kingFall(world, u) {
  KG_W = world; KG_U = u; KG_F = factionOf(world, u);
  query(world, u.x, u.y, KING.FALL_R, fallTest);
  KG_W = null; KG_U = null; KG_F = null;
  emit(world, { type: 'ability', k: 'kingFall', x: u.x, y: u.y, z: 0, R: KING.FALL_R });
}

// Erste Abklingzeit (Wunsch Silas, 18.11.): viele Fähigkeiten kamen zu spät, oft war die Schlacht schon entschieden.
// Für diese Typen gilt beim Spawn FIRST_CD statt cd (gestreut wie bisher, world.spawn); die Wiederholung bleibt cd.
// Unverändert: Mörser-Sperrfeuer (Flächenschaden), Sanitäter und Soldat (früher: Soldaten mit Sanitätern zu stark), Krokodil und Adler (ohnehin kurz), Hubschrauber und Drache (eigene
// Baustellen), Büffel (Herden-Abklingzeit).
export const FIRST_CD = { schuetze: 12, panzer: 12, wolf: 8, baer: 8, geist: 6, hexe: 6, elefant: 10, gorilla: 6, koenig: 6 };

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
  // --- Task 6: Kreaturen ---
  hexe: { cd: FROG.CD, ready: hexReady, start: hexStart, update: done },
  // --- Task 5: Tiere --- (Büffel: die Herden-Abklingzeit ist u.herdCd, cd hier nur die Pause nach einer Stampede)
  elefant: { cd: 20, ready: trampleReady, start: trampleStart, update: trampleUpdate },
  krokodil: { cd: 8, ready: snapReady, start: snapStart, update: done },
  gorilla: { cd: 12, ready: throwReady, start: throwStart, update: throwUpdate, end: throwEnd },
  adler: { cd: 10, ready: swoopReady, start: swoopStart, update: swoopUpdate, end: swoopEnd },
  bueffel: { cd: 1, ready: herdReady, start: herdStart, update: herdUpdate },
  koenig: { cd: 18, ready: cryReady, start: cryStart, update: done },
};
for (const k in FIRST_CD) ABILITY[k].first = FIRST_CD[k];
