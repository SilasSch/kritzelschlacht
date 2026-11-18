// Tageschallenge (Audit 18.11.): ein Level je Kalendertag, aus dem Datum erzeugt. Rein: kein DOM, kein Math.random,
// Zufall nur über createRng mit einer Saat aus dem Datum ('YYYY-MM-DD', Ortszeit des Spielers). Alle Spieler bekommen am
// selben Tag dasselbe Level.
// Das Level hat das Format der Kampagne (docs/kampagne.md): { id, n, hint, budget, par, units, cats, place, plan }.
// Gegner: 1–3 Gruppen malbarer Einheiten rechts (x .6–.92 des Missionsrahmens), höchstens ein Boss, zusammen etwa
// 70–140 Punkte, dazu manchmal ein Gelände in der gegnerischen Hälfte. Erlaubt sind 5–6 Einheitentypen, darunter immer
// mindestens zwei Konter (data.js COUNTERS) des Hauptgegners. plan.smart ist ein einfacher Lösungsplan aus diesen
// Kontern (Tests: tests/daily.test.js prüfen, dass er meist gewinnt).
import { UNITS, PLURAL } from './data.js';
// Feste Auswahl für die Tageschallenge: neue Einheiten (data.js) dürfen alte Tage nicht verändern, sonst passen Bestenliste,
// geteilte Ergebnisse und „Nochmal“ nicht mehr. Neue Einheiten hier nur gezielt aufnehmen (verändert die künftigen Tage ab dann).
export const DAILY_POOL = ['krieger', 'schuetze', 'ritter', 'grenadier', 'reiter', 'roemer', 'sani', 'wolf', 'baer', 'biene', 'magier',
  'geist', 'drache', 'vampir', 'soldat', 'mg', 'sniper', 'panzerfaust', 'moerser', 'panzer', 'heli', 'troll', 'zyklop', 'hexe',
  'phoenix', 'einhorn', 'elefant', 'krokodil', 'gorilla', 'adler', 'bueffel'];
const inPool = t => DAILY_POOL.includes(t);
// Konter und Kosten der Auswahl, eingefroren am 18.11.: Balance-Änderungen (data.js) verändern die Tage nicht.
// Die Kämpfe selbst laufen mit den aktuellen Werten (Bestenliste: SIM_VERSION in dailyboard.js).
const DAILY_COUNTERS_TXT = `ritter>krieger ritter>schuetze ritter>reiter biene>ritter biene>schuetze krieger>biene wolf>schuetze wolf>grenadier
reiter>schuetze reiter>grenadier magier>krieger grenadier>krieger panzerfaust>panzer panzerfaust>heli soldat>heli
panzer>krieger panzer>soldat mg>biene mg>krieger sniper>ritter roemer>schuetze roemer>krieger grenadier>roemer
reiter>roemer magier>roemer moerser>roemer mg>adler adler>sniper vampir>zyklop magier>vampir troll>bueffel
krieger>troll zyklop>grenadier reiter>zyklop hexe>baer schuetze>hexe phoenix>vampir soldat>phoenix einhorn>schuetze
ritter>einhorn elefant>grenadier panzerfaust>elefant biene>elefant krokodil>bueffel schuetze>krokodil
gorilla>grenadier ritter>gorilla bueffel>grenadier ritter>bueffel magier>ritter magier>geist`;
const COUNTERS = DAILY_COUNTERS_TXT.split(/\s+/).map(p => p.split('>')).filter(c => UNITS[c[0]] && UNITS[c[1]]);
export const DAILY_COST = {krieger: 2, schuetze: 2.5, ritter: 4.5, grenadier: 4, reiter: 3, roemer: 3, sani: 3.5, wolf: 1.5, baer: 10, biene: 0.55, magier: 5, geist: 3, drache: 40, vampir: 8, soldat: 3, mg: 3.5, sniper: 7, panzerfaust: 6, moerser: 8.5, panzer: 35, heli: 18, troll: 7.5, zyklop: 12, hexe: 5, phoenix: 9.25, einhorn: 4.5, elefant: 24, krokodil: 4.75, gorilla: 6, adler: 4, bueffel: 4};
const costOf = t => DAILY_COST[t] ?? UNITS[t].cost;
import { createRng } from './rng.js';
import { F, B, Md } from './campaign/areas.js';

