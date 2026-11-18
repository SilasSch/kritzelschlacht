// Kapitel „Magierakademie“ (Spez. #52): Zauber, Flüche und Fabelwesen. Nur mythische Einheiten, je Level wenige.
// Felder eines Levels und Regeln: docs/kampagne.md. Prüfen: node tools/balance.mjs missions 8 1400x875 --chapter=akademie
// Gelände malen ist hier aus (cats nur 'mythisch'): die Lösungen kommen aus den Fähigkeiten, nicht aus gemalten Mauern.
//
// Aufbau: aka-1 Feuer gegen Trollheilung (Magier, Feuerball, ein paar Trolle als Wall), aka-2 Froschfluch der Hexen
// gegen Bären (Geister halten sie fest), aka-3 Felsbrocken über Mauern (Zyklopen; Einhörner fangen die Reiter ab),
// aka-4 Flieger über Lava (Phönixe in den Krater; Einhörner gegen die Schützen davor), aka-5 alles zusammen: Meteor
// gegen den Kriegerhaufen, Trolle als Wall, Phönixe in den großen Krater.
//
// Magier in der Masse sind sehr stark (30 Magier schlagen 120 Punkte fast jeder Armee in unter 15 s, auch drei Drachen).
// Darum: aka-1 lehrt Feuer und lässt die Masse als Lösung zu (answer), aka-5 stellt die Zyklopen außer Reichweite
// (Lavaring 0,08–0,44 H, breiter als ihre Reichweite, auch wenn das Gedränge sie ein Stück in die Lava schiebt):
// Magier allein erreichen sie nicht und verlieren nach 180 s.
// aka-2: Hexen in der Masse (18) gewinnen gegen die Bären, das ist der Froschfluch selbst (answer); 16 verlieren.
import { F, B, Md, Deep } from './areas.js';

const CATS = ['mythisch'];

