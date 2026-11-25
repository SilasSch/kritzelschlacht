// Feldzug (25.11.): Auswahl der Belohnung nach einem Sieg (drei Karten in der Übersicht ovList).
import { UNITS } from '../data.js';
import { iconURL } from '../render/rig.js';
import { fmtPts } from '../cards.js';
import { tr, unitName } from '../i18n.js';

const $ = id => document.getElementById(id);
const CSS = `
.rewgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.rew{border:2px solid var(--ink);background:#fff;border-radius:16px;padding:14px;display:flex;flex-direction:column;align-items:center;gap:6px;font:inherit;color:inherit;box-shadow:2px 3px 0 var(--ink);cursor:pointer}
.rew:hover{transform:translateY(-2px);background:linear-gradient(135deg,#fff4d6,#fff 70%)}
.rew img{width:72px;height:72px}
.rew .big{font-family:var(--f-logo);font-size:40px;line-height:72px}
.rew .nm{font-family:var(--f-logo);font-weight:400;font-size:21px;letter-spacing:.5px}
.rew .ds{font-size:12.5px;color:var(--muted);text-align:center;line-height:1.35}
`;
let styled = false;

export function openReward(game, list, onPick) {
  if (!styled) { styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.append(s); }
  const run = game.save.run;
  $('listTitle').textContent = tr('Belohnung wählen');
  $('listText').textContent = tr('Schlacht {k} von {n} wartet. Dein Heer: {u}. Budget {b} Punkte.', {
    k: run.stage, n: game.runStages, u: run.units.map(t => unitName(t)).join(', '), b: run.budget });
  const g = $('lvGrid'); g.innerHTML = ''; g.className = 'rewgrid';
  list.forEach(r => {
    const b = document.createElement('button'); b.className = 'rew';
    if (r.kind === 'unit') {
      b.innerHTML = `<img src="${iconURL(r.type, 144)}" alt=""><span class="nm"></span><span class="ds"></span>`;
      b.querySelector('.nm').textContent = unitName(r.type);
      b.querySelector('.ds').textContent = tr('Neue Einheit fürs Heer · {p} Pkt', { p: fmtPts(UNITS[r.type].cost) });
    } else {
      b.innerHTML = `<span class="big">+${r.n}</span><span class="nm">${tr('Kriegskasse')}</span><span class="ds">${tr('{n} Punkte mehr Budget für alle weiteren Schlachten', { n: r.n })}</span>`;
    }
    b.onclick = () => { $('ovList').hidden = true; onPick(r); };
    g.append(b);
  });
  $('listBack').hidden = true;
  $('ovList').hidden = false;
}
