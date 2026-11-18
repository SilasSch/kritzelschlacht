// Bestenliste der Tageschallenge (18.11.): Karte mit Rangliste je Tag. Daten und Nachrechnen: dailyboard.js.
// Zwei Quellen, zusammen in einer Liste:
//   - Live (nur im Artefakt „Kritzelschlacht Live“ mit capabilities db + user): scores/<id> in der Datenbank des
//     Artefakts. Siege trägt das Spiel selbst ein (nur, wenn besser als der eigene Eintrag des Tages).
//   - Auf diesem Gerät (überall, auch über den öffentlichen Link): eigene Siege und eingefügte Ergebnis-Codes von Freunden.
// Jeder Eintrag wird hier nachgerechnet (createCheck in Häppchen); gezählt wird nur das nachgerechnete Ergebnis.
import { dateKey, shortDate } from '../daily.js';
import { createCheck, checkNow, rankEntries, resultCode, addLocal, cleanBoard, cleanName, mergeOwn, dayEntries, BOARD_KEEP, NAME_MAX } from '../dailyboard.js';
import { fmtPts } from '../cards.js';

const KEY = 'kritzel-dailyboard';
const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtT = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const CSS = `
.card.board{max-width:640px}
.board .bnav{display:flex;align-items:center;gap:8px;justify-content:space-between}
.board .bnav b{font-size:16px}
.board .src{font-size:12.5px;color:var(--muted)}
.board table{width:100%;border-collapse:collapse;font-size:14px}
.board th{font-size:11.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);text-align:left;padding:4px 6px;border-bottom:1.5px solid var(--line)}
.board td{padding:6px;border-bottom:1px dashed var(--line);font-variant-numeric:tabular-nums}
.board td.rk{font-family:var(--f-logo);font-size:20px;width:34px;text-align:center}
.board tr.r1 td.rk{color:var(--gold);-webkit-text-stroke:.6px var(--ink)}
.board tr.me td{background:#fff4d6}
.board tr.bad td{color:var(--muted);text-decoration:line-through}
.board tr.bad td.ck{text-decoration:none}
.board .st{color:var(--gold);letter-spacing:1px;-webkit-text-stroke:.5px var(--ink)}
.board .ck{font-size:12px;color:var(--muted);white-space:nowrap}
.board .tag{font-size:10.5px;font-weight:800;padding:0 6px;border-radius:99px;border:1px solid var(--line);color:var(--muted);margin-left:6px}
.board .empty{color:var(--muted);text-align:center;padding:14px}
.board .addrow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.board .addrow input{flex:1 1 160px;font:700 14px var(--f-ui);border:1.5px solid var(--line);border-radius:10px;padding:6px 8px;min-width:0}
.board textarea{width:100%;box-sizing:border-box;font:700 12px var(--f-ui);border:1.5px solid var(--line);border-radius:10px;padding:6px 8px;resize:vertical}
`;

