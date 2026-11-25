// Armee-Vorlagen (25.11.): Knopf „Vorlagen“ in der Missions- und der Schlachtleiste, darunter eine kleine Liste:
// aktuelle Armee speichern, gespeicherte laden oder löschen. Die Regeln stehen in templates.js, main.js liefert
// game.tplList, tplSave, tplLoad, tplDelete und tplReady (ob gerade geplant wird).
import { fmtPts } from '../cards.js';
import { tr } from '../i18n.js';

const CSS = `
.tplpop{position:fixed;z-index:60;background:#fff;border:2px solid var(--ink);border-radius:14px;padding:10px;min-width:250px;max-width:320px;display:flex;flex-direction:column;gap:6px}
.tplpop .row{display:flex;align-items:center;gap:6px}
.tplpop .row .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tplpop .row small{color:var(--muted);font-weight:700}
.tplpop .empty{color:var(--muted);font-size:12.5px}
.tplpop .x{border:0;background:transparent;color:var(--muted);font-size:16px;cursor:pointer;padding:2px 6px}
`;
const ICON = '<svg viewBox="0 0 24 24" class="ico"><path d="M6 3h9l3 3v15H6z"/><path d="M9 3v5h6V3M9 14h6M9 17h4"/></svg>';
const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function createTemplatesUI(game) {
  const $ = id => document.getElementById(id);
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  let pop = null, at = null;

  const mk = (id, before) => {
    const b = document.createElement('button');
    b.className = 'btn'; b.id = id; b.innerHTML = ICON + `<span>${esc(tr('Vorlagen'))}</span>`;
    b.title = tr('Armee als Vorlage speichern oder eine gespeicherte laden');
    b.setAttribute('aria-haspopup', 'menu');
    b.onclick = e => { e.stopPropagation(); if (pop && at === b) close(); else open(b); };
    before.before(b);
    return b;
  };
  const bMis = mk('misTpl', $('misList'));
  const bBat = mk('batTpl', $('batMoreW') || $('batShare'));   // vor dem Mehr-Menü (UX-Review 25.11.)

  function close() { if (pop) { pop.remove(); pop = null; } }
  function open(anchor) {
    close(); at = anchor;
    pop = document.createElement('div');
    pop.className = 'tplpop shadow'; pop.setAttribute('role', 'menu');
    render();
    document.body.append(pop);
    const r = anchor.getBoundingClientRect(), w = pop.offsetWidth;
    pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px';
    const below = r.bottom + 6, h = pop.offsetHeight;
    pop.style.top = (below + h < innerHeight ? below : Math.max(8, r.top - h - 6)) + 'px';
  }
  function render() {
    const list = game.tplList();
    pop.innerHTML = `<button class="btn" data-a="save">＋ ${esc(tr('Aktuelle Armee speichern'))}</button>
      ${list.length ? list.map((t, i) => `<div class="row"><span class="nm" title="${esc(t.n)}">${esc(t.n)} <small>${tr('{n} Einh. · {p} Pkt', { n: t.u.length, p: fmtPts(t.pts) })}</small></span>
        <button class="mini" data-a="load" data-i="${i}">${esc(tr('Laden'))}</button><button class="x" data-a="del" data-i="${i}" title="${esc(tr('Löschen'))}" aria-label="${esc(tr('Löschen'))}">×</button></div>`).join('')
        : `<div class="empty">${esc(tr('Noch keine Vorlagen. Male eine Armee und speichere sie hier.'))}</div>`}`;
    pop.onclick = e => {
      e.stopPropagation();
      const b = e.target.closest('button'); if (!b) return;
      const i = +b.dataset.i;
      if (b.dataset.a === 'save') { if (game.tplSave()) render(); }
      else if (b.dataset.a === 'load') { game.tplLoad(i); close(); }
      else if (b.dataset.a === 'del') { game.tplDelete(i); render(); }
    };
  }
  document.addEventListener('pointerdown', e => { if (pop && !pop.contains(e.target) && e.target !== bMis && e.target !== bBat && !bMis.contains(e.target) && !bBat.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (pop && e.key === 'Escape') close(); });

  // Sichtbar nur in der Planung (Mission oder freie Schlacht, nicht Hotseat, Online, Duell)
  function sync() {
    const m = game.mission, b = game.battle;
    bMis.hidden = !(m && m.phase === 'plan');
    bBat.hidden = !(b && b.phase === 'plan' && !b.hot);
    if (pop && (!game.tplReady() || (at && at.hidden))) close();
  }
  return { sync, close, isOpen: () => !!pop };
}
