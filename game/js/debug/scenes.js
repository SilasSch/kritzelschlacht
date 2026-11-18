// Prüfszenen für ?debug (__kritzel.scene(name)): jede baut im Sandkasten eine kleine Lage auf, um eine Mechanik
// anzusehen. Aus main.js ausgelagert; rein bis auf die Welt, die sie bekommen.
import { spawn } from '../world.js';
import { UNITS } from '../data.js';
import { placeRect, placeCircle, tRect, tCircle } from '../sim.js';
import { FORM } from '../formation.js';

export const SCENES = {
  // Ideenrunde 18.11.: Waldbrand (Magier schießen Feuerbälle in einen Wald voller Krieger), König mit Kriegern,
  // Reiter-Keil gegen einen Ritter-Schildwall
  waldbrand(world) { world.teamMode = true; tRect(world, 'wald', .45, .2, .7, .8); placeRect(world, 'krieger', 30, .5, .3, .65, .7, 'rot'); placeRect(world, 'magier', 10, .15, .35, .2, .65, 'blau'); },
  koenig(world) { world.teamMode = true; spawn(world, 'koenig', world.W * .3, world.H * .5, 'blau'); placeRect(world, 'krieger', 24, .33, .3, .4, .7, 'blau'); placeRect(world, 'krieger', 34, .62, .3, .7, .7, 'rot'); },
  // Synergien (synergy.js): Schützen hinter Rittern, Soldaten beim MG, Krieger beim Magier, Adler und Wölfe
  synergie(world) {
    world.teamMode = true;
    placeRect(world, 'ritter', 6, .3, .2, .33, .45, 'blau'); placeRect(world, 'schuetze', 6, .24, .2, .27, .45, 'blau');
    placeRect(world, 'krieger', 8, .3, .55, .34, .8, 'blau'); spawn(world, 'magier', world.W * .26, world.H * .68, 'blau');
    placeRect(world, 'wolf', 6, .36, .45, .4, .55, 'blau'); spawn(world, 'adler', world.W * .35, world.H * .5, 'blau');
    placeRect(world, 'soldat', 8, .7, .25, .74, .75, 'rot'); spawn(world, 'mg', world.W * .77, world.H * .5, 'rot');
    placeRect(world, 'krieger', 14, .62, .25, .66, .75, 'rot'); spawn(world, 'lama', world.W * .78, world.H * .3, 'rot');
  },
  flamme(world) { world.teamMode = true; tRect(world, 'wald', .5, .15, .62, .4); placeRect(world, 'flamme', 8, .3, .35, .36, .65, 'blau'); placeRect(world, 'krieger', 30, .55, .3, .66, .7, 'rot'); },
  dornen(world) { world.teamMode = true; tRect(world, 'dornen', .45, .25, .55, .75); placeRect(world, 'krieger', 20, .3, .35, .36, .65, 'blau'); placeRect(world, 'schuetze', 10, .7, .35, .74, .65, 'rot'); },
  stinktier(world) { world.teamMode = true; placeRect(world, 'stinktier', 12, .3, .35, .36, .65, 'blau'); placeRect(world, 'krieger', 20, .62, .3, .7, .7, 'rot'); },
  trommler(world) { world.teamMode = true; placeRect(world, 'krieger', 16, .3, .35, .36, .65, 'blau'); placeRect(world, 'trommler', 2, .22, .45, .24, .55, 'blau'); placeRect(world, 'krieger', 20, .64, .35, .7, .65, 'rot'); },
  adlergriff(world) { world.teamMode = true; placeRect(world, 'adler', 3, .3, .4, .34, .6, 'blau'); placeRect(world, 'krieger', 8, .6, .35, .66, .65, 'rot'); },
  pikenier(world) { world.teamMode = true; placeRect(world, 'pikenier', 20, .3, .3, .36, .7, 'blau'); placeRect(world, 'reiter', 12, .7, .3, .78, .7, 'rot'); spawn(world, 'elefant', world.W * .8, world.H * .5, 'rot'); },
  keil(world) { world.teamMode = true; placeRect(world, 'reiter', 12, .15, .35, .25, .65, 'blau'); placeRect(world, 'ritter', 12, .66, .35, .72, .65, 'rot'); },
  grenades(world) { world.teamMode = true; placeRect(world, 'krieger', 40, .4, .3, .5, .7, 'blau'); placeRect(world, 'grenadier', 16, .72, .35, .78, .65, 'rot'); },
  tank(world) { world.teamMode = true; placeRect(world, 'soldat', 36, .42, .3, .5, .7, 'blau'); spawn(world, 'panzer', world.W * .72, world.H * .5, 'rot'); },
  heli(world) { world.teamMode = true; spawn(world, 'heli', world.W * .5, world.H * .45, 'rot'); placeRect(world, 'krieger', 12, .46, .5, .54, .6, 'blau'); placeRect(world, 'panzerfaust', 4, .2, .4, .24, .6, 'blau'); },
  walls(world) { world.teamMode = true; tRect(world, 'mauer', .5, .25, .512, .75); placeRect(world, 'grenadier', 12, .62, .38, .66, .62, 'rot'); placeRect(world, 'krieger', 24, .3, .38, .36, .62, 'blau'); },
  // Wegfindung (Spez. #24): links eine Mauer mit Lücke zwischen Blau und Rot (Krieger gehen durch die
  // Lücke, kein Einschlagen), rechts ein geschlossener Mauerring wie in M5 mit gelben Schützen innen und
  // grünen Rittern außen (kein Weg: sie schlagen die Mauer ein)
  walls2(world) {
    world.teamMode = true;
    tRect(world, 'mauer', .25, 0, .262, .55); tRect(world, 'mauer', .25, .72, .262, 1);
    placeRect(world, 'krieger', 24, .06, .12, .14, .4, 'blau'); placeRect(world, 'krieger', 24, .36, .12, .44, .4, 'rot');
    tCircle(world, 'mauer', .8, .5, .22, .18);
    placeCircle(world, 'schuetze', 10, .8, .5, .08, 'gelb');
    placeRect(world, 'ritter', 12, .95, .38, .99, .62, 'gruen');
  },
  water(world) {
    world.teamMode = true; tCircle(world, 'wasser', .5, .5, .18); tCircle(world, 'lava', .2, .5, .08);
    placeRect(world, 'krieger', 30, .44, .4, .56, .6, 'blau'); placeRect(world, 'krieger', 8, .18, .45, .22, .55, 'blau');
    placeRect(world, 'grenadier', 10, .8, .4, .84, .6, 'rot');
  },
  // Drachenfeuer (Spez. #21): ein Drache gegen einen dichten Bienenschwarm (60, Radius 40 px; fängt gut
  // Feuer) und eine verteilte Kriegerreihe (Abstand 40 px; Feuer springt nicht über)
  dragon(world) {
    world.teamMode = true;
    spawn(world, 'drache', world.W * .62, world.H * .5, 'rot');
    placeCircle(world, 'biene', 60, .4, .3, 40 / world.H, 'blau');
    for (let i = 0; i < 9; i++) spawn(world, 'krieger', world.W * .4, Math.min(world.H - 8, world.H * .72 - 160 + i * 40), 'blau');
  },
  // Liegen (Spez. #22): 4 MG-Schützen und 3 Scharfschützen gegen Schützen 260 px vor den MGs (die MGs
  // gehen etwas vor und legen sich hin, die Scharfschützen sofort). Von weit rechts stürmen 10 Krieger
  // heran (gut 10 s): wer sie näher als 140 px hat, steht erst auf (0,8 s ohne Schuss).
  prone(world) {
    world.teamMode = true;
    const x0 = world.W * .22, cy = world.H * .5;
    for (let i = 0; i < 4; i++) spawn(world, 'mg', x0, cy - 90 + i * 60, 'blau');
    for (let i = 0; i < 3; i++) spawn(world, 'sniper', x0 - 70, cy - 70 + i * 70, 'blau');
    placeRect(world, 'schuetze', 8, (x0 + 260) / world.W, .4, (x0 + 290) / world.W, .6, 'rot');
    placeRect(world, 'krieger', 10, Math.min(.95, (x0 + 700) / world.W), .35, Math.min(.98, (x0 + 740) / world.W), .65, 'rot');
  },
  // Römer (Spez. #25): 24 Römer (Blau, 6 × 4 im Platzabstand, bilden sofort einen Block) marschieren gegen
  // 20 Schützen (vorn) und 10 Krieger (dahinter, Rot): die Schilde halten die Pfeile ab (Funken), Speersalve
  // vor dem Angriff, dann charge
  roemer(world) {
    world.teamMode = true;
    for (let k = 0; k < 24; k++) spawn(world, 'roemer', world.W * .2 - (k % 4) * FORM.SPACING, world.H * .5 + (((k / 4) | 0) - 2.5) * FORM.SPACING, 'blau');
    placeRect(world, 'schuetze', 20, .62, .38, .68, .62, 'rot');
    placeRect(world, 'krieger', 10, .76, .42, .79, .58, 'rot');
  },
  // Rückzug (Spez. #27): 20 blaue Krieger mit 30 % LP gegen 20 rote mit vollen LP, je ein Sanitäter dahinter.
  // Blau bricht nach den ersten Treffern ab (Angstaugen, Schweißtropfen), läuft zum eigenen Sanitäter, erholt sich
  // abseits und kommt ab 60 % zurück; Eingeholte wehren sich.
  flucht(world) {
    world.teamMode = true;
    const k0 = world.units.length;
    placeRect(world, 'krieger', 20, .36, .36, .42, .64, 'blau');
    for (let i = k0; i < world.units.length; i++) world.units[i].hp = .3 * world.units[i].T.hp;
    placeRect(world, 'krieger', 20, .58, .36, .64, .64, 'rot');
    spawn(world, 'sani', world.W * .26, world.H * .5, 'blau');
    spawn(world, 'sani', world.W * .74, world.H * .5, 'rot');
  },
  // Fähigkeiten (Spez. #30, Task 2): neun Reihen, je eine kleine blaue Gruppe eines Typs mit Fähigkeit (Schütze,
  // Sanitäter mit verletzten Kriegern, Soldat, Mörser, Panzer, Wolfsrudel, Bär, Geist, Drache) und rechts davon eine
  // dichte gemischte rote Gruppe (Krieger, Schützen, Ritter, Römer). Die Abklingzeiten der Blauen starten bei 1–3 s:
  // jede Fähigkeit ist in den ersten Sekunden zu sehen (Mörser und Panzer, sobald ein Ziel in Reichweite ist).
  faehigkeiten(world) {
    world.teamMode = true;
    const rows = [['schuetze', 4], ['sani', 2], ['soldat', 4], ['moerser', 2], ['panzer', 1], ['wolf', 5], ['baer', 1], ['geist', 2], ['drache', 1]];
    const foes = ['krieger', 'schuetze', 'ritter', 'roemer'], W = world.W, dy = world.H / rows.length;
    rows.forEach(([type, n], i) => {
      const y = (i + .5) * dy;
      for (let k = 0; k < n; k++) {
        const u = spawn(world, type, W * .3 - (k % 3) * 22, y + ((k / 3 | 0) - .5 * (n > 3)) * 22 + ((k % 3) - 1) * 5, 'blau');
        u.abCd = 1 + world.rng() * 2;
      }
      if (type === 'sani') for (let k = 0; k < 3; k++) { const a = spawn(world, 'krieger', W * .3 + 26, y - 20 + k * 20, 'blau'); a.hp = .4 * a.T.hp; }
      for (let k = 0; k < 6; k++) spawn(world, foes[(i + (k % 2)) % 4], W * .5 + (k % 3) * 16, y + ((k / 3 | 0) - .5) * 16, 'rot');
    });
  },
  // Zauberbuch (Spez. #31, Task 3): sechs blaue Magier. Oben drei dicht beieinander gegen einen dichten Kriegerblock
  // (Feuerball, dann Meteor mit Kanalstrahlen); darunter je ein einzelner gegen einen dichten Bienenschwarm (Feuerball,
  // Blitz, Windstoß, wenn sie heran sind), gegen zwei Ritter (Blitz, dann Windstoß und Steinwand, wenn sie heran sind)
  // und gegen einen Geist (Blitz auf einen Flieger, Windstoß). Die Magier zaubern ab der ersten Sekunde.
  magier(world) {
    world.teamMode = true;
    const W = world.W, H = world.H, x = W * .26;
    for (let k = 0; k < 3; k++) spawn(world, 'magier', x - (k === 1 ? 18 : 0), H * .22 + (k - 1) * 22, 'blau');
    placeRect(world, 'krieger', 12, (x + 190) / W, .17, (x + 240) / W, .27, 'rot');
    spawn(world, 'magier', x, H * .48, 'blau');
    placeCircle(world, 'biene', 14, (x + 210) / W, .48, 22 / H, 'rot');
    spawn(world, 'magier', x, H * .68, 'blau');
    spawn(world, 'ritter', x + 200, H * .66, 'rot'); spawn(world, 'ritter', x + 215, H * .7, 'rot');
    spawn(world, 'magier', x, H * .88, 'blau');
    spawn(world, 'geist', x + 210, H * .88, 'rot');
    for (const u of world.units) if (u.type === 'magier') u.cd = .3 + world.rng() * .5;
  },
  // Vampir (Spez. #32, Task 4): drei blaue Vampire gegen sechs rote Krieger gut 320 px entfernt (sie fliegen als
  // Fledermausschwarm hin und setzen sich davor wieder zusammen, Lebensraub, die Bisskills stehen als Ghule auf) und zwei
  // rote Magier weit dahinter (680 px), die nach ein paar Sekunden heran sind: ihre Feuerbälle treffen die Vampire doppelt
  // (der Brand auch). Fällt ein Vampir, zerfallen seine Ghule.
  vampir(world) {
    world.teamMode = true;
    const W = world.W, H = world.H, x = W * .2;
    for (let k = 0; k < 3; k++) spawn(world, 'vampir', x, H * .5 + (k - 1) * 70, 'blau');
    placeRect(world, 'krieger', 6, (x + 320) / W, .38, (x + 350) / W, .62, 'rot');
    spawn(world, 'magier', x + 680, H * .44, 'rot'); spawn(world, 'magier', x + 680, H * .56, 'rot');
  },
  // --- Task 6: Kreaturen (Spez. #34) --- fünf Reihen, Blau links gegen Rot rechts:
  // 1. ein verletzter Troll gegen zwei Magier (heilt sich, die Feuerbälle stoppen die Heilung);
  // 2. ein Zyklop wirft Felsbrocken über eine Mauer auf Krieger dahinter (Staub, Trümmer bleiben liegen);
  // 3. eine Hexe gegen zwei Ritter (grüne Zauber, nach einer Sekunde wird ein Ritter für 5 s zum Frosch);
  // 4. ein angeschlagener Phönix gegen Schützen (Feuerspur auf dem Anflug, stirbt, liegt 2 s als Asche, steht wieder auf);
  // 5. ein Einhorn mit drei verletzten Kriegern gegen Krieger (Hornstoß aus vollem Lauf, Heilaura glitzert).
  kreaturen(world) {
    world.teamMode = true;
    const W = world.W, H = world.H, x = W * .2, row = i => H * (i + .5) / 5;
    const t = spawn(world, 'troll', x, row(0), 'blau'); t.hp = .55 * t.T.hp;
    spawn(world, 'magier', x + 260, row(0) - 16, 'rot'); spawn(world, 'magier', x + 260, row(0) + 16, 'rot');
    spawn(world, 'zyklop', x, row(1), 'blau').cd = .3;
    tRect(world, 'mauer', (x + 120) / W, (row(1) - 60) / H, (x + 130) / W, (row(1) + 60) / H);
    placeRect(world, 'krieger', 6, (x + 230) / W, (row(1) - 30) / H, (x + 260) / W, (row(1) + 30) / H, 'rot');
    const hx = spawn(world, 'hexe', x, row(2), 'blau'); hx.abCd = 1;
    spawn(world, 'ritter', x + 190, row(2) - 14, 'rot'); spawn(world, 'ritter', x + 205, row(2) + 14, 'rot');
    const ph = spawn(world, 'phoenix', x, row(3), 'blau'); ph.hp = 30;
    placeRect(world, 'schuetze', 6, (x + 200) / W, (row(3) - 30) / H, (x + 225) / W, (row(3) + 30) / H, 'rot');
    spawn(world, 'einhorn', x - 40, row(4), 'blau');
    for (let k = 0; k < 3; k++) { const a = spawn(world, 'krieger', x + 10, row(4) - 30 + k * 30, 'blau'); a.hp = .4 * a.T.hp; }
    placeRect(world, 'krieger', 5, (x + 300) / W, (row(4) - 30) / H, (x + 320) / W, (row(4) + 30) / H, 'rot');
  },
  // --- Task 5: Tiere (Spez. #33) --- fünf Reihen, jede zeigt eine Fähigkeit (Abklingzeiten der Blauen bei 0,5–1,5 s):
  // ein Elefant trampelt durch rote Krieger, bis rote Bienen von rechts kommen und er flieht; ein Krokodil lauert in einem
  // Teich vor Schützen (abgetaucht, unsichtbar für sie, packt zu); ein Gorilla klopft sich auf die Brust und wirft Krieger
  // in ihre Gruppe; ein Adler stößt über Krieger hinweg auf die Schützen dahinter; 4 Büffel stürmen als Herde auf Schützen.
  tiere(world) {
    world.teamMode = true;
    const W = world.W, H = world.H, row = i => (i + .5) * H / 5, cd = u => { u.abCd = .5 + world.rng(); return u; };
    let y = row(0);
    cd(spawn(world, 'elefant', W * .22, y, 'blau'));
    placeRect(world, 'krieger', 8, .36, (y - 30) / H, .4, (y + 30) / H, 'rot');
    placeCircle(world, 'biene', 6, .78, y / H, 14 / H, 'rot');
    y = row(1);
    tCircle(world, 'wasser', .34, y / H, .075);
    cd(spawn(world, 'krokodil', W * .3, y, 'blau'));
    placeRect(world, 'schuetze', 4, .44, (y - 30) / H, .46, (y + 30) / H, 'rot');
    y = row(2);
    cd(spawn(world, 'gorilla', W * .28, y, 'blau'));
    placeRect(world, 'krieger', 4, .36, (y - 20) / H, .38, (y + 20) / H, 'rot');
    placeRect(world, 'krieger', 6, .46, (y - 25) / H, .5, (y + 25) / H, 'rot');
    y = row(3);
    cd(spawn(world, 'adler', W * .26, y, 'blau'));
    placeRect(world, 'krieger', 3, .38, (y - 25) / H, .39, (y + 25) / H, 'rot');
    placeRect(world, 'schuetze', 3, .52, (y - 25) / H, .53, (y + 25) / H, 'rot');
    y = row(4);
    for (let k = 0; k < 4; k++) cd(spawn(world, 'bueffel', W * .22 - (k % 2) * 20, y - 15 + (k >> 1) * 28 + (k % 2) * 8, 'blau'));
    placeRect(world, 'schuetze', 5, .48, (y - 30) / H, .5, (y + 30) / H, 'rot');
  },
  // Boss-Sticker (Spez. #23): je Team 2 Panzer, 2 Hubschrauber und 1 Drache, dazu etwas Infanterie;
  // die Bosse fahren bzw. fliegen aufeinander zu (Turm dreht, Ketten laufen, Abgas, Rotorwind, Flügelschlag)
  bosses(world) {
    world.teamMode = true;
    for (const [team, x, s] of [['blau', .16, 1], ['rot', .84, -1]]) {
      spawn(world, 'panzer', world.W * x, world.H * .32, team); spawn(world, 'panzer', world.W * x, world.H * .68, team);
      spawn(world, 'heli', world.W * (x + s * .06), world.H * .4, team); spawn(world, 'heli', world.W * (x + s * .06), world.H * .6, team);
      spawn(world, 'drache', world.W * (x - s * .05), world.H * .5, team);
      const a = x + s * .1, b = x + s * .13, c = x + s * .02, d = x + s * .04;
      placeRect(world, 'soldat', 8, Math.min(a, b), .42, Math.max(a, b), .58, team);
      placeRect(world, 'panzerfaust', 3, Math.min(c, d), .45, Math.max(c, d), .55, team);
    }
  },
  // --- Schrottplatz und Urzeit (18.11.) --- schrott: Roboter (links) gegen Urzeit (rechts), je eine Reihe pro Einheit, dazu
  // Wasser in der Mitte (Kurzschluss); urzeit: alle Dinos erwachsen und alle Roboter nebeneinander zum Anschauen (keine Gegner
  // im Feld, damit sie stehen bleiben; unten ein junger Raptor und ein T-Rex-Ei).
  schrott(world) {
    world.teamMode = true;
    const W = world.W, H = world.H;
    tRect(world, 'wasser', .47, .3, .53, .7);
    const S = ['minibot', 'minibot', 'laserbot', 'drohne', 'kuppel', 'spinne', 'schweisser', 'magnet', 'tesla', 'mega'];
    const U = ['hoehle', 'hoehle', 'speer', 'schamane', 'raptor', 'ptera', 'anky', 'trike', 'rex'];
    S.forEach((t, i) => spawn(world, t, W * (.12 + (i % 2) * .05), H * (.08 + i * .088), 'blau'));
    U.forEach((t, i) => spawn(world, t, W * (.88 - (i % 2) * .05), H * (.08 + i * .1), 'rot'));
  },
  urzeit(world) {
    world.teamMode = true;
    const W = world.W, H = world.H;
    const S = ['minibot', 'laserbot', 'drohne', 'kuppel', 'spinne', 'schweisser', 'magnet', 'tesla', 'mega'];
    const U = ['hoehle', 'speer', 'schamane', 'raptor', 'ptera', 'anky', 'trike', 'rex'];
    S.forEach((t, i) => { const u = spawn(world, t, W * (.32 + i * .045), H * .4, 'blau'); u.cd = 1e9; u.abCd = 1e9; });
    U.forEach((t, i) => { const u = spawn(world, t, W * (.33 + i * .048), H * .52, 'rot'); u.cd = 1e9; u.abCd = 1e9; if (u.growT > 0) { u.growT = 0; u.T = UNITS[t]; u.hp = u.T.hp; } });
    const y = spawn(world, 'raptor', W * .45, H * .62, 'rot'), e = spawn(world, 'rex', W * .55, H * .62, 'rot');
    y.cd = e.cd = 1e9;
  },
  // Schüsse (Overhaul 18.11.): alle Fernkampfwaffen der Moderne/Armee gegen einen Haufen Krieger, Luftkampf darüber
  schuesse(world) {
    world.teamMode = true;
    placeRect(world, 'soldat', 6, .3, .3, .33, .5, 'blau'); placeRect(world, 'mg', 2, .27, .35, .28, .45, 'blau');
    placeRect(world, 'sniper', 2, .2, .3, .22, .4, 'blau'); placeRect(world, 'panzerfaust', 2, .3, .55, .32, .62, 'blau');
    placeRect(world, 'schuetze', 4, .27, .55, .29, .7, 'blau'); placeRect(world, 'grenadier', 3, .33, .6, .35, .7, 'blau');
    spawn(world, 'moerser', world.W * .2, world.H * .6, 'blau'); spawn(world, 'panzer', world.W * .23, world.H * .5, 'blau');
    placeRect(world, 'krieger', 40, .44, .3, .52, .7, 'rot'); spawn(world, 'heli', world.W * .47, world.H * .45, 'rot');
    spawn(world, 'jet', world.W * .4, world.H * .3, 'blau'); spawn(world, 'jet', world.W * .6, world.H * .25, 'rot');
  },
  // dasselbe für Fantasy, Tiere und Urzeit: Pfeile, Brandpfeile, Speere, Feuerbälle, Hexenzauber, Spucke, Felsen, Steine
  schuesse2(world) {
    world.teamMode = true;
    placeRect(world, 'schuetze', 5, .3, .3, .32, .5, 'blau'); placeRect(world, 'magier', 2, .27, .35, .28, .45, 'blau');
    placeRect(world, 'hexe', 2, .3, .55, .32, .62, 'blau'); placeRect(world, 'lama', 2, .27, .6, .29, .7, 'blau');
    spawn(world, 'zyklop', world.W * .22, world.H * .5, 'blau'); placeRect(world, 'speer', 3, .33, .6, .35, .7, 'blau');
    placeRect(world, 'ptera', 2, .4, .4, .42, .5, 'blau');
    placeRect(world, 'krieger', 40, .44, .3, .52, .7, 'rot');
  },
};
