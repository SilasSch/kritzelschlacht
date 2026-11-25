// Eigene Level (Audit 18.11.): Karte „Eigene Level“ in der Kapitelübersicht und die Liste der gespeicherten Level
// (Spielen, Bearbeiten, Teilen, Löschen). Nutzt die Übersicht ovList aus index.html wie die Kapitel (ui.js).
// Liest game.save.custom und ruft game.playCustom, editCustom, shareCustom, deleteCustom, enterEditor, openCodeLoad.
import { CATEGORIES } from '../data.js';
import { levelEnemyPoints, CUSTOM_MAX } from '../editor.js';
import { fmtPts } from '../cards.js';
import { tr } from '../i18n.js';

const $ = id => document.getElementById(id);
const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const CAT_N = Object.fromEntries(CATEGORIES.map(([k, n]) => [k, tr(n)]));

// Karte nach den Kapiteln (chgrid)
export function customCard(game, onOpen) {
  const n = (game.save.custom || []).length;
  const b = document.createElement('button'); b.className = 'ch custom'; b.dataset.ch = 'custom';
  b.innerHTML = `<span class="no">${tr('Selbst gebaut')}</span><span class="nm">${tr('Eigene Level')}</span>
    <span class="ds">${tr('Baue im Editor eigene Missionen, teste sie und teile sie per Code.')}</span>
    <span class="foot"><span class="tag">${n ? tr('{n} gespeichert', { n }) : tr('Noch keine')}</span></span>`;
  b.onclick = onOpen;
  return b;
}

export function openCustomList(game, back) {
  const list = game.save.custom || [];
  $('listTitle').textContent = tr('Eigene Level');
  $('listText').textContent = list.length
    ? tr('Deine gespeicherten Level (höchstens {n}). Sterne gibt es hier nicht, nur den Sieg.', { n: CUSTOM_MAX })
    : tr('Noch keine eigenen Level. Baue eines im Editor oder lade einen Code, den dir jemand geschickt hat.');
  const g = $('lvGrid'); g.innerHTML = ''; g.className = 'lvgrid cust';
  for (const l of list) {
    const card = document.createElement('div'); card.className = 'lv cl'; card.dataset.id = l.id;
    const cats = l.cats ? l.cats.map(k => CAT_N[k] || k).join(', ') : tr('alle Einheiten');
    card.innerHTML = `<span class="no">${tr('Budget {b} · Gegner {p} Pkt', { b: l.budget, p: fmtPts(levelEnemyPoints(l)) })}</span><span class="nm">${esc(tr(l.n))}</span>
      <span class="cats">${esc(cats)}</span>
      <span class="acts"><button class="go sm" data-a="play">${tr('Spielen')}</button><button class="mini" data-a="edit">${tr('Bearbeiten')}</button>
      <button class="mini" data-a="share">${tr('Teilen')}</button><button class="mini del" data-a="del">${tr('Löschen')}</button></span>`;
    card.addEventListener('click', e => {
      const a = e.target.closest('button'); if (!a) return;
      if (a.dataset.a === 'play') { $('ovList').hidden = true; game.playCustom(l.id); }
      else if (a.dataset.a === 'edit') { $('ovList').hidden = true; game.editCustom(l.id); }
      else if (a.dataset.a === 'share') game.shareCustom(l.id);
      else if (a.dataset.a === 'del') {
        // zweistufig statt confirm() (im iframe oft gesperrt)
        if (!a.classList.contains('sure')) { a.classList.add('sure'); a.textContent = tr('Wirklich?'); return; }
        game.deleteCustom(l.id); openCustomList(game, back);
      }
    });
    g.append(card);
  }
  const tools = document.createElement('div'); tools.className = 'lv cl new';
  tools.innerHTML = `<span class="nm">${tr('Neues Level')}</span><span class="cats">${tr('Im Editor Gegner und Gelände malen')}</span>
    <span class="acts"><button class="go sm" data-a="new">${tr('Zum Editor')}</button><button class="mini" data-a="code">${tr('Code laden')}</button></span>`;
  tools.addEventListener('click', e => {
    const a = e.target.closest('button'); if (!a) return;
    if (a.dataset.a === 'new') { $('ovList').hidden = true; game.enterEditor(); }
    else { game.openCodeLoad(); }
  });
  g.append(tools);
  $('listBack').hidden = false;
  $('listBack').onclick = back;
  $('listClose').textContent = tr('Schließen');
  $('ovList').hidden = false;
}
