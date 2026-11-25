// Dazu (25.11., UX-Review): das ganze HUD verschwindet beim Malen (body.hud-paint) und schrumpft im Kampf aufs Nötigste
// (body.hud-fight): Tempo, Zeitlupe, Pause, Ton, Name der Partie mit Uhr, Abbrechen bzw. Aufgeben und die Armeestärke.
// Malleiste wegklappen (Silas 25.11.): In Missionen und in der Schlacht rutscht die Einheitenauswahl nach unten aus dem
// Bild, solange gekämpft wird (dort wird ohnehin nicht gemalt) und solange gerade ein Pinselstrich läuft. Beim Loslassen
// kommt sie zurück, damit man die Einheit wechseln kann. Der Sandkasten bleibt wie gehabt. Nur Darstellung: kein Einfluss
// auf Simulation, Tageschallenge oder Codes. Die Klassen am <body> steuern das CSS in index.html (body.pal-fold).

// Rein (für Tests): Grund zum Wegklappen oder null. phase 'plan' = Aufstellung, alles andere = Kampf bzw. Ergebnis.
export function foldReason(game, painting) {
  const m = game.mission, b = game.battle;
  if (!m && !b) return null;
  if ((m && m.phase !== 'plan') || (b && b.phase !== 'plan')) return 'fight';
  return painting ? 'paint' : null;
}

// Ganzes HUD (Silas 25.11.: „während dem Zeichnen sollte das komplette UI verschwinden und während dem Battle eine sehr
// reduzierte Version“). Rein (für Tests): 'paint' solange ein Pinselstrich läuft (in jedem Modus, auch im Sandkasten),
// 'fight' solange in Mission oder Schlacht gekämpft wird (nicht in der Auswertung: dort braucht man die volle Leiste), sonst null.
export function hudMode(game, painting) {
  if (painting) return 'paint';
  const m = game.mission, b = game.battle;
  if ((m && m.phase === 'battle') || (b && b.phase === 'fight' && !b.batch)) return 'fight';
  return null;
}
// Online-Partien (Online 1v1, Code-Duell, 2v2, Hügel): ihre Knöpfe zum Verlassen bleiben auch im reduzierten Kampf-HUD
export const isNet = game => !!(game.battle && game.battle.hot && game.battle.hot.online);

// el: die Malleiste, host: Bezugsrahmen (#app). sync(game) jedes Bild, paint(on) bei Strichbeginn/-ende.
export function makePaletteFold({ el, host, body = document.body }) {
  let painting = false, last = null, lastHud = null, lastNet = null;
  // Wie weit nach unten: bis knapp unter den Rand des Spielfelds, auch wenn die Leiste frei verschoben liegt.
  // CSS-zoom des HUD: Bildschirm-px = CSS-px · z, translate wirkt in CSS-px der Leiste.
  function drop() {
    const r = el.getBoundingClientRect(), h = host.getBoundingClientRect();
    const z = el.offsetHeight ? r.height / el.offsetHeight : 1;
    let ty = 0;   // Lage ohne eine noch laufende Rückfahrt
    try { const t = getComputedStyle(el).transform; if (t && t !== 'none') ty = new DOMMatrix(t).m42; } catch (e) { /* alt */ }
    const base = r.top - ty * z;
    return Math.max(0, (h.bottom - base) / z) + 16;
  }
  function sync(game) {
    const hm = hudMode(game, painting), net = isNet(game);
    if (hm !== lastHud) { lastHud = hm; body.classList.toggle('hud-paint', hm === 'paint'); body.classList.toggle('hud-fight', hm === 'fight'); }
    if (net !== lastNet) { lastNet = net; body.classList.toggle('hud-net', net); }
    const why = foldReason(game, painting);
    if (why === last) return;
    if (why && !last) el.style.setProperty('--pal-drop', drop() + 'px');
    last = why;
    body.classList.toggle('pal-fold', !!why);
    body.classList.toggle('pal-fold-paint', why === 'paint');
    el.setAttribute('aria-hidden', why === 'fight' ? 'true' : 'false');
    if (why === 'fight') el.setAttribute('inert', ''); else el.removeAttribute('inert');
  }
  return { sync, paint(on) { painting = !!on; } };
}
