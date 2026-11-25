// Spielername (25.11.): ein Name für Bestenliste, König des Hügels und 2 gegen 2. Im Artefakt kommen Namen in der
// Bestenliste vom Claude-Konto; auf itch.io (ohne Konto) fragt askName() einmal danach. Gespeichert im Browser.
import { cleanName, NAME_MAX } from '../dailyboard.js';
import { tr } from '../i18n.js';

const KEY = 'kritzel-hill-name';            // seit 25.11. von Hügel und 2v2 genutzt, jetzt für alles
const OLD_BOARD = 'kritzel-dailyboard';     // dort stand vorher store.name der Bestenliste
const subs = new Set();
let name = '';
try {
  name = cleanName(localStorage.getItem(KEY) || '');
  if (!name) name = cleanName((JSON.parse(localStorage.getItem(OLD_BOARD) || 'null') || {}).name);
} catch (e) { /* ohne Speicher */ }

export const getName = () => name;
export function setName(v) {
  const n = cleanName(v);
  if (n === name) return;
  name = n;
  try { localStorage.setItem(KEY, n); } catch (e) { /* ohne Speicher */ }
  for (const f of subs) try { f(n); } catch (e) { /* Abonnent */ }
}
export function onName(f) { subs.add(f); return () => subs.delete(f); }
// Ohne Claude-Konto (itch.io) braucht die Seite einen selbst gewählten Namen
export const needsName = () => typeof window !== 'undefined' && typeof window.KS_RELAY === 'string' && !name;

// Kleine Abfrage: „Wie heißt du?“ → Promise mit dem Namen (oder '' bei „Später“)
let asking = null;
export function askName() {
  if (asking) return asking;
  asking = new Promise(done => {
    const ov = document.createElement('div');
    ov.className = 'ov'; ov.id = 'ovName'; ov.style.zIndex = '30';   // über Bestenliste und Hügel
    ov.innerHTML = `<div class="card shadow" role="dialog" aria-modal="true" aria-labelledby="nameTitle" style="max-width:380px">
      <h2 id="nameTitle">${tr('Wie heißt du?')}</h2>
      <p class="muted">${tr('Dein Name in der Bestenliste, auf dem Thron und im Online-Spiel. Du kannst ihn später ändern.')}</p>
      <div class="row"><input id="nameIn" maxlength="${NAME_MAX}" placeholder="${tr('Name')}" autocomplete="off" spellcheck="false" style="flex:1;font:800 16px var(--f-ui);padding:8px 12px;border:1.5px solid var(--line);border-radius:10px"></div>
      <div class="btnrow"><button class="go" id="nameOk">${tr('Los geht\'s')}</button><button class="btn" id="nameLater">${tr('Später')}</button></div></div>`;
    (document.getElementById('app') || document.body).append(ov);
    const inp = ov.querySelector('#nameIn'), ok = ov.querySelector('#nameOk');
    const close = v => { ov.remove(); asking = null; done(v); };
    const sync = () => { ok.disabled = !cleanName(inp.value); };
    inp.value = name; sync();
    inp.oninput = sync;
    inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter' && cleanName(inp.value)) ok.click(); if (e.key === 'Escape') close(''); };
    ok.onclick = () => { setName(inp.value); close(name); };
    ov.querySelector('#nameLater').onclick = () => close('');
    setTimeout(() => inp.focus(), 0);
  });
  return asking;
}
