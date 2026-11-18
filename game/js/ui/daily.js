// Tageschallenge (Audit 18.11.): Karte oben in der Kapitelübersicht und Zusatz im Ergebnis (Bestwert, Ergebnis kopieren).
// Das Level kommt aus daily.js (rein); main.js lädt es mit game.playDaily() und speichert den Bestwert in save.daily.
import { dailyLevel, dateKey, shortDate, shareText } from '../daily.js';
import { fmtPts } from '../cards.js';

const CSS = `
.daily{grid-column:1/-1;display:flex;align-items:center;gap:14px 18px;flex-wrap:wrap;border:2px solid var(--ink);border-radius:18px;padding:14px 16px;
  background:linear-gradient(135deg,#fff4d6,#fff 70%);box-shadow:2px 3px 0 var(--ink)}
.daily .dt{flex:1 1 280px;min-width:0;display:flex;flex-direction:column;gap:3px}
.daily .no{font-size:12px;color:var(--muted);display:flex;gap:8px;align-items:center}
.daily .no .new{font-size:11px;font-weight:800;padding:1px 8px;border-radius:99px;background:var(--go);color:#fff}
.daily .nm{font-family:var(--f-logo);font-weight:400;font-size:26px;letter-spacing:.5px;line-height:1.05;color:var(--ink)}
.daily .ds{font-size:12.5px;color:var(--muted);line-height:1.35}
.daily .best{display:flex;flex-direction:column;align-items:flex-end;gap:2px;font-size:12.5px;color:var(--muted);white-space:nowrap}
.daily .best b{font-size:15px;color:var(--ink);font-variant-numeric:tabular-nums}
.daily .best .st{color:var(--gold);font-size:17px;letter-spacing:2px;-webkit-text-stroke:.6px var(--ink)}
.daily .best .st em{color:var(--line);font-style:normal}
.resdaily{display:flex;flex-direction:column;gap:8px;border:1.5px dashed var(--line);border-radius:14px;padding:10px 12px}
.resdaily .row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:14.5px}
.resdaily .row span{color:var(--muted)}
.resdaily .share{margin:0;white-space:pre-wrap;word-break:break-word;font:700 13.5px/1.5 var(--f-ui);color:var(--ink);background:var(--soft);
  border:1.5px solid var(--line);border-radius:12px;padding:10px 12px;user-select:all}
.resdaily .copyrow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.resdaily .copyrow small{color:var(--muted);font-size:12px}
.resdaily .btn.ok{background:#2a9d5c;border-color:#2a9d5c;color:#fff}
.resdaily textarea{width:100%;box-sizing:border-box;font:700 13px var(--f-ui);border:1.5px solid var(--line);border-radius:10px;padding:6px 8px;resize:none}
`;
let styled = false;
function addStyle() {
  if (styled) return; styled = true;
  const s = document.createElement('style'); s.textContent = CSS; document.head.append(s);
}
const MSG_COPIED = 'Ergebnis kopiert.';
const DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const stars = s => `${'★'.repeat(s)}<em>${'★'.repeat(3 - s)}</em>`;
const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Karte „Tageschallenge“ als erstes Element des Rasters (ganze Breite)
export function dailyCard(grid, game) {
  addStyle();
  const now = new Date(), day = dateKey(now), L = dailyLevel(day), best = (game.save.daily || {})[day];
  const el = document.createElement('div');
  el.className = 'daily'; el.id = 'dailyCard';
  el.innerHTML = `<div class="dt"><span class="no">${DAYS[now.getDay()]}, ${shortDate(day)}<span class="new">Täglich neu</span></span>
      <span class="nm">Tageschallenge</span>
      <span class="ds">${esc(L.hint)} Budget ${L.budget}, drei Sterne bis ${L.par} Punkte.</span></div>
    <div class="best">${best ? `Bestwert heute<b>${fmtPts(best.spent)} Punkte</b><span class="st">${stars(best.stars)}</span>` : 'Heute noch nicht geschafft'}</div>
    <button class="go" id="dailyPlay">${best ? 'Nochmal' : 'Spielen'}</button>`;
  el.querySelector('#dailyPlay').onclick = () => { document.getElementById('ovList').hidden = true; game.playDaily(); };
  grid.prepend(el);
}

// Ergebnis: r.daily = { date, best } in der Tageschallenge, sonst nichts (dann wird der Zusatz entfernt)
export function dailyResult(r, toast) {
  addStyle();
  const old = document.getElementById('resDaily'); if (old) old.remove();
  if (!r.daily) return;
  document.getElementById('resNext').hidden = true;
  const { date, best } = r.daily, text = shareText(date, r);
  const box = document.createElement('div');
  box.className = 'resdaily'; box.id = 'resDaily';
  box.innerHTML = `<div class="row"><span>Bestwert heute</span><b>${best ? `${fmtPts(best.spent)} Punkte ${'★'.repeat(best.stars)}` : '–'}</b></div>
    <pre class="share" id="resShareTxt">${esc(text)}</pre>
    <div class="copyrow"><button class="btn" id="resCopy">📋 Ergebnis kopieren</button><small>Fertig zum Posten, ohne deine Lösung zu verraten.</small></div>
    <textarea id="resShare" rows="5" readonly hidden></textarea>`;
  document.getElementById('resStats').after(box);
  // Rückmeldung auch am Knopf: der Toast liegt unter der Ergebniskarte
  const btn = box.querySelector('#resCopy');
  let t = 0;
  btn.onclick = () => copyText(text, box.querySelector('#resShare'), msg => {
    const ok = msg === MSG_COPIED;
    btn.textContent = ok ? '✓ Kopiert' : 'Text markiert: Strg+C'; btn.classList.toggle('ok', ok); toast(msg);
    clearTimeout(t); t = setTimeout(() => { btn.textContent = '📋 Ergebnis kopieren'; btn.classList.remove('ok'); }, 2500);
  });
}

// In die Zwischenablage; im abgeschotteten iframe (Artefakt) gibt es sie oft nicht: dann den Text markiert zeigen
export function copyText(text, ta, toast) {
  const fallback = () => {
    ta.value = text; ta.hidden = false; ta.focus(); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    toast(ok ? MSG_COPIED : 'Text ist markiert: mit Strg+C kopieren.');
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast(MSG_COPIED), fallback);
      return;
    }
  } catch (e) { /* kein Zugriff */ }
  fallback();
}
