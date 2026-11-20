// Teilen per Code (Audit 18.11.): Dialog zum Anzeigen und Kopieren eines Codes und Dialog zum Einfügen und Laden.
// Baut sein Markup selbst (ein .ov mit .card, wie die anderen Dialoge in index.html) und hängt es an #app.
// Kopieren: navigator.clipboard, sonst execCommand('copy'), sonst markiert und „Strg+C zum Kopieren“ (das Spiel läuft auch
// in einem abgeschotteten iframe, dort ist die Zwischenablage oft gesperrt).

import { tr } from '../i18n.js';
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

export function createShareDialog(host) {
  const ov = el('div', 'ov sharedlg'); ov.hidden = true;
  const card = el('div', 'card shadow'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true');
  const h = el('h2'), p = el('p'), ta = el('textarea', 'code'), msg = el('div', 'codemsg');
  ta.spellcheck = false; ta.rows = 5; ta.setAttribute('aria-label', tr('Code'));
  const row = el('div', 'btnrow'), bMain = el('button', 'go'), bClose = el('button', 'btn', tr('Schließen'));
  row.append(bMain, bClose);
  card.append(h, p, ta, msg, row); ov.append(card); host.append(ov);
  card.querySelector('h2').id = 'shareTitle'; card.setAttribute('aria-labelledby', 'shareTitle');

  let onMain = null, busy = false, gen = 0;
  const setMsg = (t, bad = false) => { msg.textContent = tr(t || ''); msg.classList.toggle('bad', !!bad); };
  function open() { gen++; ov.hidden = false; setMsg(''); }
  function close() { gen++; ov.hidden = true; onMain = null; bMain.disabled = false; }
  bClose.onclick = close;
  bMain.onclick = () => { if (onMain && !busy && !bMain.disabled) onMain(); };
  ov.addEventListener('pointerdown', e => { if (e.target === ov) close(); });
  window.addEventListener('keydown', e => {
    if (ov.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !ta.readOnly) { e.preventDefault(); bMain.click(); }
  }, true);

  async function copy() {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(ta.value); setMsg(tr('Kopiert! Füge den Code woanders mit „Code laden“ ein.')); return; }
    } catch (e) { /* gesperrt: unten markieren */ }
    ta.focus(); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    setMsg(ok ? tr('Kopiert! Füge den Code woanders mit „Code laden“ ein.') : tr('Der Code ist markiert: Strg+C zum Kopieren.'));
  }

  // Code zeigen. code: Text oder Promise (encode ist asynchron)
  async function showCode(code, title = 'Teilen', text = 'Kopiere diesen Code und schicke ihn weiter. Wer ihn mit „Code laden“ einfügt, bekommt genau diese Aufstellung.') {
    h.textContent = tr(title); p.textContent = tr(text);
    ta.readOnly = true; ta.value = '…'; bMain.textContent = tr('Kopieren'); bMain.hidden = false; bMain.disabled = true; bClose.textContent = tr('Schließen');
    onMain = copy; open();
    const myGen = gen;
    try {
      const val = await code;
      if (myGen !== gen || ov.hidden) return;
      ta.value = val; bMain.disabled = false; setMsg(tr('{n} Zeichen', { n: ta.value.length }));
    } catch (e) {
      if (myGen !== gen || ov.hidden) return;
      ta.value = ''; setMsg(tr('Der Code konnte nicht erstellt werden.'), true); bMain.hidden = true; bMain.disabled = false;
    }
    ta.focus(); ta.select();
  }

  // Einfügen und laden. load(text) wirft einen Error mit deutscher Meldung oder lädt (dann schließt der Dialog)
  function openLoad(load) {
    h.textContent = tr('Code laden');
    p.textContent = tr('Füge einen Kritzelschlacht-Code ein: eine geteilte Schlacht oder ein eigenes Level.');
    ta.readOnly = false; ta.value = ''; bMain.textContent = tr('Laden'); bMain.hidden = false; bMain.disabled = false; bClose.textContent = tr('Abbrechen');
    onMain = async () => {
      busy = true; setMsg(tr('Lädt …'));
      try { await load(ta.value); close(); }
      catch (e) { setMsg((e && e.message) || tr('Der Code ist unvollständig oder beschädigt.'), true); }
      finally { busy = false; }
    };
    open(); ta.focus();
  }

  return { showCode, openLoad, close, isOpen: () => !ov.hidden };
}