// Bosse: höchstens einer je Tag, nie der Hauptgegner und nie Konter im Plan (zu grob für das Budget)
export const DAILY_BOSSES = ['panzer', 'heli', 'elefant', 'drache'];
const isBoss = t => DAILY_BOSSES.includes(t);
const paintable = t => inPool(t) && UNITS[t] && UNITS[t].paint !== false;

// Konter je Gegnertyp: a schlägt b (COUNTERS), nur malbare Nicht-Bosse
export function countersOf(type) {
  return COUNTERS.filter(c => c[1] === type && paintable(c[0]) && !isBoss(c[0])).map(c => c[0]);
}
// Hauptgegner: malbare Nicht-Bosse mit mindestens zwei Kontern
export const DAILY_MAIN = [...new Set(COUNTERS.map(c => c[1]))].filter(t => paintable(t) && !isBoss(t) && countersOf(t).length >= 2);
// Konter, die der Lösungsplan nur nimmt, wenn es keinen anderen gibt: der Bienenschwarm gewinnt dort zu unzuverlässig
const PLAN_WEAK = new Set(['biene']);

// Datum → 'YYYY-MM-DD' in Ortszeit
export function dateKey(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
// 'YYYY-MM-DD' → '18.11.'
export const shortDate = s => { const [, m, d] = s.split('-'); return `${+d}.${+m}.`; };

// FNV-1a über den Text: Saat für createRng
export function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

const round5 = v => Math.max(5, Math.round(v / 5) * 5);
const r2 = v => Math.round(v * 100) / 100;
const list = a => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} und ${a[a.length - 1]}`);
const plural = t => PLURAL[t] || UNITS[t].n;
const isRanged = t => UNITS[t].range > 20 && !UNITS[t].heal;

export function dailyLevel(dateStr) {
  const rng = createRng(hashStr('kritzel-daily|' + dateStr));
  const pick = a => a[Math.floor(rng() * a.length)];
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const between = (a, b) => a + rng() * (b - a);

  // Hauptgegner und seine Konter (zwei, manchmal drei)
  const main = pick(DAILY_MAIN);
  const mainC = shuffle(countersOf(main));
  const counters = mainC.slice(0, Math.min(mainC.length, rng() < .35 ? 3 : 2));
  const total = Math.round(between(70, 140));

  // Gruppen: [typ, Punkte]. Der Hauptgegner hat den größten Teil.
  const groups = [];
  const nGroups = 1 + Math.floor(rng() * 3);
  // Nebengegner: nur Typen, die einer der Konter auch schlägt (sonst wäre der Plan ein Glücksspiel)
  const side = [...new Set(COUNTERS.filter(c => counters.includes(c[0]) && c[1] !== main && paintable(c[1]) && !isBoss(c[1])).map(c => c[1]))];
  let rest = total;
  // Boss (etwa jeder vierte Tag), nur wenn sein Konter mit ins Spiel kommt
  let boss = null;
  if (rng() < .28 && total >= 90) {
    const cand = ['panzer', 'heli', 'elefant'].filter(b => countersOf(b).length && costOf(b) <= total * .4);
    if (cand.length) { boss = pick(cand); rest -= costOf(boss); }
  }
  const sideTypes = shuffle(side).slice(0, nGroups - 1);
  const mainShare = sideTypes.length ? between(.55, .7) : 1;
  groups.push([main, rest * mainShare]);
  sideTypes.forEach(t => groups.push([t, rest * (1 - mainShare) / sideTypes.length]));

  // Aufstellung: Gruppen von vorn (x .6) nach hinten (x .92), y-Band mit etwas Zufall
  const place = [];
  let enemyPts = 0;
  const xs = [[.6, .68], [.7, .78], [.8, .88]];
  groups.forEach(([t, pts], i) => {
    const n = Math.max(1, Math.round(pts / costOf(t)));
    enemyPts += n * costOf(t);
    // Fernkämpfer eher hinten, Nahkämpfer vorn
    const slot = xs[Math.min(xs.length - 1, i)];
    const y0 = r2(between(.14, .3)), y1 = r2(between(.7, .86));
    const w = Math.min(slot[1] - slot[0], .02 + n * .0012);
    const x0 = r2(slot[0] + between(0, slot[1] - slot[0] - w)), x1 = r2(x0 + w);
    place.push(['rect', t, n, x0, y0, x1, y1]);
  });
  if (boss) { place.push(['unit', boss, r2(between(.84, .92)), r2(between(.3, .7))]); enemyPts += costOf(boss); }

  // Gelände in der gegnerischen Hälfte (vor den Gegnern), an etwa jedem zweiten Tag
  let terrain = null;
  if (rng() < .55) {
    terrain = pick(['wasser', 'wald', 'mauer', 'lava']);
    if (terrain === 'mauer') {
      const x = r2(between(.52, .56)), y = r2(between(.15, .35));
      place.unshift(['tRect', 'mauer', x, y, r2(x + .012), r2(y + between(.25, .4))]);
    } else {
      const cy = r2(between(.25, .75)), rr = r2(between(.06, terrain === 'lava' ? .08 : .11));
      place.unshift(['tCircle', terrain, r2(.5 + rr * .7), cy, rr]);
    }
  }

  const par = round5(enemyPts * 1.1), budget = round5(enemyPts * 1.5);

  // Lösungsplan: schlägt ein Konter alle Gruppen, nimmt er alles; sonst je Gruppe ihr Konter. Vorrang: nicht in PLAN_WEAK,
  // dann Nahkämpfer (ein Plan nur aus Fernkämpfern hat niemanden, der die Front hält). Punkte anteilig, zusammen ≤ par.
  const beats = t => counters.filter(c => COUNTERS.some(k => k[0] === c && k[1] === t));
  const best = b => { const s = b.filter(c => !PLAN_WEAK.has(c)); return s.find(c => !isRanged(c)) || s[0] || b[0]; };
  const rectTypes = place.filter(p => p[0] === 'rect').map(p => p[1]);
  const all = counters.filter(c => rectTypes.every(t => beats(t).includes(c)));
  const beat = t => (all.length ? best(all) : best(beats(t)));
  const bossC = boss ? countersOf(boss)[0] : null;
  const shares = new Map();
  const assign = (c, pts) => shares.set(c, (shares.get(c) || 0) + pts);
  for (const p of place) {
    if (p[0] === 'rect') assign(beat(p[1]), p[2] * costOf(p[1]));
    else if (p[0] === 'unit') assign(bossC, costOf(p[1]));
  }
  const smart = [];
  let cost = 0, melee = 0;
  for (const [c, pts] of shares) {
    const n = Math.max(1, Math.floor(pts / enemyPts * par / costOf(c)));
    const area = isRanged(c) ? B : melee++ ? Md : F;
    smart.push([c, n, ...area]); cost += n * costOf(c);
  }
  // Rundung kann über par führen: vom teuersten Posten abziehen
  while (cost > par + 1e-6) {
    const e = smart.reduce((a, b) => (costOf(b[0]) * b[1] > costOf(a[0]) * a[1] ? b : a));
    if (e[1] <= 1) break;
    e[1]--; cost -= costOf(e[0]);
  }

  // Erlaubte Einheiten: alle Konter des Plans, dazu Ablenkungen bis 5–6 Typen
  const units = [...new Set([...counters, ...(bossC ? [bossC] : [])])];
  const want = Math.max(units.length, rng() < .5 ? 5 : 6);
  const others = shuffle(DAILY_POOL.filter(t => paintable(t) && !isBoss(t) && !units.includes(t)));
  while (units.length < want) units.push(others.shift());
  const shown = shuffle(units);

  const foes = place.filter(p => p[0] !== 'tRect' && p[0] !== 'tCircle')
    .map(p => (p[0] === 'unit' ? `ein ${UNITS[p[1]].n}` : `${p[2]} ${p[2] === 1 ? UNITS[p[1]].n : plural(p[1])}`));
  const tName = { wasser: 'ein See', wald: 'ein Wald', mauer: 'eine Mauer', lava: 'Lava' }[terrain];
  const hint = `${list(shown.map(plural))}. Gegen dich stehen ${list(foes)}${terrain ? `, davor ${tName}` : ''}. Wer schlägt die ${plural(main)}?`;

  // Kategorien der erlaubten Einheiten (ohne 'gelaende'): in der Tageschallenge wird kein Gelände gemalt
  const cats = [...new Set(units.map(t => UNITS[t].cat))];
  return {
    id: 'daily-' + dateStr, n: `Tageschallenge ${shortDate(dateStr)}`, daily: dateStr,
    hint, budget, par, units: shown, cats, place, main,
    plan: { smart },
  };
}

// Öffentlicher Link des Spiels (Claude-Artefakt) für den Teilen-Text
export const PUBLIC_URL = 'https://claude.ai/artifact/QtMYbLk6di6csuGhk7YStf';
// Erste Tageschallenge: Nummer 1
export const DAILY_EPOCH = '2026-11-18';
export const dailyNo = dateStr => Math.round((Date.parse(dateStr + 'T00:00:00Z') - Date.parse(DAILY_EPOCH + 'T00:00:00Z')) / 864e5) + 1;
const MEDAL_ICONS = ['🛡️', '⚡', '🎯'];

// Text zum Teilen (fertig für einen Post, unter 280 Zeichen, ohne die Lösung zu verraten), z. B.
//   🖍️ Kritzelschlacht · Tageschallenge #1 (18.11.)
//   ⭐⭐⭐ Sieg mit 64 von 110 Punkten in 0:38
//   🟦🟦🟦🟦🟦🟦🟦🟥🟥🟥 7 von 10 überlebt
//   🛡️⚡ Medaillen
//   Schaffst du's billiger? https://claude.ai/…
// r: { win, spent, budget, stars, time (s), lost, deployed, medals: { mask } } (alles außer win/spent/stars optional)
export function shareText(dateStr, r) {
  const pts = String(Math.round(r.spent * 10) / 10).replace('.', ',');
  const lines = [`🖍️ Kritzelschlacht · Tageschallenge #${dailyNo(dateStr)} (${shortDate(dateStr)})`];
  if (r.win) {
    const t = r.time > 0 ? ` in ${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}` : '';
    lines.push(`${'⭐'.repeat(r.stars)}${'✩'.repeat(3 - r.stars)} Sieg mit ${pts}${r.budget ? ` von ${r.budget}` : ''} Punkten${t}`);
  } else lines.push('💥 Niederlage. Morgen gibt es eine neue Schlacht.');
  if (r.deployed > 0) {
    const alive = Math.max(0, r.deployed - (r.lost || 0)), blue = Math.round(alive / r.deployed * 10);
    lines.push(`${'🟦'.repeat(blue)}${'🟥'.repeat(10 - blue)} ${alive} von ${r.deployed} überlebt`);
  }
  const mask = r.medals ? r.medals.mask : 0;
  if (r.win && mask) lines.push(MEDAL_ICONS.filter((_, i) => (mask >> i) & 1).join('') + ' Medaillen');
  lines.push(`${r.win ? 'Schaffst du\'s billiger?' : 'Schaffst du es?'} ${PUBLIC_URL}`);
  return lines.join('\n');
}

// Bestwert eines Tages im Spielstand (save.daily) eintragen: weniger Punkte ist besser, ein Sieg schlägt jede Niederlage.
// Nur Siege werden gespeichert. Liefert den Eintrag des Tages (oder null).
export function recordDaily(daily, dateStr, r) {
  if (!r.win) return daily[dateStr] || null;
  const old = daily[dateStr];
  if (!old || r.spent < old.spent - 1e-9 || (Math.abs(r.spent - old.spent) < 1e-9 && r.stars > old.stars)) daily[dateStr] = { spent: r2(r.spent), stars: r.stars };
  return daily[dateStr];
}
