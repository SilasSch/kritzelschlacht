// Kapitel „Moderner Krieg“ (Spez. #52): Schützengräben, Panzer und Hubschrauber. Nur moderne Einheiten (soldat, mg,
// sniper, panzerfaust, moerser, panzer, heli), je Level eingeschränkt. Felder und Regeln: docs/kampagne.md.
// Prüfen: node tools/balance.mjs missions 8 1400x875 --chapter=modern (und newspam).
//
// Befund beim Bauen (Balance): Eine gemischte Armee schlägt die volle Masse einer einzigen Einheit nur, wenn der Gegner
// für jede Einheit einen harten Konter hat (Mörser treffen keine Hubschrauber, gerade Schüsse prallen an Mauern ab,
// Kugeln machen Panzern nur 25 %). Sonst gewinnt Masse. Darum lehren mod-1 bis mod-3 je eine Einheit, die dort die
// Lösung ist (answer), und erst mod-4 und mod-5 verlangen eine Mischung, die keine Einheit allein ersetzt.
import { F, B, Md, Deep } from './areas.js';

// Wald an den Flanken (mod-2): hier liegen die Panzerfäuste im Hinterhalt (Deckung: halber Schaden)
const WALD_O = [.3, .08, .4, .3], WALD_U = [.3, .7, .4, .92];

