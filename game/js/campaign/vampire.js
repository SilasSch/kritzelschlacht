// Kapitel „Nacht der Vampire“ (Spez. #52): Vampire, Ghule, Geister, Trolle und Hexen. Felder eines Levels und Regeln:
// docs/kampagne.md. Prüfen: node tools/balance.mjs missions 8 --chapter=vampire und newspam 8 --chapter=vampire.
// Gelehrt wird: Feuer trifft Vampire doppelt (Magier, Brandpfeile), Sanitäter heilen die eigenen Leute (Ghule nie),
// stirbt ein Vampir, zerfallen seine Ghule, Nahkämpfer erreichen keine Fledermäuse, Mauern und Lava halten nur
// Bodentruppen auf. Gelände malen ist überall gesperrt (cats ohne 'gelaende'): sonst überbrückt Wasser die Lava.
import { F, B, Md, Deep } from './areas.js';

export default {
  id: 'vampire',
  n: 'Nacht der Vampire',
  d: 'Vampire, Ghule und Geister: wer fällt, steht wieder auf.',
  levels: [
    // 1: Feuer gegen Vampire und Geister. Der Magier ist der Konter (COUNTERS magier > vampir, magier > geist), aber
    // allein vorn beißen ihn die Vampire; ein paar Krieger davor fangen die Bisse ab. Die Magier ganz hinten (Deep),
    // die Krieger in der Mitte: Die Feuerbälle fallen dann noch in die Gegner und nicht in die eigenen Krieger.
    // answer: Feuer ist die Lehre des Einstiegs, darum darf auch eine Magiermasse gewinnen (12 Magier vorn gewannen
    // 0–5/8 je Form, zu unstet für die Spam-Regel). Mit 10 Vampiren gewannen 30–31 Krieger an
    // einzelnen Formen 2–3/8; mit 11 verlieren 31 Krieger (Budget 63) überall, 33 gewannen bis 2/8. Der Krieger-Spam verliert.
    {
      id: 'vamp-1', n: 'Der Friedhof', budget: 116, par: 114,   // 13 Magier (18.11.)
      units: ['krieger', 'magier'], cats: ['armee', 'mythisch'], answer: ['magier'],
      hint: 'Krieger und Magier. Zwischen den Gräbern warten Vampire und Geister. Feuer trifft Vampire doppelt: Magier ganz hinten, ein paar Krieger davor. Stirbt ein Vampir, zerfallen seine Ghule.',
      place: [
        ['tCircle', 'wald', .6, .25, .05], ['tCircle', 'wald', .6, .75, .05],
        ['rect', 'vampir', 11, .7, .3, .76, .7], ['rect', 'geist', 6, .8, .35, .83, .65],
      ],
      plan: { smart: [['krieger', 5, ...Md], ['magier', 13, ...Deep]], spam: [['krieger', 31, ...F]] },
    },
    // 2: Hexen schießen über den Fluss, Vampire fliegen als Fledermäuse herüber. Schützen gewinnen das lange Duell mit den
    // Hexen nur, wenn Sanitäter sie heilen (ohne Sanitäter 18/24 statt 24/24 in der Erprobung, mit 2 statt 3 an 1400×1050 nur 6/8); ein paar Krieger vorn
    // halten die Vampire von ihnen fern. Krieger allein waten langsam durchs Wasser und werden zu Ghulen.
    {
      id: 'vamp-2', n: 'Das Dorf am Fluss', budget: 81, par: 78,
      units: ['krieger', 'schuetze', 'sani'], cats: ['armee'],
      hint: 'Krieger, Schützen und Sanitäter. Hexen schießen über den Fluss, Vampire fliegen herüber. Schützen gewinnen das Duell, wenn Sanitäter sie heilen, und ein paar Krieger halten ihnen die Vampire vom Hals. Ghule heilt kein Sanitäter.',
      place: [
        ['tRect', 'wasser', .5, 0, .62, 1],
        ['rect', 'vampir', 8, .7, .3, .74, .7], ['rect', 'troll', 3, .66, .4, .68, .6],
        ['rect', 'hexe', 12, .8, .25, .84, .75],
      ],
      plan: { smart: [['krieger', 6, ...F], ['schuetze', 22, ...B], ['sani', 3, ...Md]], spam: [['krieger', 40, ...F]] },
    },
    // 3: Hinter dem Lavagraben. Kein Bodentruppler kommt hinüber; die Vampire fliegen als Fledermausschwarm her, die
    // Hexen schweben über der Lava. Krieger und Ritter allein verlieren (die Hexen bleiben unerreichbar, Zeit läuft ab),
    // Schützen allein werden zerbissen. Ritter vorn fangen die Bisse ab (Rüstung), Schützen dahinter holen alles herunter.
    {
      id: 'vamp-3', n: 'Der Fledermausschwarm', budget: 100, par: 88,
      units: ['krieger', 'ritter', 'schuetze'], cats: ['armee'],
      hint: 'Krieger, Ritter und Schützen. Hinter dem Lavagraben schwärmen Vampire als Fledermäuse aus. Über die Lava kommt kein Nahkämpfer, und Fledermäuse erreicht er auch nicht: Fernkampf holt den Schwarm herunter, eine zähe Front fängt die Bisse ab.',
      place: [
        ['tRect', 'lava', .52, 0, .58, 1],
        ['rect', 'vampir', 16, .8, .2, .9, .8], ['rect', 'hexe', 4, .72, .35, .74, .65],
      ],
      plan: { smart: [['ritter', 9, ...F], ['schuetze', 18, ...B]], spam: [['krieger', 50, ...F]] },
    },
    // 4: Das Schloss: Trolle und Hexen hinter der Ringmauer, die Vampire fliegen heraus. Ritter allein schlagen sich lange
    // an der Mauer fest, während die Hexen sie verzaubern (Zauber ×1,5 auf Ritter); Bomben sprengen zwar die Mauer, aber
    // die Grenadiere werden zerbissen. Schützen schießen über die Mauer, Ritter davor fangen die Vampire ab. Budget 84:
    // Mit 6 Trollen gewannen 18–19 Ritter an 1670×939 nach langem Kampf 3/8; 8 Trolle halten sie auf
    // (0/8), mehr Hexen hätten dagegen auch den Plan geschwächt.
    {
      id: 'vamp-4', n: 'Das Vampirschloss', budget: 84, par: 81,
      units: ['ritter', 'schuetze', 'grenadier', 'sani'], cats: ['armee'],
      hint: 'Ritter, Schützen, Grenadiere und Sanitäter. Hinter der Schlossmauer warten Trolle und Hexen, die Vampire fliegen einfach heraus. Pfeile fliegen über die Mauer. Wer sich an ihr festschlägt, steht im Hexenfeuer.',
      place: [
        ['tCircle', 'mauer', .78, .5, .3, .26],
        ['circle', 'vampir', 14, .78, .5, .12], ['circle', 'hexe', 8, .78, .5, .2], ['circle', 'troll', 8, .78, .5, .06],
      ],
      plan: { smart: [['ritter', 7, ...F], ['schuetze', 19, ...B]], spam: [['schuetze', 33, ...F]] },
    },
    // 5: Die Armee des Grafen hinter dem Lavagraben: Trolle (gestrandet, heilen sich), weit verteilt Vampire, Geister und
    // Hexen. Kein Nahkämpfer kommt hinüber (Krieger-, Ritter- und Einhornmassen verlieren auf Zeit), Schützen allein werden
    // zerbissen, Phönixe allein verlieren gegen Trolle und Geister. Ohne Magier: Feuer kommt von Brandpfeilen und Phönixen.
    // Ritter vorn, Schützen dahinter, zwei Phönixe und zwei Sanitäter: alles, was das Kapitel gelehrt hat.
    {
      id: 'vamp-5', n: 'Die Nacht des Grafen', budget: 135, par: 127,   // 10 Ritter (18.11.)
      units: ['krieger', 'ritter', 'schuetze', 'sani', 'einhorn', 'phoenix'], cats: ['armee', 'mythisch'],
      hint: 'Krieger, Ritter, Schützen, Sanitäter, Einhörner und Phönixe. Hinter dem Lavagraben wartet die Armee des Grafen. Was hast du in dieser Nacht gelernt? Eine zähe Front, Fernkampf über die Lava, Feuer und Heiler.',
      place: [
        ['tRect', 'lava', .5, 0, .55, 1],
        ['rect', 'troll', 8, .6, .3, .66, .7], ['rect', 'vampir', 18, .68, .08, .82, .92],
        ['rect', 'geist', 10, .84, .1, .9, .9], ['rect', 'hexe', 6, .9, .2, .95, .8],
      ],
      plan: {
        smart: [['ritter', 10, ...F], ['schuetze', 22, ...B], ['phoenix', 2, ...B], ['sani', 2, ...Md]],
        spam: [['krieger', 67, ...F]],
      },
    },
  ],
};
