// Sprache (18.11.): Deutsch ist die Quelle, Englisch kommt aus lang/en.js. Rein Darstellung: Die Simulation, Codes
// (Armee, Duell, Level, Tageschallenge) und die Bestenliste sehen nie übersetzten Text, alle Spieler bleiben kompatibel.
//
// tr(de, vars): der deutsche Text ist der Schlüssel. Ist die Sprache Englisch und steht er in EN, kommt die Übersetzung,
// sonst der deutsche Text (fällt also nie leer aus). {name} im Text wird aus vars ersetzt, in beiden Sprachen.
// Neue Texte: im Code tr('…') schreiben und den Schlüssel in lang/en.js eintragen. tests/i18n.test.js meldet jeden
// fehlenden Schlüssel, auch die Spieldaten (Einheiten, Fähigkeiten, Synergien, Gelände, Kapitel, Level).
// Einheiten im Plural: unitPlural(k) über EN_PLURAL nach id (im Deutschen sind „Krieger“ und „Krieger“ gleich).
import EN, { EN_PLURAL } from './lang/en.js';
import { UNITS, PLURAL } from './data.js';

export const LANGS = ['de', 'en'];
export const LANG_KEY = 'kritzelschlacht-lang';

// Vorauswahl: ?lang=…, dann die gespeicherte Wahl, dann die Browsersprache (Deutsch nur bei de-*, sonst Englisch).
// Ohne DOM (Node, Tests, tools/) immer Deutsch.
export function detectLang(env = globalThis) {
  if (typeof env.document === 'undefined') return 'de';
  try { const q = new URLSearchParams(env.location.search).get('lang'); if (LANGS.includes(q)) return q; } catch (e) { /* kein location */ }
  try { const s = env.localStorage.getItem(LANG_KEY); if (LANGS.includes(s)) return s; } catch (e) { /* kein Speicher */ }
  try {
    const nav = env.navigator || {}, list = nav.languages && nav.languages.length ? nav.languages : [nav.language || ''];
    return /^de\b/i.test(list[0] || '') ? 'de' : 'en';
  } catch (e) { return 'de'; }
}

export let LANG = detectLang();
export function setLang(l) { if (LANGS.includes(l)) LANG = l; return LANG; }
export const isEn = () => LANG === 'en';

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);
export function tr(de, vars) {
  if (de == null) return '';
  const s = LANG === 'en' && Object.prototype.hasOwnProperty.call(EN, de) ? EN[de] : de;
  return fill(String(s), vars);
}

// Spieldaten: Name und Plural einer Einheit (oder eines Geländes), nach id
export const unitName = k => tr(UNITS[k] ? UNITS[k].n : k);
export function unitPlural(k) {
  if (LANG === 'en' && EN_PLURAL[k]) return EN_PLURAL[k];
  return PLURAL[k] || (UNITS[k] ? tr(UNITS[k].n) : k);
}

// Zahlen: Komma im Deutschen, Punkt im Englischen
export const dec = s => (LANG === 'en' ? String(s) : String(s).replace('.', ','));

// Sprache wechseln: merken und neu laden (alle Leisten, Karten und Dialoge werden so frisch gebaut).
// Ohne Speicher trägt ?lang= die Wahl über das Neuladen.
export function switchLang(l) {
  if (!LANGS.includes(l)) return;
  let stored = false;
  try { localStorage.setItem(LANG_KEY, l); stored = localStorage.getItem(LANG_KEY) === l; } catch (e) { /* kein Speicher */ }
  try {
    const u = new URL(location.href);
    if (stored && !u.searchParams.has('lang')) { location.reload(); return; }
    u.searchParams.set('lang', l); location.replace(u.href);
  } catch (e) { location.reload(); }
}

// Feste Texte aus index.html: Textknoten und die Attribute title, aria-label, placeholder. Elemente mit data-i18n
// übersetzen ihr ganzes innerHTML als einen Schlüssel (Sätze mit <b> darin).
const ATTRS = ['title', 'aria-label', 'placeholder'];
const norm = s => s.replace(/\s+/g, ' ').trim();
export function translateDom(root) {
  if (LANG === 'de' || !root) return;
  const els = root.querySelectorAll('*');
  for (const el of [root, ...els]) {
    for (const a of ATTRS) { const v = el.getAttribute && el.getAttribute(a); if (v) el.setAttribute(a, tr(norm(v))); }
    if (el.hasAttribute && el.hasAttribute('data-i18n')) { el.innerHTML = tr(norm(el.innerHTML)); continue; }
    if (el.closest && el.closest('[data-i18n]') && el !== root) continue;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3) continue;
      const k = norm(n.nodeValue);
      if (!k || !Object.prototype.hasOwnProperty.call(EN, k)) continue;
      n.nodeValue = n.nodeValue.match(/^\s*/)[0] + EN[k] + n.nodeValue.match(/\s*$/)[0];
    }
  }
}