export default {
  id: 'modern',
  n: 'Moderner Krieg',
  d: 'MGs, Scharfschützen, Mörser, Panzer und Hubschrauber.',
  levels: [
    // mod-1: MG-Nester hinter Sandsäcken mähen jeden Sturm (Soldaten-Spam verliert). Scharfschützen schießen 456 px weit,
    // weiter als jedes MG (170 px): sie sind die Lösung (answer), ein paar Soldaten davor geben ihnen eine Front.
    {
      id: 'mod-1', n: 'Der Schützengraben', budget: 80, par: 62,
      units: ['soldat', 'sniper'], cats: ['modern', 'gelaende'],
      hint: 'Soldaten und Scharfschützen. Hinter den Sandsäcken liegen MG-Nester und mähen jeden Sturm. Wer schießt weiter als ein MG?',
      place: [
        ['tRect', 'mauer', .62, .14, .63, .4], ['tRect', 'mauer', .62, .6, .63, .86],
        ['rect', 'mg', 12, .645, .2, .66, .8],
        ['rect', 'soldat', 4, .56, .3, .58, .7],
      ],
      plan: { smart: [['soldat', 4, ...F], ['sniper', 7, ...B]], spam: [['soldat', 26, ...F]] },
      answer: ['sniper'],
    },
    // mod-2: Kugeln machen Panzern nur 25 % (combat.hurt), Raketen 160 %. Soldaten und MGs gegen fünf Panzer verlieren,
    // Panzerfäuste sind die Lösung (answer); im Wald an den Flanken halbiert die Deckung die Granaten der Panzer (20
    // Panzerfäuste im Wald gewannen 8/8, dieselben 20 vorn im Freien an einzelnen Formen nur 2/8).
    {
      id: 'mod-2', n: 'Panzerhinterhalt', budget: 150, par: 120,
      units: ['soldat', 'mg', 'panzerfaust'], cats: ['modern', 'gelaende'],
      hint: 'Soldaten, MGs und Panzerfäuste. Fünf Panzer rollen heran, Kugeln prallen an ihnen ab. Legt euch im Wald an den Flanken auf die Lauer.',
      place: [
        ['tRect', 'wald', .28, .05, .42, .32], ['tRect', 'wald', .28, .68, .42, .95],
        ['unit', 'panzer', .66, .3], ['unit', 'panzer', .68, .5], ['unit', 'panzer', .66, .7],
        ['unit', 'panzer', .76, .4], ['unit', 'panzer', .76, .6],
        ['rect', 'soldat', 6, .6, .3, .62, .7],
      ],
      plan: { smart: [['panzerfaust', 10, ...WALD_O], ['panzerfaust', 10, ...WALD_U]], spam: [['soldat', 50, ...F]] },
      answer: ['panzerfaust'],
    },
    // mod-3: Mörser und Panzer kommen gegen Hubschrauber nicht an (Mörser-Spam tötet keinen, Panzer-Spam verliert),
    // Soldaten sterben an den Panzern. Das Dauerfeuer der MGs holt die Hubschrauber herunter und zermürbt auch die
    // Panzer (Kugeln 25 %, aber 9 Schuss pro Sekunde): MGs sind die Lösung (answer).
    {
      id: 'mod-3', n: 'Luftangriff', budget: 160, par: 130,
      units: ['soldat', 'mg', 'panzer', 'moerser'], cats: ['modern'],
      hint: 'Soldaten, MGs, Panzer und Mörser. Drei Hubschrauber greifen mit Panzern an. Mörser und Panzer treffen in der Luft wenig, Dauerfeuer schon.',
      place: [
        ['unit', 'panzer', .7, .5], ['unit', 'panzer', .66, .3], ['unit', 'panzer', .66, .7],
        ['unit', 'heli', .8, .25], ['unit', 'heli', .8, .75], ['unit', 'heli', .86, .5],
      ],
      plan: { smart: [['mg', 37, ...F]], spam: [['soldat', 53, ...F]] },
      answer: ['mg'],
    },
    // mod-4: Mörser und MGs in einer Ringmauer, zwei Hubschrauber darüber. Gerade Schüsse treffen die Mauer, nur Mörser
    // schießen darüber (Soldaten- und MG-Spam verlieren); Mörser treffen keine Hubschrauber (Mörser-Spam verliert, auch
    // weil das feindliche Sperrfeuer dichte Haufen trifft). Die Lösung braucht beides: Mörser breit verteilt ganz hinten
    // für die Festung, MGs für die Hubschrauber.
    {
      id: 'mod-4', n: 'Mörserduell', budget: 135, par: 108,
      units: ['soldat', 'mg', 'moerser'], cats: ['modern'],
      hint: 'Soldaten, MGs und Mörser. Die Festung hält gerade Schüsse ab, ihre Mörser zielen auf dichte Haufen, und über ihr kreisen Hubschrauber. Steilfeuer weit hinten und breit verteilt, dazu etwas gegen die Luft.',
      place: [
        ['tCircle', 'mauer', .8, .5, .26, .2],
        ['circle', 'moerser', 6, .82, .5, .08],
        ['circle', 'mg', 8, .8, .5, .17],
        ['unit', 'heli', .8, .3], ['unit', 'heli', .8, .7],
      ],
      plan: { smart: [['moerser', 10, ...Deep], ['mg', 6, ...B]], spam: [['soldat', 45, ...F]] },
    },
    // mod-5: alles aus dem Kapitel zugleich. Vor einer dicken Ringmauer drei Panzer, drei Hubschrauber und fünf
    // Panzerfäuste, in der Festung Mörser, MGs und Scharfschützen. Jede Einheit allein verliert: Soldaten, Scharfschützen
    // und Mörser gegen Panzer und Hubschrauber, Panzer gegen Panzerfäuste und Hubschrauber, Hubschrauber und MGs gegen
    // die Panzerfäuste, Panzerfäuste an der dicken Mauer unter Sperrfeuer und Scharfschützen. Lösung: Panzerfäuste vorn
    // gegen Panzer und Hubschrauber, MGs hinten gegen die Luft, Mörser breit verteilt ganz hinten gegen die Festung.
    // Der Wassergraben um die Mauer bremst Bodentruppen auf 40 %: Panzerfäuste stehen dort lange im Sperrfeuer, die
    // Mörser schießen über Graben und Mauer. budget/par nur 1,14: 41 statt 40 Panzerfäuste (ohne Graben) gewannen an
    // einzelnen Formen 3/6.
    {
      id: 'mod-5', n: 'Die große Panzerschlacht', budget: 240, par: 220,
      units: ['soldat', 'mg', 'sniper', 'panzerfaust', 'moerser', 'panzer', 'heli'], cats: ['modern'],
      hint: 'Alle modernen Einheiten. Panzer und Hubschrauber vor Wassergraben und dicker Festungsmauer, darin Mörser und Scharfschützen. Keine Einheit schafft das allein: Raketen vorn, Dauerfeuer dahinter, Steilfeuer breit verteilt ganz hinten.',
      place: [
        ['tCircle', 'wasser', .82, .5, .32, .245],
        ['tCircle', 'mauer', .82, .5, .24, .12],
        ['circle', 'moerser', 7, .84, .5, .07],
        ['circle', 'mg', 4, .82, .5, .09],
        ['rect', 'sniper', 7, .8, .4, .84, .6],
        ['unit', 'panzer', .58, .3], ['unit', 'panzer', .58, .7], ['unit', 'panzer', .6, .5],
        ['unit', 'heli', .66, .15], ['unit', 'heli', .66, .85], ['unit', 'heli', .7, .5],
        ['rect', 'panzerfaust', 5, .58, .38, .6, .62],
      ],
      // Audit 18.11.: par 210 → 220 und 10 statt 8 MGs; mit 8 gewann der Smart-Plan an zwei Formen nur 7/8
      plan: { smart: [['moerser', 10, ...Deep], ['panzerfaust', 16, ...F], ['mg', 10, ...B]], spam: [['soldat', 80, ...F]] },
    },
  ],
};
