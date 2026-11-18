// Leiste des Level-Editors (Audit 18.11.): Name, Hinweis, Budget (leer = Vorschlag aus den Gegnern), erlaubte Kategorien,
// Leeren / Testen / Teilen / Speichern. Baut ihr Markup selbst (Stil wie .misbar) und steht unter der Schlacht-Leiste.
// Liest game.editor ({ meta: { n, hint, budget, cats }, savedId }) und ruft game.clear, editorTest, editorShare, editorSave.
import { CATEGORIES } from '../data.js';
import { armyPoints } from '../sim.js';
import { suggestBudget, UNIT_CATS, NAME_MAX, HINT_MAX } from '../editor.js';
import { fmtPts } from '../cards.js';
import { tr } from '../i18n.js';

const $ = id => document.getElementById(id);
const CAT_N = Object.fromEntries(CATEGORIES.map(([k, n]) => [k, tr(n)]));

export function createEditorBar(game) {
  const bar = document.createElement('div');
  bar.className = 'misbar edbar shadow p'; bar.id = 'edBar'; bar.hidden = true;
  bar.innerHTML = `<div class="mt"><div class="mn">${tr('Level-Editor')}</div><div class="mh">${tr('Male Gegner rechts der Linie · Gelände überall')}</div></div>
    <div class="edf">
      <input id="edName" type="text" maxlength="${NAME_MAX}" placeholder="${tr('Name des Levels')}" aria-label="${tr('Name des Levels')}">
      <input id="edHint" type="text" maxlength="${HINT_MAX}" placeholder="${tr('Hinweis für Spieler (optional)')}" aria-label="${tr('Hinweis')}">
    </div>
    <div class="edf">
      <label class="edb">${tr('Budget')} <input id="edBud" type="number" min="1" max="99999" step="1" inputmode="numeric" aria-label="Budget"></label>
      <span class="edpts" id="edPts"></span>
    </div>
    <div class="edcats" role="group" aria-label="${tr('Erlaubte Einheiten')}">${UNIT_CATS.map(k =>
      `<label><input type="checkbox" data-cat="${k}" checked>${CAT_N[k]}</label>`).join('')}</div>
    <button class="btn" id="edClear">${tr('Leeren')}</button>
    <button class="btn" id="edShare">${tr('Teilen')}</button>
    <button class="btn" id="edSave">${tr('Speichern')}</button>
    <button class="go" id="edTest">${tr('Testen')}</button>`;
  const anchor = $('batBar') || $('misBar');
  anchor.after(bar);

  const meta = () => game.editor && game.editor.meta;
  $('edName').oninput = e => { if (meta()) meta().n = e.target.value; };
  $('edHint').oninput = e => { if (meta()) meta().hint = e.target.value; };
  $('edBud').oninput = e => { if (meta()) meta().budget = e.target.value; };
  bar.querySelectorAll('.edcats input').forEach(cb => {
    cb.onchange = () => {
      const on = [...bar.querySelectorAll('.edcats input')].filter(c => c.checked).map(c => c.dataset.cat);
      if (!on.length) { cb.checked = true; game.toast(tr('Mindestens eine Kategorie muss erlaubt sein.')); return; }
      if (meta()) meta().cats = on;
    };
  });
  $('edClear').onclick = () => game.clear();
  $('edTest').onclick = e => { e.currentTarget.blur(); game.editorTest(); };
  $('edShare').onclick = () => game.editorShare();
  $('edSave').onclick = () => game.editorSave();

  // Werte aus game.editor in die Felder (beim Betreten und nach dem Laden eines Levels)
  function fill() {
    const m = meta(); if (!m) return;
    $('edName').value = m.n || ''; $('edHint').value = m.hint || ''; $('edBud').value = m.budget || '';
    const cats = m.cats || UNIT_CATS;
    bar.querySelectorAll('.edcats input').forEach(c => { c.checked = cats.includes(c.dataset.cat); });
    tick();
  }
  let lastPts = -1;
  function tick() {
    if (!game.editor) return;
    const p = armyPoints(game.world).rot;
    if (p === lastPts) return;
    lastPts = p;
    const s = suggestBudget(p);
    $('edBud').placeholder = String(s);
    $('edPts').textContent = tr('Gegner {p} Pkt · Vorschlag {s}', { p: fmtPts(p), s });
  }
  // nach ui.updateMode: Leiste, Reiter und Knöpfe für den Editor
  function update() {
    const ed = !!game.editor, mis = game.mission;
    bar.hidden = !ed;
    $('mEd').classList.toggle('on', ed || !!(mis && mis.custom === 'editor'));
    if (ed) {
      $('mSand').classList.remove('on');
      $('bDice').hidden = true; $('teamBox').hidden = true; $('chips').hidden = true;
      lastPts = -1; tick();
    }
    if (mis && mis.custom === 'editor') $('mMis').classList.remove('on');
    if (mis) $('misList').textContent = mis.custom === 'editor' ? tr('Zum Editor') : mis.custom ? tr('Eigene Level') : tr('Übersicht');
  }
  return { update, tick, fill };
}
