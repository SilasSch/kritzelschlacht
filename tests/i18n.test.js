// Sprache (18.11.): Englisch neben Deutsch. Prüft, dass jeder sichtbare Text eine englische Übersetzung hat, dass die
// Platzhalter passen und dass die Sprache nichts an Simulation, Codes und Tageschallenge ändert.
// Neue Texte (auch neue Einheiten): Schlüssel in game/js/lang/en.js eintragen; die Fehlermeldung nennt Text und Herkunft.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import EN, { EN_PLURAL } from '../game/js/lang/en.js';
import { tr, setLang, unitName, unitPlural, detectLang, remember, LANG } from '../game/js/i18n.js';
import { UNITS, PLURAL } from '../game/js/data.js';
import { dataStrings } from './i18n-data.mjs';
import { scanSource, looksGerman } from './i18n-scan.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const JS = path.join(ROOT, 'game/js');
const has = k => Object.prototype.hasOwnProperty.call(EN, k);
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
// Ohne Übersetzung: Debug-Szenen und Benchmarks (nur mit ?debug / ?bench), die Übersetzungen selbst
const SKIP = new Set(['debug/scenes.js', 'benchhud.js', 'bench.js', 'lang/en.js', 'i18n.js']);
const FILES = walk(JS).map(f => path.relative(JS, f)).filter(f => !SKIP.has(f));
const report = (what, list) => `${list.length} ${what} ohne englische Übersetzung (game/js/lang/en.js):\n` + list.slice(0, 40).map(x => '  ' + x).join('\n');

test('i18n: ohne DOM (Tests, tools/) ist die Sprache Deutsch, tr gibt den deutschen Text zurück', () => {
  assert.equal(LANG, 'de');
  assert.equal(detectLang({}), 'de');
  assert.equal(tr('Los!'), 'Los!');
  assert.equal(tr('{n} Punkte', { n: 5 }), '5 Punkte');
});

test('i18n: Vorauswahl nach ?lang, gespeicherter Wahl und Browsersprache', () => {
  const env = (search, stored, langs) => ({ document: {}, location: { search }, localStorage: { getItem: () => stored }, navigator: { languages: langs } });
  assert.equal(detectLang(env('?lang=en', 'de', ['de-DE'])), 'en');
  assert.equal(detectLang(env('', 'en', ['de-DE'])), 'en');
  assert.equal(detectLang(env('', null, ['de-AT', 'en'])), 'de');
  assert.equal(detectLang(env('', null, ['en-US', 'de'])), 'en');
  assert.equal(detectLang(env('', null, ['fr-FR'])), 'en');
});

test('i18n: Wechsel ohne Adressänderung, gemerkt in localStorage, sessionStorage und window.name (Artefakt-Rahmen)', () => {
  const box = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };
  const broken = { getItem() { throw new Error('gesperrt'); }, setItem() { throw new Error('gesperrt'); } };
  const nav = { languages: ['de-DE'] };
  // Speicher geht: Wahl kommt nach dem Neuladen zurück, auch gegen ?lang= im Link
  const a = { document: {}, location: { search: '?lang=de' }, localStorage: box(), sessionStorage: box(), name: '', navigator: nav };
  remember('en', a);
  assert.equal(a.localStorage.getItem('kritzelschlacht-lang'), 'en');
  assert.equal(detectLang(a), 'en');
  // Kein Speicher (gesperrter Rahmen): window.name trägt die Wahl, fremder Inhalt darin bleibt erhalten
  const b = { document: {}, location: { search: '' }, localStorage: broken, sessionStorage: broken, name: 'fremd', navigator: nav };
  remember('en', b);
  assert.equal(detectLang(b), 'en');
  assert.match(b.name, /^fremd;/);
  remember('de', b);
  assert.equal(detectLang(b), 'de');
  assert.equal(b.name.match(/kritzelschlacht-lang/g).length, 1);
  // i18n.js ändert die Adresse nie (eingebetteter Rahmen)
  const src = fs.readFileSync(path.join(JS, 'i18n.js'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/location\.(replace|assign|href\s*=)|history\./.test(src), 'i18n.js darf die Adresse nicht ändern');
});

test('i18n: alle Spieldaten haben eine englische Übersetzung (Einheiten, Fähigkeiten, Synergien, Gelände, Level, Regeln, Karten)', () => {
  const miss = dataStrings().filter(([, s]) => !has(s)).map(([w, s]) => `${w}: ${JSON.stringify(s)}`);
  assert.deepEqual(miss, [], report('Spieltexte', miss));
});

test('i18n: jede Einheit hat einen englischen Plural (EN_PLURAL)', () => {
  const miss = Object.keys(UNITS).filter(k => !EN_PLURAL[k] && (PLURAL[k] || UNITS[k].paint !== false));
  assert.deepEqual(miss, [], `Plural fehlt in EN_PLURAL (game/js/lang/en.js): ${miss.join(', ')}`);
});

test('i18n: jeder Text in tr(…) im Spielcode hat eine englische Übersetzung', () => {
  const miss = [];
  for (const f of FILES) {
    const { keys } = scanSource(fs.readFileSync(path.join(JS, f), 'utf8'));
    for (const k of keys) if (!has(k.s) && /[A-Za-zÄÖÜäöüß]/.test(k.s)) miss.push(`${f}:${k.line} ${JSON.stringify(k.s)}`);
  }
  assert.deepEqual(miss, [], report('Texte in tr()', miss));
});