export function createBoardUI({ toast, decode, encode, shareDlg }) {
  { const s = document.createElement('style'); s.textContent = CSS; document.head.append(s); }
  const $ = id => document.getElementById(id);

  /* ---------- Gerät ---------- */
  let store = { name: '', days: {} };
  try { const raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw) store = { name: cleanName(raw.name), days: cleanBoard(raw.days) }; } catch (e) { /* kein Speicher */ }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignore */ } };

  /* ---------- Nachrechnen ---------- */
  const results = new Map();   // date|army → { res } | { error } | null (läuft)
  const queue = [];
  let pumping = false;
  const keyOf = (date, a) => date + '|' + a;
  function want(date, a) {
    const k = keyOf(date, a);
    if (results.has(k)) return results.get(k);
    results.set(k, null); queue.push({ k, c: createCheck(date, a) });
    if (!pumping) { pumping = true; setTimeout(pump, 0); }
    return null;
  }
  // Sofort (für den Vergleich mit dem eigenen alten Eintrag): Ergebnis oder null bei ungültigem Eintrag
  function resultNow(date, a) {
    const k = keyOf(date, a);
    let r = results.get(k);
    if (!r) { const c = checkNow(date, a); r = c.error ? { error: c.error } : { res: c.result }; results.set(k, r); }
    return r.res || null;
  }
  const better = (res, old) => !old || !old.win || rankEntries([{ res, at: 1 }, { res: old, at: 0 }])[0].res === res;
  function pump() {
    const end = performance.now() + 12;
    while (queue.length && performance.now() < end) {
      const job = queue[0];
      if (job.c.pump(Math.max(1, end - performance.now()))) {
        queue.shift();
        results.set(job.k, job.c.error ? { error: job.c.error } : { res: job.c.result });
        render();
      }
    }
    if (queue.length) setTimeout(pump, 16); else pumping = false;
  }

  /* ---------- Live (Datenbank) ---------- */
  const live = { db: null, user: null, me: null, docs: [], names: {}, state: 'off', note: '' };
  (async () => {
    const C = typeof window !== 'undefined' && window.claude;
    if (!C || typeof C.use !== 'function') return;
    try {
      const [db, user] = await Promise.all([C.use('db').catch(() => null), C.use('user').catch(() => null)]);
      if (!db) return;
      live.db = db; live.user = user; live.state = 'load';
      live.me = user ? await user.id() : null;
      const timer = setTimeout(() => { if (live.state === 'load') { live.note = 'Die Bestenliste ist gerade nicht erreichbar.'; render(); } }, 10000);
      db.collection('scores').onSnapshot(snap => {
        if (!snap.metadata.fromCache) { clearTimeout(timer); live.note = ''; }
        live.state = 'on';
        live.docs = snap.docs.filter(d => d.exists).map(d => ({ id: d.id, data: d.data() }));
        render();
      }, () => { clearTimeout(timer); live.state = 'off'; live.note = 'Die Bestenliste ist gerade nicht erreichbar.'; render(); });
    } catch (e) { live.state = 'off'; }
  })();
  const myDoc = () => (live.docs.find(d => d.id === live.me) || {}).data || null;
  let writing = false;
  async function submitLive(date, army, res) {
    if (!live.db || !live.me || writing) return;
    const own = myDoc(), old = own && own.days && own.days[date];
    if (old && old.a === army) return;
    if (old && !better(res, resultNow(date, old.a))) return;   // der alte Eintrag ist besser
    writing = true;
    try {
      const doc = mergeOwn(own, date, army);
      if (store.name) doc.n = store.name;
      await live.db.collection('scores').doc(live.me).set(doc);
      toast('In die Live-Bestenliste eingetragen.');
    } catch (e) {
      live.note = 'Eintragen geht nur mit dem Recht „Mitwirkende“ für dieses Artefakt.';
      render();
    } finally { writing = false; }
  }

  /* ---------- Einträge eines Tages ---------- */
  function entries(date) {
    const out = [], seen = new Set();
    for (const e of dayEntries(live.docs, date)) {
      if (seen.has(e.a)) continue; seen.add(e.a);
      const doc = live.docs.find(d => d.id === e.uid);
      out.push({ ...e, me: e.uid === live.me, live: true, nick: cleanName(doc && doc.data && doc.data.n) });
    }
    for (const e of store.days[date] || []) {
      if (seen.has(e.a)) continue; seen.add(e.a);
      out.push({ ...e, me: !!e.me, code: !e.me });
    }
    for (const e of out) { const r = want(date, e.a); e.res = r && r.res; e.error = r && r.error; e.pending = !r; }
    return out;
  }

  /* ---------- Karte ---------- */
  const ov = document.createElement('div');
  ov.className = 'ov'; ov.id = 'ovBoard'; ov.hidden = true; ov.style.zIndex = 8;
  ov.innerHTML = '<div class="card board shadow" role="dialog" aria-modal="true" aria-labelledby="boardTitle"></div>';
  $('app').append(ov);
  const card = ov.firstChild;
  let day = dateKey();
  const days = () => {
    const today = dateKey(), out = [];
    for (let i = BOARD_KEEP - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); out.push(dateKey(d)); }
    return out.filter(d => d <= today);
  };

  function rows(list) {
    if (!list.length) return `<tr><td colspan="6" class="empty">Noch niemand. Gewinne die Tageschallenge oder füge den Code eines Freundes ein.</td></tr>`;
    const ranked = rankEntries(list.filter(e => e.res)), bad = list.filter(e => !e.res);
    const ids = ranked.concat(bad).filter(e => e.live).map(e => e.uid);
    if (live.user && ids.length) live.user.profiles(ids).then(ps => { let ch = false; for (const id of ids) { const n = ps[id] && ps[id].name; if (n && live.names[id] !== n) { live.names[id] = n; ch = true; } } if (ch) render(); }, () => {});
    const nameOf = e => (e.live ? live.names[e.uid] || e.nick || 'Spieler' : e.me ? (store.name || 'Du') : e.n || 'Unbekannt');
    let place = 0;
    return ranked.concat(bad).map(e => {
      const win = e.res && e.res.win, rk = win ? ++place : '';
      const ck = e.pending ? 'prüft …' : e.error ? `✗ ${esc(e.error)}` : win ? '✓ nachgerechnet' : '✗ verloren';
      const tag = e.me ? '<span class="tag">du</span>' : e.code ? '<span class="tag">Code</span>' : '';
      return `<tr class="${rk === 1 ? 'r1 ' : ''}${e.me ? 'me ' : ''}${e.error || (e.res && !win) ? 'bad' : ''}">
        <td class="rk">${rk}</td><td>${esc(nameOf(e))}${tag}</td>
        <td>${e.res ? `${fmtPts(e.res.spent)} P.` : ''}</td><td class="st">${win ? '★'.repeat(e.res.stars) : ''}</td>
        <td>${win ? fmtT(e.res.time) : ''}</td><td class="ck">${ck}</td></tr>`;
    }).join('');
  }

  function render() {
    if (ov.hidden) return;
    const ds = days(), i = ds.indexOf(day), list = entries(day);
    const mine = list.find(e => e.me && e.res && e.res.win);
    const src = live.state === 'on' ? 'Live: alle Eingeladenen dieses Artefakts, dazu eingefügte Codes. Jeder Eintrag wird nachgerechnet.'
      : 'Auf diesem Gerät: deine Siege und Ergebnis-Codes deiner Freunde. Jeder Code wird nachgerechnet, Schummeln geht nicht.';
    const focus = document.activeElement && document.activeElement.id;
    const keep = { name: $('boardName') ? $('boardName').value : store.name, code: $('boardCode') ? $('boardCode').value : '' };
    card.innerHTML = `<h2 id="boardTitle">Bestenliste</h2>
      <div class="bnav"><button class="btn" id="boardPrev" ${i <= 0 ? 'disabled' : ''}>◀</button>
        <b>Tageschallenge ${shortDate(day)}${day === dateKey() ? ' (heute)' : ''}</b>
        <button class="btn" id="boardNext" ${i >= ds.length - 1 ? 'disabled' : ''}>▶</button></div>
      <p class="src">${esc(src)}${live.note ? `<br><b>${esc(live.note)}</b>` : ''}</p>
      <table><thead><tr><th></th><th>Name</th><th>Punkte</th><th>Sterne</th><th>Zeit</th><th></th></tr></thead><tbody>${rows(list)}</tbody></table>
      <p class="src">Platz nach: Sieg, dann weniger Punkte, dann schnellerer Sieg.</p>
      <div class="addrow"><input id="boardName" maxlength="${NAME_MAX}" placeholder="Dein Name im Code" value="${esc(keep.name)}">
        <button class="btn" id="boardMine" ${mine ? '' : 'disabled title="Erst die Tageschallenge gewinnen"'}>Mein Ergebnis als Code</button></div>
      <textarea id="boardCode" rows="2" placeholder="Ergebnis-Code eines Freundes (KS1.…) hier einfügen">${esc(keep.code)}</textarea>
      <div class="btnrow"><button class="btn" id="boardAdd">Code hinzufügen</button><button class="go" id="boardClose">Schließen</button></div>`;
    $('boardPrev').onclick = () => { day = ds[Math.max(0, i - 1)]; render(); };
    $('boardNext').onclick = () => { day = ds[Math.min(ds.length - 1, i + 1)]; render(); };
    $('boardClose').onclick = () => { ov.hidden = true; };
    $('boardName').oninput = e => { store.name = cleanName(e.target.value); persist(); };
    $('boardMine').onclick = async () => {
      if (!mine) return;
      const code = await encode(resultCode(day, mine.a, store.name));
      shareDlg.showCode(code, 'Ergebnis teilen', `Tageschallenge ${shortDate(day)}: ${fmtPts(mine.res.spent)} Punkte. Wer den Code mit „Code laden“ oder in der Bestenliste einfügt, sieht dich dort. Der Kampf wird nachgerechnet.`);
    };
    $('boardAdd').onclick = async () => {
      try { addCode(await decode($('boardCode').value)); $('boardCode').value = ''; render(); } catch (e) { toast(e.message || 'Der Code passt nicht.'); }
    };
    if (focus && $(focus)) $(focus).focus();
  }

  function open(date = dateKey()) { day = date; ov.hidden = false; render(); }

  // Ergebnis-Code { k: 'dailyres', d, a, n } (aus „Code laden“ oder der Karte)
  function addCode(d) {
    if (!d || d.k !== 'dailyres') throw new Error('Das ist kein Ergebnis der Tageschallenge.');
    if (d.d < days()[0]) throw new Error('Dieses Ergebnis ist älter als eine Woche.');
    addLocal(store.days, d.d, { n: d.n || 'Unbekannt', a: d.a });
    store.days = cleanBoard(store.days); persist();
    toast(`${d.n || 'Ergebnis'} eingetragen, wird nachgerechnet.`);
    open(d.d);
  }

  // Sieg im Spiel (main.js finishMission): das Ergebnis ist schon das nachgerechnete (gleicher Schnappschuss, gleiche Saat)
  function onWin(date, army, res) {
    results.set(keyOf(date, army), { res });
    const old = (store.days[date] || []).find(e => e.me);
    if (!old || better(res, resultNow(date, old.a))) {
      addLocal(store.days, date, { n: store.name, a: army, me: true });
      store.days = cleanBoard(store.days); persist();
    }
    submitLive(date, army, res);
  }

  return { open, addCode, onWin, covered: () => !ov.hidden, live: () => live.state === 'on' };
}
