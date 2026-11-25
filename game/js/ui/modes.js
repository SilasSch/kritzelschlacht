// Spielmodi (25.11.): Karten unter den Kapiteln in der Kampagnenübersicht. Jeder Modus meldet sich mit
// { id, tag, n, d, foot(game), open(game) } an (registerMode); ui.js hängt die Karten mit modeCards an.
import { tr } from '../i18n.js';

const MODES = [];
export function registerMode(m) { if (!MODES.some(x => x.id === m.id)) MODES.push(m); }

const CSS = `
.ch.mode{background:linear-gradient(135deg,#eef4ff,#fff 70%)}
.ch.mode .tag.best{background:var(--gold);color:var(--ink)}
`;
let styled = false;

export function modeCards(grid, game, keep = () => true) {
  if (!styled) { styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.append(s); }
  for (const m of MODES) {
    if (!keep(m)) continue;
    const b = document.createElement('button'); b.className = 'ch mode'; b.dataset.ch = 'mode-' + m.id;
    b.innerHTML = `<span class="no">${tr(m.tag)}</span><span class="nm">${tr(m.n)}</span><span class="ds">${tr(m.d)}</span><span class="foot">${m.foot(game)}</span>`;
    b.onclick = () => m.open(game);
    grid.append(b);
  }
}
