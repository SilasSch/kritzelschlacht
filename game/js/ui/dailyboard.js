// Bestenliste der Tageschallenge (18.11.): Karte mit Rangliste je Tag. Daten und Nachrechnen: dailyboard.js.
// Zwei Quellen, zusammen in einer Liste:
//   - Live (nur im Artefakt „Kritzelschlacht Live“ mit capabilities db + user): scores/<id> in der Datenbank des
//     Artefakts. Siege trägt das Spiel selbst ein (nur, wenn besser als der eigene Eintrag des Tages).
//   - Auf diesem Gerät (überall, auch über den öffentlichen Link): eigene Siege und eingefügte Ergebnis-Codes von Freunden.
// Jeder Eintrag wird hier nachgerechnet (createCheck in Häppchen); gezählt wird nur das nachgerechnete Ergebnis.
import { getStore } from '../net.js';
import { getName, setName, onName, needsName, askName } from './playername.js';
import { dateKey, shortDate } from '../daily.js';
import { tr } from '../i18n.js';
import { createCheck, stampOf, SIM_VERSION, rankEntries, resultCode, addLocal, cleanBoard, cleanName, mergeOwn, dayEntries, BOARD_KEEP, NAME_MAX, validDate, maxBoardDate } from '../dailyboard.js';
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
  store.name = getName();   // ein Name für alles (playername.js)
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignore */ } };

  /* ---------- Nachrechnen ---------- */
  const results = new Map();   // date|ver|stamp|army → { res } | { error } | null (läuft)
  const waiters = new Map();   // key → [resolve, ...]
  const queue = [];
  let pumping = false;
  // Schlüssel mit Spielversion (und Stempel bei Alt-Versionen, damit verschiedene Behauptungen nicht kollidieren)
  const verOf = st => (st && st.v) || SIM_VERSION;
  const stampKey = st => (st && st.v && st.v !== SIM_VERSION && st.r ? JSON.stringify(st.r) : '');
  const keyOf = (date, a, st) => date + '|' + verOf(st) + '|' + stampKey(st) + '|' + a;
  function want(date, a, st) {
    const k = keyOf(date, a, st);
    if (results.has(k)) return results.get(k);
    results.set(k, null); queue.push({ k, c: createCheck(date, a, undefined, st) });
    if (!pumping) { pumping = true; setTimeout(pump, 0); }
    return null;
  }
  // Asynchron über die Häppchen-Warteschlange (blockiert den Main-Thread nicht)
  function checkAsync(date, a, st) {
    const k = keyOf(date, a, st);
    const cur = want(date, a, st);
    if (cur) return Promise.resolve(cur.res || null);
    return new Promise(resolve => {
      const arr = waiters.get(k);
      if (arr) arr.push(resolve); else waiters.set(k, [resolve]);
    });
  }
  const better = (res, old) => !old || !old.win || rankEntries([{ res, at: 1 }, { res: old, at: 0 }])[0].res === res;
  function pump() {
    const end = performance.now() + 12;
    while (queue.length && performance.now() < end) {
      const job = queue[0];
      if (job.c.pump(Math.max(1, end - performance.now()))) {
        queue.shift();
        const out = job.c.error ? { error: job.c.error } : { res: job.c.result };
        results.set(job.k, out);
        const ws = waiters.get(job.k);
        if (ws) { waiters.delete(job.k); for (const fn of ws) fn(out.res || null); }
        render();
      }
    }
    if (queue.length) setTimeout(pump, 16); else pumping = false;
  }

  /* ---------- Live (Datenbank) ---------- */
  const live = { db: null, user: null, me: null, docs: [], names: {}, state: 'off', note: '', ready: false };
  const profAsked = new Set();
  const pendingLive = new Map();   // date → { date, army, res }, wartet bis zum ersten onSnapshot
  function flushPending() {
    if (live.state !== 'on' || writing || !pendingLive.size) return;
    const [date, item] = pendingLive.entries().next().value;
    pendingLive.delete(date);
    submitLive(item.date, item.army, item.res);
  }
  (async () => {
    try {
      const S = await getStore();
      if (!S) { live.ready = true; pendingLive.clear(); return; }
      const { db, user } = S;
      live.db = db; live.user = user; live.state = 'load';
      live.me = user ? await user.id() : null;
      const timer = setTimeout(() => { if (live.state === 'load') { live.note = tr('Die Bestenliste ist gerade nicht erreichbar.'); render(); } }, 10000);
      db.collection('scores').onSnapshot(snap => {
        if (!snap.metadata.fromCache) { clearTimeout(timer); live.note = ''; }
        live.state = 'on'; live.ready = true;
        live.docs = snap.docs.filter(d => d.exists).map(d => ({ id: d.id, data: d.data() }));
        render();
        flushPending();
      }, () => { clearTimeout(timer); live.state = 'off'; live.ready = true; pendingLive.clear(); live.note = tr('Die Bestenliste ist gerade nicht erreichbar.'); render(); });
    } catch (e) { live.state = 'off'; live.ready = true; pendingLive.clear(); }
  })();
  const myDoc = () => (live.docs.find(d => d.id === live.me) || {}).data || null;
  let writing = false;
  async function submitLive(date, army, res) {
    if (live.state !== 'on' || !live.db || !live.me || writing) {
      if (!live.ready || live.state === 'load' || (live.state === 'on' && writing)) {
        const prev = pendingLive.get(date);
        if (!prev || better(res, prev.res)) pendingLive.set(date, { date, army, res });
      }
      return;
    }
    const own = myDoc(), old = own && own.days && own.days[date];
    if (old && old.a === army && verOf(old) === SIM_VERSION) return;
    writing = true;
    try {
      const oldRes = old ? await checkAsync(date, old.a, old) : null;
      if (old && !better(res, oldRes)) return;   // der alte Eintrag ist besser
      const curOwn = myDoc();
      const doc = mergeOwn(curOwn, date, army, Date.now(), undefined, res);
      if (store.name) doc.n = store.name;
      await live.db.collection('scores').doc(live.me).set(doc);
      toast(tr('In die Live-Bestenliste eingetragen.'));
    } catch (e) {
      live.note = tr('Eintragen geht nur mit dem Recht „Mitwirkende“ für dieses Artefakt.');
      render();
    } finally { writing = false; flushPending(); }
  }

  /* ---------- Einträge eines Tages ---------- */
  function entries(date) {
    const out = [];
    let myLiveArmy = null;
    for (const e of dayEntries(live.docs, date)) {
      const me = e.uid === live.me;
      if (me) myLiveArmy = e.a;
      const doc = live.docs.find(d => d.id === e.uid);
      out.push({ ...e, me, live: true, nick: cleanName(doc && doc.data && doc.data.n) });
    }
    for (const e of store.days[date] || []) {
      if (e.me && myLiveArmy !== null && e.a === myLiveArmy) continue;
      out.push({ ...e, me: !!e.me, code: !e.me });
    }
    for (const e of out) { const r = want(date, e.a, e); e.res = r && r.res; e.error = r && r.error; e.pending = !r; }
    return out;
  }

  /* ---------- Karte (festes Gerüst, damit Eingabefelder beim Nachrechnen den Cursor behalten) ---------- */
  const ov = document.createElement('div');
  ov.className = 'ov'; ov.id = 'ovBoard'; ov.hidden = true;
  ov.innerHTML = `<div class="card board shadow" role="dialog" aria-modal="true" aria-labelledby="boardTitle">
    <h2 id="boardTitle">${tr('Bestenliste')}</h2>
    <div class="bnav"><button class="btn" id="boardPrev">◀</button><b id="boardDay"></b><button class="btn" id="boardNext">▶</button></div>
    <p class="src" id="boardSrc"></p>
    <table><thead><tr><th></th><th>${tr('Name')}</th><th>${tr('Punkte')}</th><th>${tr('Sterne')}</th><th>${tr('Zeit')}</th><th></th></tr></thead><tbody id="boardRows"></tbody></table>
    <p class="src">${tr('Platz nach: Sieg, dann weniger Punkte, dann schnellerer Sieg.')}</p>
    <div class="addrow"><input id="boardName" maxlength="${NAME_MAX}" placeholder="${tr('Dein Name')}">
      <button class="btn" id="boardMine">${tr('Mein Ergebnis als Code')}</button></div>
    <textarea id="boardCode" rows="2" placeholder="${tr('Ergebnis-Code eines Freundes (KS1.…) hier einfügen')}"></textarea>
    <div class="btnrow"><button class="btn" id="boardAdd">${tr('Code hinzufügen')}</button><button class="btn" id="boardClose">${tr('Schließen')}</button></div>
  </div>`;
  $('app').append(ov);
  let day = dateKey(), curMine = null;
  const days = () => {
    const today = dateKey(), out = [];
    for (let i = BOARD_KEEP - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); out.push(dateKey(d)); }
    return out.filter(d => d <= today);
  };
  $('boardName').value = store.name;
  $('boardPrev').onclick = () => { const ds = days(), i = ds.indexOf(day); day = ds[Math.max(0, (i < 0 ? ds.length - 1 : i) - 1)]; render(); };
  $('boardNext').onclick = () => { const ds = days(), i = ds.indexOf(day); day = ds[Math.min(ds.length - 1, (i < 0 ? ds.length - 1 : i) + 1)]; render(); };
  $('boardClose').onclick = () => { ov.hidden = true; };
  $('boardName').oninput = e => { setName(e.target.value); };
  $('boardName').onkeydown = e => e.stopPropagation();
  // Name geändert: auch den eigenen Live-Eintrag umbenennen (sonst steht dort weiter der alte Name oder „Spieler“)
  let renameT = 0;
  onName(n => {
    store.name = n; persist();
    if ($('boardName') && $('boardName') !== document.activeElement) $('boardName').value = n;
    clearTimeout(renameT); renameT = setTimeout(renameLive, 1200);
  });
  $('boardMine').onclick = () => {
    const m = curMine, d = day;
    if (!m) return;
    shareDlg.showCode(encode(resultCode(d, m.a, store.name, m.res, verOf(m))), tr('Ergebnis teilen'), tr('Tageschallenge {d}: {p} Punkte. Wer den Code mit „Code laden“ oder in der Bestenliste einfügt, sieht dich dort. Der Kampf wird nachgerechnet.', { d: shortDate(d), p: fmtPts(m.res.spent) }));
  };
  $('boardAdd').onclick = async () => {
    try { addCode(await decode($('boardCode').value)); $('boardCode').value = ''; render(); } catch (e) { toast(tr(e.message || 'Der Code passt nicht.')); }
  };

  function rows(list) {
    if (!list.length) return `<tr><td colspan="6" class="empty">${tr('Noch niemand. Gewinne die Tageschallenge oder füge den Code eines Freundes ein.')}</td></tr>`;
    const ranked = rankEntries(list.filter(e => e.res)), bad = list.filter(e => !e.res);
    const ids = [...new Set(ranked.concat(bad).filter(e => e.live).map(e => e.uid))].filter(id => !(id in live.names) && !profAsked.has(id));
    if (live.user && ids.length) {
      for (const id of ids) profAsked.add(id);
      live.user.profiles(ids).then(ps => {
        let ch = false;
        for (const id of ids) { const n = ps[id] && ps[id].name; if (n && live.names[id] !== n) { live.names[id] = n; ch = true; } }
        if (ch) render();
      }, () => { for (const id of ids) profAsked.delete(id); });
    }
    const nameOf = e => (e.live ? live.names[e.uid] || e.nick || tr('Spieler') : e.me ? (store.name || tr('Du')) : e.n === 'Unbekannt' || !e.n ? tr('Unbekannt') : e.n);
    let place = 0;
    return ranked.concat(bad).map(e => {
      const win = e.res && e.res.win, rk = win ? ++place : '';
      const ck = e.pending ? tr('prüft …') : e.error ? `✗ ${esc(tr(e.error))}` : e.res.old ? '≈ ' + tr('alte Spielversion') : win ? '✓ ' + tr('nachgerechnet') : '✗ ' + tr('verloren');
      const tag = e.me ? `<span class="tag">${tr('du')}</span>` : e.code ? `<span class="tag">${tr('Code')}</span>` : '';
      return `<tr class="${rk === 1 ? 'r1 ' : ''}${e.me ? 'me ' : ''}${e.error || (e.res && !win) ? 'bad' : ''}">
        <td class="rk">${rk}</td><td>${esc(nameOf(e))}${tag}</td>
        <td>${e.res ? tr('{n} P.', { n: fmtPts(e.res.spent) }) : ''}</td><td class="st">${win ? '★'.repeat(e.res.stars) : ''}</td>
        <td>${win ? fmtT(e.res.time) : ''}</td><td class="ck">${ck}</td></tr>`;
    }).join('');
  }

  function render() {
    if (ov.hidden) return;
    const ds = days();
    if (!ds.includes(day) && day > maxBoardDate()) day = dateKey();
    const i = ds.indexOf(day), list = entries(day);
    curMine = list.find(e => e.me && e.res && e.res.win) || null;
    const src = live.state === 'on' ? tr('Live: alle Eingeladenen dieses Artefakts, dazu eingefügte Codes. Jeder Eintrag wird nachgerechnet.')
      : tr('Auf diesem Gerät: deine Siege und Ergebnis-Codes deiner Freunde. Jeder Code wird nachgerechnet, Schummeln geht nicht.');
    $('boardPrev').disabled = i <= 0;
    $('boardNext').disabled = i < 0 || i >= ds.length - 1;
    $('boardDay').textContent = `${tr('Tageschallenge {d}', { d: shortDate(day) })}${day === dateKey() ? ' ' + tr('(heute)') : ''}`;
    $('boardSrc').innerHTML = `${esc(src)}${live.note ? `<br><b>${esc(live.note)}</b>` : ''}`;
    $('boardRows').innerHTML = rows(list);
    $('boardMine').disabled = !curMine;
    $('boardMine').title = curMine ? '' : tr('Erst die Tageschallenge gewinnen');
  }

  async function renameLive() {
    const own = myDoc();
    if (live.state !== 'on' || !live.db || !live.me || !own || !store.name || own.n === store.name || writing) return;
    try { await live.db.collection('scores').doc(live.me).set({ ...own, n: store.name }); } catch (e) { /* nächstes Mal */ }
  }
  function open(date = dateKey()) {
    day = date; ov.hidden = false; render();
    if (needsName()) askName().then(() => { if ($('boardName')) $('boardName').value = store.name; render(); });
    else renameLive();
  }

  // Ergebnis-Code { k: 'dailyres', d, a, n } (aus „Code laden“ oder der Karte)
  function addCode(d) {
    if (!d || d.k !== 'dailyres') throw new Error(tr('Das ist kein Ergebnis der Tageschallenge.'));
    if (!validDate(d.d) || d.d > maxBoardDate()) throw new Error(tr('Dieses Ergebnis liegt in der Zukunft.'));
    if (d.d < days()[0]) throw new Error(tr('Dieses Ergebnis ist älter als eine Woche.'));
    addLocal(store.days, d.d, { n: d.n || 'Unbekannt', a: d.a, ...(d.sv ? { v: d.sv, r: d.r } : {}) });
    store.days = cleanBoard(store.days); persist();
    toast(tr('{n} eingetragen, wird nachgerechnet.', { n: d.n || tr('Ergebnis') }));
    open(d.d);
  }

  // Sieg im Spiel (main.js finishMission): das Ergebnis ist schon das nachgerechnete (gleicher Schnappschuss, gleiche Saat)
  function onWin(date, army, res) {
    results.set(keyOf(date, army, null), { res });
    const old = (store.days[date] || []).find(e => e.me);
    const saveLocal = () => {
      addLocal(store.days, date, { n: store.name, a: army, me: true, ...stampOf(res) });
      store.days = cleanBoard(store.days); persist(); render();
    };
    if (!old) saveLocal();
    else checkAsync(date, old.a, old).then(oldRes => {
      if ((store.days[date] || []).find(e => e.me) === old && better(res, oldRes)) saveLocal();
    });
    submitLive(date, army, res);
  }

  return { open, addCode, onWin, covered: () => !ov.hidden, live: () => live.state === 'on' };
}
