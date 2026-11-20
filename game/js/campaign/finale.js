// Kapitel „Finale“ (Spez. #52): alles gemischt, in den schwersten Schlachten. Jedes Level erlaubt eine feste Auswahl
// aus mehreren Kategorien; jede Einheit allein verliert, erst die richtige Mischung gewinnt.
// Felder eines Levels und Regeln: docs/kampagne.md. Prüfen: node tools/balance.mjs missions 8 1400x875 --chapter=finale
import { F, B, Md, Deep } from './areas.js';

export default {
  id: 'finale',
  n: 'Finale',
  d: 'Alles, was du gelernt hast, in den schwersten Schlachten.',
  levels: [
    // Zeitreise: Reiter überrennen jeden Fernkämpfer, Drachen verbrennen jeden Nahkämpfer. Ritter fangen die Reiter ab,
    // Soldaten dahinter holen die Drachen herunter, Sanitäter halten die Ritter lange genug am Leben.
    {
      // Drachenatem trifft seit dem Fix bis zur Angriffsreichweite, auch Soldaten auf Abstand (vorher nie): der alte Plan
      // (12 Ritter, 25 Soldaten, 4 Sanitäter, 143) gewann nur noch 0/4; mit Scharfschützen ganz hinten wieder fast immer.
      // par 145 → 177; mit den Kosten der Balance-Runde (Ritter 4,75, Sani 3,5) 183, Budget 190
      id: 'fin-1', n: 'Zeitreise', budget: 220, par: 214,   // 18.11.: der Keil der Reiter bricht Schilde, 18 Ritter und 6 Scharfschützen
      units: ['roemer', 'ritter', 'grenadier', 'soldat', 'sniper', 'sani'],
      hint: 'Römer, Ritter, Grenadiere, Soldaten, Scharfschützen und Sanitäter aus allen Zeiten. Reiter überrennen jeden Fernkämpfer, Drachen verbrennen jeden Nahkämpfer: Wer fängt die Reiter ab, und wer holt die Drachen herunter?',
      place: [['unit', 'drache', .8, .3], ['unit', 'drache', .8, .7], ['rect', 'reiter', 24, .66, .2, .72, .8], ['rect', 'krieger', 20, .62, .3, .65, .7]],
      plan: {
        smart: [['ritter', 18, ...F], ['soldat', 24, ...B], ['sniper', 6, ...Deep], ['sani', 4, ...B]],
        spam: [['roemer', 60, ...F]],
      },
    },
    // Monster gegen Maschinen: MG-Schützen mähen Einhörner, Trolle und den Drachen, aber Magier (230 px) und Zyklopen
    // (280 px) schießen weiter und zerlegen die liegenden MGs. Scharfschützen (456 px) holen die Artillerie zuerst.
    // Panzer allein verlieren gegen Trolle und Einhörner, Geister und Phönixe gegen das Feuer der Magier.
    {
      id: 'fin-2', n: 'Monster gegen Maschinen', budget: 230, par: 205,   // Magier schwächer: MG-Masse gewann (18.11.)
      units: ['mg', 'soldat', 'sniper', 'panzer', 'geist', 'phoenix'],
      hint: 'MG-Schützen, Soldaten, Scharfschützen und Panzer, dazu Geister und Phönixe. Das MG mäht jedes Monster, das herankommt. Aber wer erwischt die Magier und Zyklopen, die von weit hinten zaubern und werfen?',
      place: [['unit', 'drache', .84, .5], ['rect', 'einhorn', 14, .66, .2, .7, .8], ['rect', 'troll', 10, .72, .3, .75, .7],
        ['rect', 'magier', 12, .84, .3, .88, .7], ['rect', 'zyklop', 5, .9, .35, .92, .65]],
      plan: {
        smart: [['mg', 32, ...F], ['sniper', 13, ...B]],
        spam: [['mg', 65, ...F]],
      },
    },
    // Die Flut: Das Wasser reicht bis an die eigene Linie. Krokodile lauern darin unsichtbar (erst ab 60 px zu sehen)
    // und packen jede Masse, die vorn steht. Schützen vorn halten sie an Land auf (schuetze > krokodil), Mörser hinten
    // schießen über den See auf Magier, Zyklopen und Schützen am anderen Ufer. Mörser allein werden gefressen.
    {
      id: 'fin-3', n: 'Die Flut', budget: 210, par: 180,
      units: ['krieger', 'schuetze', 'ritter', 'moerser', 'gorilla', 'bueffel', 'hexe'],
      hint: 'Krieger, Schützen, Ritter, Mörser, Gorillas, Büffel und Hexen. Im Wasser lauern Krokodile, unsichtbar bis kurz vor deiner Linie. Was hält sie an Land auf, und was schießt über den ganzen See bis ans andere Ufer?',
      place: [['tRect', 'wasser', .41, 0, .8, 1], ['rect', 'krokodil', 21, .5, .15, .6, .85],
        ['rect', 'magier', 8, .86, .3, .88, .7], ['rect', 'zyklop', 4, .9, .35, .92, .65],
        ['rect', 'schuetze', 10, .84, .3, .85, .7], ['rect', 'schuetze', 12, .88, .2, .9, .8]],
      plan: {
        // Audit 18.11.: par 175 → 180 und 30 statt 28 Schützen; mit 28 gewann der Smart-Plan an drei Formen nur 7/8
        smart: [['schuetze', 30, ...F], ['moerser', 12, ...B]],
        spam: [['krieger', 100, ...F]],
      },
    },
    // Die Vulkaninsel: Ein Lavaring schützt Mörser, Zyklopen, MGs und Soldaten auf der Insel; kein Bodentrupp kommt
    // hinein. Nur Scharfschützen (456 px) schießen weiter als die Mörser (420 px). Davor stürmen Reiter heraus, die jeden
    // Scharfschützen überrennen: Trolle (oder Ritter) fangen sie ab. Drachen und Phönixe fliegen in das Abwehrfeuer.
    {
      id: 'fin-4', n: 'Die Vulkaninsel', budget: 240, par: 190,
      units: ['ritter', 'troll', 'sniper', 'moerser', 'phoenix', 'drache'],
      hint: 'Ritter, Trolle, Scharfschützen, Mörser, Phönixe und Drachen. Auf der Insel im Lavaring stehen Mörser, die weit schießen, davor stürmen Reiter. Wer schießt noch weiter als ein Mörser, und wer hält solchen Schützen die Reiter vom Leib?',
      place: [['tCircle', 'lava', .8, .5, .3, .22], ['rect', 'reiter', 18, .56, .2, .61, .8], ['circle', 'moerser', 6, .8, .5, .1],
        ['circle', 'zyklop', 4, .82, .5, .06], ['circle', 'mg', 6, .8, .5, .16], ['circle', 'soldat', 8, .8, .5, .19]],
      plan: {
        smart: [['troll', 10, ...F], ['sniper', 16, ...B]],
        spam: [['ritter', 53, ...F]],
      },
    },
    // Endschlacht: alles zusammen. Reiter stürmen vorweg (Ritter fangen sie ab), dahinter Elefanten und
    // Panzer (Panzerfäuste), Drachen darüber (MG und Raketen) und auf einer Insel in einem breiten Lavasee Mörser und
    // Magier, an die nur Scharfschützen herankommen (456 px über 0,3 H Lava; MG, Panzerfaust und Magier reichen nicht).
    // Jede Einheit allein scheitert an einem Teil des Heers.
    {
      id: 'fin-5', n: 'Endschlacht', budget: 350, par: 303,
      units: ['ritter', 'schuetze', 'sani', 'mg', 'panzerfaust', 'sniper', 'magier'],
      hint: 'Ritter, Schützen, Sanitäter, MG-Schützen, Panzerfäuste, Scharfschützen und Magier gegen das ganze Heer: Reiter, Elefanten, Panzer, Drachen und Mörser auf der Lavainsel. Jeder Gegner hat seinen Konter. Brauchst du sie alle?',
      place: [['tCircle', 'lava', .87, .5, .45, .15],
        ['rect', 'reiter', 30, .5, .12, .56, .88], ['unit', 'elefant', .58, .35], ['unit', 'elefant', .58, .65],
        ['unit', 'panzer', .6, .25], ['unit', 'panzer', .6, .75], ['unit', 'drache', .7, .2], ['unit', 'drache', .7, .8],
        ['circle', 'moerser', 5, .87, .5, .06], ['circle', 'magier', 6, .87, .5, .12]],
      plan: {
        smart: [['ritter', 16, ...F], ['panzerfaust', 18, ...Md], ['sniper', 12, ...B], ['mg', 10, ...B]],
        spam: [['schuetze', 140, ...F]],
      },
    },
  ],
};
