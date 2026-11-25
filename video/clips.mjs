// Spielszenen für die Videos. setup läuft im Browser (?debug, window.__kritzel): army() malt Einheiten wie placeRect
// (type, Anzahl, x0, y0, x1, y1 als Anteile des Felds, Team). warmup: Sekunden Spielzeit vor der Aufnahme,
// seconds: Länge der Aufnahme, camAt(t): [Zoom, Mitte x, Mitte y] je Bild (Zoom 1 = ganzes Feld).
// Neue Szene: hier eintragen, `node capture.mjs <name>` aufnehmen, in src/Trailer.jsx als Shot verwenden.
const battle = (name, armies, o = {}) => ({
  name, seconds: o.seconds || 5, warmup: o.warmup ?? 1.5,
  camAt: o.camAt || (t => [1.55 + .04 * t, .5, .5]),
  setup: new Function(`
    const k = window.__kritzel;
    k.scene('keil'); k.game.clear(); k.world.teamMode = true;
    k.game.weather = ${JSON.stringify(o.weather || null)};
    for (const a of ${JSON.stringify(armies)}) k.place(...a);
    window.__clean();`),
});

export const CLIPS = [
  battle('romans', [['roemer', 60, .33, .28, .4, .72, 'blau'], ['krieger', 80, .6, .22, .68, .78, 'rot']]),
  battle('dragons', [['drache', 3, .28, .35, .32, .65, 'blau'], ['magier', 8, .3, .3, .34, .7, 'blau'], ['ritter', 40, .58, .25, .64, .75, 'rot'], ['schuetze', 24, .66, .3, .7, .7, 'rot']], { warmup: 2 }),
  battle('modern', [['soldat', 40, .3, .25, .36, .75, 'blau'], ['mg', 3, .27, .35, .28, .65, 'blau'], ['panzer', 2, .24, .4, .25, .6, 'blau'],
    ['heli', 2, .7, .4, .72, .6, 'rot'], ['panzer', 2, .74, .4, .75, .6, 'rot'], ['soldat', 40, .62, .25, .68, .75, 'rot']], { warmup: 2.5, weather: 'regen' }),
  battle('stoneage', [['rex', 2, .3, .4, .32, .6, 'blau'], ['trike', 3, .33, .3, .35, .7, 'blau'], ['raptor', 14, .36, .3, .4, .7, 'blau'], ['hoehle', 30, .34, .25, .4, .75, 'blau'],
    ['minibot', 30, .6, .25, .66, .75, 'rot'], ['laserbot', 10, .67, .3, .7, .7, 'rot'], ['spinne', 4, .66, .4, .68, .6, 'rot'], ['mega', 1, .74, .5, .74, .5, 'rot']], { warmup: 2 }),
  battle('animals', [['elefant', 4, .3, .3, .33, .7, 'blau'], ['wolf', 20, .34, .3, .4, .7, 'blau'], ['baer', 6, .33, .35, .36, .65, 'blau'],
    ['gorilla', 8, .62, .3, .66, .7, 'rot'], ['krokodil', 10, .6, .3, .64, .7, 'rot'], ['bueffel', 8, .66, .3, .7, .7, 'rot']], { warmup: 1.5 }),
  battle('epic', [['krieger', 120, .1, .1, .25, .9, 'blau'], ['ritter', 40, .26, .15, .3, .85, 'blau'], ['schuetze', 40, .04, .15, .09, .85, 'blau'], ['drache', 2, .2, .45, .22, .55, 'blau'],
    ['krieger', 120, .75, .1, .9, .9, 'rot'], ['reiter', 30, .7, .15, .74, .85, 'rot'], ['schuetze', 40, .91, .15, .96, .85, 'rot'], ['troll', 4, .78, .4, .8, .6, 'rot']],
    { warmup: 1, seconds: 7, camAt: t => [1.05 + .05 * t, .5, .5] }),
];

// Malen: Pinselstriche mit der Maus (Bildschirm-Koordinaten aus Weltanteilen), danach Pause aus = Kampf
// Striche: [Startzeit s, Dauer s, Team, Slot, Punkte als [x, y] in Weltanteilen]
const STROKES = [
  [0.3, 1.5, 'blau', 1, [[.40, .22], [.43, .38], [.39, .52], [.43, .66], [.40, .80]]],
  [2.0, 1.1, 'blau', 2, [[.32, .30], [.34, .50], [.32, .70]]],
  [3.3, 1.5, 'rot', 3, [[.60, .25], [.57, .40], [.61, .55], [.57, .72]]],
  [5.0, 0.9, 'rot', 4, [[.68, .35], [.70, .50], [.68, .65]]],
];
const lerpPath = (pts, f) => {
  const s = f * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(s)), u = s - i;
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u];
};
let down = null;
CLIPS.unshift({
  name: 'paint', seconds: 12, hud: true, warmup: 0.3, css: '.hud .top { visibility: hidden !important; }',
  setup: () => {
    const a = window.__kritzel.game;
    a.clear(); a.setTeamMode(true); a.setBrush(34); if (!a.paused) a.togglePause();
    window.__w2s = (fx, fy) => { const c = window.__kritzel.cam, r = document.getElementById('cv').getBoundingClientRect();
      return [r.left + (fx * c.worldW - c.x) * c.zoom, r.top + (fy * c.worldH - c.y) * c.zoom]; };
  },
  async each(page, t) {
    const st = STROKES.find(([t0, d]) => t >= t0 && t <= t0 + d);
    if (st) {
      const [t0, d, team, slot, pts] = st;
      const [x, y] = await page.evaluate(([fx, fy]) => window.__w2s(fx, fy), lerpPath(pts, (t - t0) / d));
      if (down !== st) {
        if (down) await page.mouse.up();
        await page.evaluate(([tm, sl]) => { const a = window.__kritzel.game; a.setTeam(tm); window.__kritzel.actions.pickSlot(sl); }, [team, slot]);
        await page.mouse.move(x, y); await page.mouse.down(); down = st;
      } else await page.mouse.move(x, y, { steps: 2 });
    } else if (down) { await page.mouse.up(); down = null; }
    if (Math.abs(t - 6.2) < 1 / 60) await page.evaluate(() => window.__kritzel.game.togglePause());
  },
});
