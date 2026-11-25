// Erfolge (25.11.): Liste in der Übersicht (ovList) mit Fortschrittsbalken, aufgerufen über die Karte „Erfolge“.
import { ACHIEVEMENTS } from '../achievements.js';
import { tr } from '../i18n.js';

const $ = id => document.getElementById(id);
const CSS = `
.achgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.ach{border:1.5px solid var(--line);background:#fff;border-radius:14px;padding:10px 12px;display:flex;gap:10px;align-items:flex-start}
.ach .ic{font-size:26px;line-height:1;filter:grayscale(1);opacity:.45}
.ach.on{border-color:var(--ink);box-shadow:2px 3px 0 var(--ink);background:linear-gradient(135deg,#fff4d6,#fff 70%)}
.ach.on .ic{filter:none;opacity:1}
.ach .tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.ach .nm{font-weight:800;font-size:14.5px}
.ach .ds{font-size:12px;color:var(--muted);line-height:1.35}
.ach .bar{height:7px;border-radius:99px;background:var(--soft);border:1px solid var(--line);overflow:hidden;margin-top:3px}
.ach .bar i{display:block;height:100%;background:var(--gold)}
.ach .ct{font-size:11.5px;color:var(--muted)}
`;
let styled = false;

export function openAchievements(game) {
  if (!styled) { styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.append(s); }
  const a = game.save.ach, got = ACHIEVEMENTS.filter(x => a.got[x.id]).length;
  $('listTitle').textContent = tr('Erfolge');
  $('listText').textContent = tr('{a} von {b} geschafft.', { a: got, b: ACHIEVEMENTS.length });
  const g = $('lvGrid'); g.innerHTML = ''; g.className = 'achgrid';
  for (const x of ACHIEVEMENTS) {
    const [c, m] = x.p(a), on = !!a.got[x.id], el = document.createElement('div');
    el.className = 'ach' + (on ? ' on' : '');
    el.innerHTML = `<span class="ic" aria-hidden="true">${x.icon}</span><span class="tx"><span class="nm"></span><span class="ds"></span>
      ${on ? `<span class="ct">${tr('Geschafft am {d}', { d: a.got[x.id] })}</span>` : `<span class="bar"><i style="width:${Math.min(100, c / m * 100).toFixed(1)}%"></i></span><span class="ct">${Math.min(c, m)} / ${m}</span>`}</span>`;
    el.querySelector('.nm').textContent = tr(x.n); el.querySelector('.ds').textContent = tr(x.d);
    g.append(el);
  }
  $('listBack').hidden = false;   // „← Alle Kapitel“ (ui.js)
  $('ovList').hidden = false;
}