export default {
  id: 'akademie',
  n: 'Magierakademie',
  d: 'Zauber, Flüche und Fabelwesen: Magier, Hexen, Zyklopen und Phönixe.',
  levels: [
    {
      // Trolle heilen 3 % je s, Feuer stoppt das 4 s lang. 12 Magier allein verlieren (0/4), mit 2 Trollen davor
      // gewinnen sie sicher: die Trolle halten, die Feuerbälle stoppen die Heilung. Trolle und Einhörner allein heilen
      // die Gegner nie herunter.
      id: 'aka-1', n: 'Die Trollbrücke', budget: 128, par: 127,   // Magier langsamer (18.11.): 14 statt 12
      units: ['magier', 'troll', 'einhorn'], cats: CATS, answer: ['magier'],
      hint: 'Magier, Trolle und Einhörner. Trolle heilen sich ständig, nur Feuer stoppt das. Ein paar eigene Trolle halten die Brücke, dahinter brennt es.',
      place: [
        ['tRect', 'wasser', .5, 0, .58, .42], ['tRect', 'wasser', .5, .58, .58, 1],
        ['rect', 'troll', 9, .66, .32, .72, .68], ['rect', 'krieger', 16, .74, .25, .8, .75],
      ],
      plan: { smart: [['magier', 14, ...B], ['troll', 2, ...F]], spam: [['einhorn', 19, ...F]] },
    },
    {
      // Froschfluch: alle 14 s wird das Ziel einer Hexe 5 s lang ein harmloser Frosch. Geister vorn (halber Schaden,
      // Lebensraub) halten die Bären, die Hexen dahinter verwandeln sie. Einhörner und Geister allein verlieren (Budget 86:
      // mit 90 gewannen 30 Geister an zwei Formen 2/8, 28 Geister höchstens 1/8).
      id: 'aka-2', n: 'Der Hexenwald', budget: 86, par: 85,   // 11 Hexen (18.11.)
      units: ['hexe', 'geist', 'einhorn'], cats: CATS, answer: ['hexe'],
      hint: 'Hexen, Geister und Einhörner. Ein Bär als Frosch beißt nicht. Wer hält die Bären fest, solange die Hexen fluchen?',
      place: [['tRect', 'wald', .58, 0, 1, 1], ['rect', 'baer', 10, .68, .3, .76, .7]],
      plan: { smart: [['geist', 10, ...F], ['hexe', 11, ...B]], spam: [['geist', 28, ...F]] },
    },
    {
      // Schützen in einem Mauerring: Pfeile fliegen im Bogen hinaus, Bodentruppen kommen nicht hinein. Felsbrocken
      // fliegen hinüber. Draußen reiten Reiter auf die Zyklopen los (reiter > zyklop), Einhörner fangen sie ab. Mit 8
      // statt 10 Einhörnern rutschte an 1726×820 zu oft ein Reiter durch (6/8). Schon 4 statt 5 Reiter ließen 9 Zyklopen
      // allein gewinnen (8/8), darum genau 5. Der Ring ist klein (0,25 H): in einem größeren flohen Schützen an die
      // Rückseite, außer Reichweite der Zyklopen (280 px), und die Schlacht lief in die 180 s.
      id: 'aka-3', n: 'Die Zyklopenschlucht', budget: 115, par: 95,
      units: ['zyklop', 'troll', 'einhorn'], cats: CATS,
      hint: 'Zyklopen, Trolle und Einhörner. Felsbrocken fliegen über Mauern, aber Zyklopen sind im Nahkampf unbeholfen. Wer schützt sie vor den Reitern?',
      place: [
        ['tRect', 'mauer', .45, 0, .72, .05], ['tRect', 'mauer', .45, .95, .72, 1],
        ['tCircle', 'mauer', .84, .5, .25, .16], ['circle', 'schuetze', 14, .84, .5, .12],
        ['rect', 'reiter', 5, .62, .3, .66, .7],
      ],
      plan: { smart: [['zyklop', 4, ...B], ['einhorn', 10, ...F]], spam: [['einhorn', 25, ...F]] },
    },
    {
      // Zyklopen in einem Lavakrater: Bodentruppen kommen nicht hinein (nach 180 s verloren). Phönixe fliegen hinüber,
      // Felsbrocken treffen keine Flieger. Vor dem Vulkan stehen Schützen (Pfeile holen Phönixe herunter), die
      // Einhörner überrennen (einhorn > schuetze). Budget 110: 12 Phönixe (Budget 120) gewannen an den breiten Formen
      // 3–4/8, 11 verlieren 8/8.
      id: 'aka-4', n: 'Der Phönixvulkan', budget: 110, par: 97,
      units: ['phoenix', 'einhorn', 'troll'], cats: CATS,
      hint: 'Phönixe, Einhörner und Trolle. Über die Lava kommt nur, wer fliegt, und Pfeile holen Phönixe vom Himmel. Wer räumt vorher die Schützen ab?',
      place: [
        ['tCircle', 'lava', .84, .5, .3, .22], ['circle', 'zyklop', 5, .84, .5, .1],
        ['rect', 'schuetze', 28, .6, .25, .66, .75],
      ],
      plan: { smart: [['phoenix', 6, ...Md], ['einhorn', 9, ...F]], spam: [['einhorn', 24, ...F]] },
    },
    {
      // Finale: Drache und ein dichter Kriegerhaufen vor dem Vulkan (Meteor: ab 3 Magiern, mindestens 6 Feinde bis 60 px
      // ums Ziel), Zyklopen tief im großen Krater, außer Reichweite der Magier. Magier allein verlieren nach 180 s,
      // Phönixe allein am Drachen und den Kriegern, Trolle und Einhörner kommen nicht in den Krater. Budget 145: mit 160
      // gewannen 35 Einhörner an 1400×1050 3/8 (der Sturzflug des Drachen schleudert einzelne in den Krater).
      id: 'aka-5', n: 'Drachenhort II', budget: 178, par: 177,   // Magier langsamer (18.11.): 14 statt 12
      units: ['magier', 'troll', 'phoenix', 'einhorn'], cats: CATS,
      hint: 'Magier, Trolle, Phönixe und Einhörner. Drei Magier nah beieinander rufen einen Meteor in den dichtesten Haufen. Der Hort liegt tief im Krater, weit über jede Zauberreichweite.',
      place: [
        ['tCircle', 'lava', .9, .5, .44, .08], ['circle', 'zyklop', 3, .9, .5, .04],
        ['unit', 'drache', .56, .5], ['rect', 'krieger', 36, .52, .4, .56, .6],
      ],
      plan: { smart: [['magier', 14, ...B], ['troll', 3, ...F], ['phoenix', 5, ...Deep]], spam: [['magier', 29, ...F]] },
    },
  ],
};