// Deutsche Texte in der Oberfläche, die nicht durch tr laufen: würden im Englischen deutsch erscheinen.
// Gemeldet wird, was deutsch aussieht oder ein Schlüssel in EN ist. Ausnahmen: Meldungen, die als Konstante verglichen
// und dann über ui.toast (übersetzt selbst) gezeigt werden, Listen, die gleich darauf durch tr laufen, und Debug-Text.
const LOOSE_OK = new Set(['Einheiten · LOD', 'Ergebnis kopiert.', 'Unbekannt', 'Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Teilen', 'Kopiere diesen Code und schicke ihn weiter. Wer ihn mit „Code laden“ einfügt, bekommt genau diese Aufstellung.']);
test('i18n: keine deutschen Texte an tr vorbei in der Oberfläche (main.js, ui.js, ui/*)', () => {
  const ui = FILES.filter(f => f === 'main.js' || f === 'ui.js' || f.startsWith('ui/'));
  const bad = [];
  for (const f of ui) {
    const { loose } = scanSource(fs.readFileSync(path.join(JS, f), 'utf8'));
    for (const t of loose) if ((looksGerman(t.s) || (!t.tpl && has(t.s) && EN[t.s] !== t.s)) && !LOOSE_OK.has(t.s.trim())) bad.push(`${f}:${t.line} ${JSON.stringify(t.s.trim().slice(0, 90))}`);
  }
  assert.deepEqual(bad, [], `${bad.length} deutsche Texte ohne tr(…):\n` + bad.slice(0, 40).map(x => '  ' + x).join('\n'));
});

// Feste Texte in index.html (Textknoten, title, aria-label, placeholder; Elemente mit data-i18n als Ganzes),
// die i18n.translateDom beim Start übersetzt
function htmlTexts(html) {
  let body = html.slice(html.indexOf('<body'));
  body = body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const out = [], norm = s => s.replace(/\s+/g, ' ').trim();
  body = body.replace(/<(\w+)[^>]*\sdata-i18n[^>]*>([\s\S]*?)<\/\1>/g, (m, t, inner) => { out.push(norm(inner)); return ''; });
  for (const m of body.matchAll(/\s(?:title|aria-label|placeholder)="([^"]*)"/g)) out.push(norm(m[1]));
  for (const m of body.matchAll(/>([^<>]+)</g)) out.push(norm(m[1]));
  return [...new Set(out)].filter(s => /[A-Za-zÄÖÜäöüß]{2,}/.test(s));
}
const HTML_OK = new Set(['Kritzel', 'schlacht', 'Kritzelschlacht', 'EN', 'Replay', 'Editor']);
test('i18n: feste Texte in index.html haben eine englische Übersetzung', () => {
  const html = fs.readFileSync(path.join(ROOT, 'game/index.html'), 'utf8');
  const miss = htmlTexts(html).filter(s => !has(s) && !HTML_OK.has(s));
  assert.deepEqual(miss, [], report('Texte in index.html', miss));
});

test('i18n: Platzhalter {…} stimmen zwischen Deutsch und Englisch überein, kein Wert ist leer', () => {
  const ph = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
  const bad = Object.entries(EN).filter(([k, v]) => typeof v !== 'string' || !v.trim() || ph(k) !== ph(v)).map(([k, v]) => `${JSON.stringify(k)} → ${JSON.stringify(v)}`);
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('i18n: auf Englisch zeigen Karten, Hinweise und Tageschallenge Englisch; Simulation und Codes bleiben gleich', async () => {
  const { unitCard } = await import('../game/js/cards.js');
  const { dailyLevel, shareText } = await import('../game/js/daily.js');
  const { simVersion, SIM_VERSION } = await import('../game/js/dailyboard.js');
  const { defeatHint } = await import('../game/js/hints.js');
  const de = { card: unitCard('ritter'), day: dailyLevel('2026-11-20'), v: simVersion() };
  try {
    setLang('en');
    assert.equal(unitName('krieger'), 'Warrior');
    assert.equal(unitPlural('krieger'), 'Warriors');
    assert.equal(tr('{n} Punkte', { n: 5 }), '5 points');
    const card = unitCard('ritter');
    assert.equal(card.name, 'Knight');
    assert.ok(card.abil.every(a => has(UNITS.ritter.abil.find(x => tr(x.n) === a.n).n)));
    assert.deepEqual(card.stats, de.card.stats);
    // Tageschallenge: dasselbe Level (Gegner, Budget, Einheiten), nur Name und Hinweis englisch
    const day = dailyLevel('2026-11-20');
    assert.deepEqual({ ...day, n: 0, hint: 0 }, { ...de.day, n: 0, hint: 0 });
    assert.match(day.n, /^Daily challenge 11\/20$/);
    assert.ok(!looksGerman(day.hint), day.hint);
    assert.ok(!looksGerman(shareText('2026-11-20', { win: true, spent: 64, budget: 110, stars: 3, time: 38, deployed: 10, lost: 3, medals: { mask: 3 } })));
    const h = defeatHint({ killers: new Map([['ritter', 7], ['krieger', 1]]), level: null });
    assert.ok(!looksGerman(h.text), h.text);
    // Spielversion der Bestenliste hängt nicht an der Sprache
    assert.equal(simVersion(), de.v);
    assert.equal(simVersion(), SIM_VERSION);
  } finally { setLang('de'); }
});

test('i18n: englische Kartentexte halten dieselben Längen wie die deutschen (Name ≤ 24, Text ≤ 140 Zeichen)', () => {
  const bad = [];
  for (const k in UNITS) for (const a of UNITS[k].abil || []) {
    if (has(a.n) && EN[a.n].length > 24) bad.push(`${k}: ${EN[a.n]}`);
    if (has(a.d) && EN[a.d].length > 140) bad.push(`${k}: ${EN[a.d]} (${EN[a.d].length})`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});
