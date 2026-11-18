// Synergien zwischen verschiedenen Truppen (Wunsch Silas, 18.11.): Name, Paare und Kartentext in data.js (SYNERGY).
// Rein, kein DOM, kein Zufall.
//
// Nähe-Synergien (near): alle SCAN_DT s sucht jede Einheit, die einen Vorteil haben kann, den nächsten eigenen Partner
// bis R px. Gefunden: Bit in u.syn, der Partner in u.synP (der Renderer zieht eine dünne Linie in der Farbe der Synergie).
// Ereignis-Synergien wirken beim Treffer (combat.hurt, combat.attack, combat.healer) und melden 'syn' (Funken in fxcore,
// je Ziel höchstens alle FX_DT s).
// Zeiten in u.rv (world.RV_SYNT, RV_MARK, RV_KLINGE, RV_SYNFX): außerhalb des Einheiten-Literals (128 Eigenschaften).
import { SYNERGY } from './data.js';
import { query, factionOf, RV_SYNT, RV_SYNFX } from './world.js';

export const SYN = {
  SCAN_DT: .5,
  R: { schild: 70, feuerschutz: 140, geleit: 100, klinge: 130, turm: 80 },
  SCHILD: .6, ZANGE: 1.4, FELDARZT: 1.5, JAGD: 1.3, MARK_T: 4, SCHRECK: 1.5, FEUERSCHUTZ: .8, GELEIT: .7,
  KLEBRIG: 1.25, KLINGE_DT: 3, TURM: 1.3, FX_DT: .4,
};
// Bits für u.syn (nur Nähe-Synergien)
export const SB = {};
// Farbe je Synergie (Linie, Funken)
export const SYN_COL = {
  schild: 0x9fb4d6, zange: 0xe0a040, feldarzt: 0x6fd08c, jagd: 0xc8823a, schreck: 0xa070d0,
  feuerschutz: 0xf0c040, geleit: 0x8a9a6a, klebrig: 0x9ad0e0, klinge: 0xff7a30, turm: 0xc0a080,
};
export const BIT_KEY = [];
const S = Object.fromEntries(SYNERGY.map(s => [s.k, s]));
const set = k => new Set(S[k].a), partners = k => new Set(S[k].b);
// Typ → Liste der Nähe-Synergien, die er haben kann: [{bit, R2, b}]
const PROX = {};
for (const s of SYNERGY) {
  if (!s.near) continue;
  const bit = 1 << BIT_KEY.length; BIT_KEY.push(s.k); SB[s.k] = bit;
  for (const t of s.a) (PROX[t] ||= []).push({ bit, R: SYN.R[s.k], b: partners(s.k) });
}
export const SCAN_TYPES = new Set(Object.keys(PROX));
// Wer bei Ereignis-Synergien wirkt / auslöst
export const ZANGE_A = set('zange'), ZANGE_B = partners('zange');
export const FELD_A = set('feldarzt');
export const JAGD_A = set('jagd');
export const SCHRECK_A = set('schreck');
export const KLEBRIG_A = set('klebrig');

let SC_U = null, SC_F = null, SC_B = null, SC_D = 0, SC_P = null;
function scanTest(v) {
  if (v === SC_U || !v.alive || !SC_B.has(v.type) || factionOf(SC_W, v) !== SC_F) return;
  const d = (v.x - SC_U.x) ** 2 + (v.y - SC_U.y) ** 2; if (d < SC_D) { SC_D = d; SC_P = v; }
}
let SC_W = null;

// Ein Schritt je Einheit (combat.think)
export function stepSynergy(world, u, dt) {
  const L = PROX[u.type]; if (!L) return;
  const r = u.rv; r[RV_SYNT] -= dt; if (r[RV_SYNT] > 0) return;
  r[RV_SYNT] = SYN.SCAN_DT;
  let bits = 0, first = null;
  SC_W = world; SC_U = u; SC_F = factionOf(world, u);
  for (const e of L) {
    SC_B = e.b; SC_D = e.R * e.R; SC_P = null;
    query(world, u.x, u.y, e.R, scanTest);
    if (SC_P) { bits |= e.bit; if (!first) first = SC_P; }
  }
  SC_W = null; SC_U = null; SC_F = null; SC_B = null; SC_P = null;
  u.syn = bits; u.synP = first;
}

// Funken einer Ereignis-Synergie am Ziel v (gedrosselt je Ziel)
export function synFx(world, v, k) {
  const r = v.rv; if (r[RV_SYNFX] > world.time) return;
  r[RV_SYNFX] = world.time + SYN.FX_DT;
  world.events.push({ type: 'syn', k, x: v.x, y: v.y - v.T.r, z: v.z || 0 });
}

// Für die Karte: Synergien, an denen dieser Typ beteiligt ist (als Nutznießer oder Auslöser)
export function synergiesOf(type) {
  return SYNERGY.filter(s => s.a.includes(type) || s.b.includes(type)).map(s => ({ n: s.n, d: s.d }));
}
