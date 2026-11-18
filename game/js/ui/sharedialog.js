// Teilen per Code (Audit 18.11.): Dialog zum Anzeigen und Kopieren eines Codes und Dialog zum Einfügen und Laden.
// Baut sein Markup selbst (ein .ov mit .card, wie die anderen Dialoge in index.html) und hängt es an #app.
// Kopieren: navigator.clipboard, sonst execCommand('copy'), sonst markiert und „Strg+C zum Kopieren“ (das Spiel läuft auch
// in einem abgeschotteten iframe, dort ist die Zwischenablage oft gesperrt).

const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

export function createShareDialog(host) {
  const ov = el('div', 'ov sharedlg'); ov.hidden = true;
  const card = el('div', 'card shadow'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true');
  const h = el('h2'), p = el('p'), ta = el('textarea', 'code'), msg = el('div', 'codemsg');
  ta.spellcheck = false; ta.rows = 5; ta.setAttribute('aria-label', 'Code');
  const row = el('div', 'btnrow'), bMain = el('button', 'go'), bClose = el('button', 'btn', 'Schließen');
  row.append(bMain, bClose);
  card.append(h, p, ta, msg, row); ov.append(card); host.append(ov);
  card.querySelector('h2').id = 'shareTitle'; card.setAttribute('aria-labelledby', 'shareTitle');

  let onMain = null, busy = false;
  const setMsg = (t, bad = false) => { msg.textContent = t || ''; msg.classList.toggle('bad', !!bad); };
  function open() { ov.hidden = false; setMsg(''); }
  function close() { ov.hidden = true; onMain = null; }
  bClose.onclick = close;
  bMain.onclick = () => { if (onMain && !busy) onMain(); };
  ov.addEventListener('pointerdown', e => { if (e.target === ov) close(); });
  window.addEventListener('keydown', e => {
    if (ov.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !ta.readOnly) { e.preventDefault(); bMain.click(); }
  }, true);

  async function copy() {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(ta.value); setMsg('Kopiert! Füge den Code woanders mit „Code laden“ ein.'); return; }
    } catch (e) { /* gesperrt: unten markieren */ }
    ta.focus(); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    setMsg(ok ? 'Kopiert! Füge den Code woanders mit „Code laden“ ein.' : 'Der Code ist markiert: Strg+C zum Kopieren.');
  }

  // Code zeigen. code: Text oder Promise (encode ist asynchron)
  async function showCode(code, title = 'Teilen', text = 'Kopiere diesen Code und schicke ihn weiter. Wer ihn mit „Code laden“ einfügt, bekommt genau diese Aufstellung.') {
    h.textContent = title; p.textContent = text;
    ta.readOnly = true; ta.value = '…'; bMain.textContent = 'Kopieren'; bMain.hidden = false; bClose.textContent = 'Schließen';
    onMain = copy; open();
    try { ta.value = await code; setMsg(`${ta.value.length} Zeichen`); }
    catch (e) { ta.value = ''; setMsg('Der Code konnte nicht erstellt werden.', true); bMain.hidden = true; }
    ta.focus(); ta.select();
  }

  // Einfügen und laden. load(text) wirft einen Error mit deutscher Meldung oder lädt (dann schließt der Dialog)
  function openLoad(load) {
    h.textContent = 'Code laden';
    p.textContent = 'Füge einen Kritzelschlacht-Code ein: eine geteilte Schlacht oder ein eigenes Level.';
    ta.readOnly = false; ta.value = ''; bMain.textContent = 'Laden'; bMain.hidden = false; bClose.textContent = 'Abbrechen';
    onMain = async () => {
      busy = true; setMsg('Lädt …');
      try { await load(ta.value); close(); }
      catch (e) { setMsg((e && e.message) || 'Der Code ist unvollständig oder beschädigt.', true); }
      finally { busy = false; }
    };
    open(); ta.focus();
  }

  return { showCode, openLoad, close, isOpen: () => !ov.hidden };
}
