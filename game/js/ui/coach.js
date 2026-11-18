// Sprechblasen fürs Tutorial (Audit 18.11.): eine Blase mit Pfeil zeigt auf ein Element (oder einen Punkt auf dem Feld)
// und erklärt einen Schritt. Ein Schritt endet, wenn done() wahr wird (main.js fragt alle 0,25 s) oder über "Weiter".
// steps: [{ text, at: () => Element | { x, y } (Bildschirm) | null, done?: () => bool, next?: 'Weiter' }]
// onStep(i): nach jedem Schritt ab dem zweiten (z. B. für einen Ton)
export function createCoach(host, onStep = null) {
  const el = document.createElement('div');
  el.className = 'coach'; el.hidden = true;
  el.innerHTML = '<div class="coach-b"><p></p><div class="coach-row"><span class="coach-n"></span><button class="mini coach-next"></button><button class="mini coach-skip">Tutorial beenden</button></div></div>';
  host.append(el);
  const p = el.querySelector('p'), nBox = el.querySelector('.coach-n'), next = el.querySelector('.coach-next'), skip = el.querySelector('.coach-skip');
  let steps = [], i = -1, onEnd = null;

  function place() {
    const s = steps[i]; if (!s) return;
    const a = s.at ? s.at() : null, hr = host.getBoundingClientRect();
    let x = hr.width / 2, y = hr.height * .3, below = true;
    if (a && a.getBoundingClientRect) {
      const r = a.getBoundingClientRect();
      x = r.left - hr.left + r.width / 2;
      // über dem Ziel, wenn unten genug Platz fehlt
      below = r.bottom - hr.top + 150 < hr.height;
      y = below ? r.bottom - hr.top + 14 : r.top - hr.top - 14;
    } else if (a) { x = a.x; y = a.y; }
    el.classList.toggle('up', !below);
    const w = el.offsetWidth || 300;
    el.style.left = Math.max(12, Math.min(hr.width - w - 12, x - w / 2)) + 'px';
    el.style.top = y + 'px';
    el.style.setProperty('--ax', Math.max(18, Math.min(w - 18, x - Math.max(12, Math.min(hr.width - w - 12, x - w / 2)))) + 'px');
  }
  function show(k) {
    i = k;
    const s = steps[i];
    if (!s) { stop(true); return; }
    if (i > 0 && onStep) onStep(i);
    p.textContent = s.text;
    nBox.textContent = `${i + 1}/${steps.length}`;
    next.hidden = !s.next; next.textContent = s.next || '';
    el.hidden = false;
    place();
  }
  function stop(finished) {
    el.hidden = true; const cb = onEnd; steps = []; i = -1; onEnd = null;
    if (cb) cb(!!finished);
  }
  next.onclick = () => show(i + 1);
  skip.onclick = () => stop(false);
  window.addEventListener('resize', () => { if (i >= 0) place(); });

  return {
    start(list, end) { steps = list; onEnd = end || null; show(0); },
    // regelmäßig aufrufen: nächster Schritt, wenn der aktuelle erledigt ist; Lage nachführen
    tick() { if (i < 0) return; const s = steps[i]; if (s.done && s.done()) show(i + 1); else place(); },
    stop: () => stop(false),
    get active() { return i >= 0; },
  };
}
