// Eigene Level (Audit 18.11.): Karte „Eigene Level“ in der Kapitelübersicht und die Liste der gespeicherten Level
// (Spielen, Bearbeiten, Teilen, Löschen). Nutzt die Übersicht ovList aus index.html wie die Kapitel (ui.js).
// Liest game.save.custom und ruft game.playCustom, editCustom, shareCustom, deleteCustom, enterEditor, openCodeLoad.
import { CATEGORIES } from '../data.js';
import { levelEnemyPoints, CUSTOM_MAX } from '../editor.js';
import { fmtPts } from '../cards.js';

const $ = id => document.getElementById(id);
const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const CAT_N = Object.fromEntries(CATEGORIES);

// Karte nach den Kapiteln (chgrid)
export function customCard(game, onOpen) {
  const n = (game.save.custom || []).length;
  const b = document.createElement('button'); b.className = 'ch custom'; b.dataset.ch = 'custom';
  b.innerHTML = `<span class="no">Selbst gebaut</span><span class="nm">Eigene Level</span>
    <span class="ds">Baue im Editor eigene Missionen, teste sie und teile sie per Code.</span>
    <span class="foot"><span class="tag">${n ? `${n} gespeichert` : 'Noch keine'}</span></span>`;
  b.onclick = onOpen;
  return b;
}

export function openCustomList(game, back) {
  const list = game.save.custom || [];
  $('listTitle').textContent = 'Eigene Level';
  $('listText').textContent = list.length
    ? `Deine gespeicherten Level (höchstens ${CUSTOM_MAX}). Sterne gibt es hier nicht, nur den Sieg.`
    : 'Noch keine eigenen Level. Baue eines im Editor oder lade einen Code, den dir jemand geschickt hat.';
  const g = $('lvGrid'); g.innerHTML = ''; g.className = 'lvgrid cust';
  for (const l of list) {
    const card = document.createElement('div'); card.className = 'lv cl'; card.dataset.id = l.id;
    const cats = l.cats ? l.cats.map(k => CAT_N[k] || k).join(', ') : 'alle Einheiten';
    card.innerHTML = `<span class="no">Budget ${l.budget} · Gegner ${fmtPts(levelEnemyPoints(l))} Pkt</span><span class="nm">${esc(l.n)}</span>
      <span class="cats">${esc(cats)}</span>
      <span class="acts"><button class="go sm" data-a="play">Spielen</button><button class="mini" data-a="edit">Bearbeiten</button>
      <button class="mini" data-a="share">Teilen</button><button class="mini del" data-a="del">Löschen</button></span>`;
    card.addEventListener('click', e => {
      const a = e.target.closest('button'); if (!a) return;
      if (a.dataset.a === 'play') { $('ovList').hidden = true; game.playCustom(l.id); }
      else if (a.dataset.a === 'edit') { $('ovList').hidden = true; game.editCustom(l.id); }
      else if (a.dataset.a === 'share') game.shareCustom(l.id);
      else if (a.dataset.a === 'del') {
        // zweistufig statt confirm() (im iframe oft gesperrt)
        if (!a.classList.contains('sure')) { a.classList.add('sure'); a.textContent = 'Wirklich?'; return; }
        game.deleteCustom(l.id); openCustomList(game, back);
      }
    });
    g.append(card);
  }
  const tools = document.createElement('div'); tools.className = 'lv cl new';
  tools.innerHTML = `<span class="nm">Neues Level</span><span class="cats">Im Editor Gegner und Gelände malen</span>
    <span class="acts"><button class="go sm" data-a="new">Zum Editor</button><button class="mini" data-a="code">Code laden</button></span>`;
  tools.addEventListener('click', e => {
    const a = e.target.closest('button'); if (!a) return;
    if (a.dataset.a === 'new') { $('ovList').hidden = true; game.enterEditor(); }
    else { game.openCodeLoad(); }
  });
  g.append(tools);
  $('listBack').hidden = false;
  $('listBack').onclick = back;
  $('listClose').textContent = game.mission ? 'Zurück zum Sandkasten' : 'Schließen';
  $('ovList').hidden = false;
}
