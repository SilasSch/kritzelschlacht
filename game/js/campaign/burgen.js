// Kapitel „Burgen & Ritter“ (Spez. #52): von der Holzpalisade bis zur großen Festung mit Grenadiertürmen.
// Felder eines Levels und Regeln: docs/kampagne.md. Prüfen: node tools/balance.mjs missions 8 1400x875 --chapter=burgen
//
// Was jedes Level lehrt (Konter aus data.js COUNTERS und ABIL):
// burg-1 Schildwall gegen Pfeile (ritter > schuetze). Die Ritter sind hier selbst die Lösung, darum answer.
// burg-2 Die eigene Mauer: Pfeile fliegen im Bogen darüber, Ritter stopfen das Tor gegen Reiter (ritter > reiter).
// burg-3 Grenadiere sprengen Mauern und Bombenwerfer, Ritter fangen dabei die Pfeile ab.
// burg-4 Reiter um den Graben herum in die Grenadiere (reiter > grenadier). Reiter als Masse sind die Lösung (answer).
// burg-5 Alles zusammen gegen eine Festung mit Tor, Grenadiertürmen, Schildwall, Römern und Reitern.
import { F, B, Md } from './areas.js';

// burg-2: direkt vor der Lücke der eigenen Mauer (Tor) und breit verteilt hinter der Mauer
const GATE = [.38, .44, .42, .56], WIDE = [.2, .25, .3, .75];

export default {
  id: 'burgen',
  n: 'Burgen & Ritter',
  d: 'Mauern stürmen, Tore halten: Ritter, Schützen und Belagerung.',
  levels: [
    {
      // Schützen-Spam gewann hier (Pfeile fliegen über die Palisade), darum ohne Schützen; Grenadiere sind unterlegen
      // (Schützen schießen weiter), Krieger werden zerschossen
      id: 'burg-1', n: 'Die Palisade', budget: 90, par: 62,
      units: ['krieger', 'ritter', 'grenadier'], cats: ['armee'],
      hint: 'Hinter der Palisade lauern Bogenschützen im Wald. Krieger, Ritter oder Grenadiere: Wer hält den Pfeilhagel aus, bis er drüben ist?',
      place: [
        ['tRect', 'wald', .64, .15, .8, .85],
        ['tRect', 'mauer', .6, .18, .615, .82],
        ['rect', 'schuetze', 24, .68, .28, .76, .72],
        ['rect', 'krieger', 8, .63, .4, .65, .6],
      ],
      answer: ['ritter'],
      plan: { smart: [['ritter', 13, ...F]], spam: [['krieger', 45, ...F]] },
    },
    {
      // Ohne Krieger: 45 Krieger gewannen an einzelnen Formen bis 4/8 (sie quellen durchs Tor und binden die Reiter)
      id: 'burg-2', n: 'Das Tor', budget: 92, par: 83,
      units: ['schuetze', 'ritter', 'sani'], cats: ['armee'],
      hint: 'Eine Reiterhorde stürmt auf dein Tor zu, Grenadiere sprengen die Mauer. Schützen, Ritter und Sanitäter: Wer stopft das Tor, und wer schießt über die Mauer?',
      place: [
        ['tRect', 'mauer', .43, 0, .445, .45],
        ['tRect', 'mauer', .43, .55, .445, 1],
        ['rect', 'reiter', 16, .55, .25, .65, .75],
        ['rect', 'grenadier', 8, .72, .35, .76, .65],
      ],
      plan: { smart: [['ritter', 9, ...GATE], ['schuetze', 16, ...WIDE]], spam: [['schuetze', 36, ...F]] },
    },
    {
      // 23 statt 20 Schützen und Budget 95: 25 Grenadiere gewannen sonst an einzelnen Formen 2/8
      id: 'burg-3', n: 'Die Bresche', budget: 95, par: 82,
      units: ['krieger', 'ritter', 'grenadier'], cats: ['armee'],
      hint: 'Eine geschlossene Burg voller Schützen und Bombenwerfer. Krieger, Ritter und Grenadiere: Bomben reißen die Mauer auf, aber wer fängt solange die Pfeile ab?',
      place: [
        ['tRect', 'mauer', .6, .2, .625, .8],
        ['tRect', 'mauer', .6, .2, .9, .235],
        ['tRect', 'mauer', .6, .765, .9, .8],
        ['tRect', 'mauer', .875, .2, .9, .8],
        ['rect', 'schuetze', 23, .7, .28, .8, .72],
        ['rect', 'grenadier', 8, .82, .4, .85, .6],
      ],
      plan: { smart: [['ritter', 7, ...F], ['grenadier', 12, ...Md]], spam: [['krieger', 47, ...F]] },
    },
    {
      // Reiter als Masse gewinnen auch (answer): die Lehre ist reiter > grenadier, der Smart-Plan bindet die Ritter mit Kriegern
      id: 'burg-4', n: 'Reiter in der Flanke', budget: 120, par: 90,
      units: ['krieger', 'ritter', 'reiter'], cats: ['armee'],
      hint: 'Hinter dem Burggraben steht ein Schildwall, dahinter eine Batterie Grenadiere. Krieger, Ritter und Reiter: Wer bindet die Front, und wer reitet außen herum?',
      place: [
        ['tRect', 'wasser', .5, .25, .6, .75],
        ['rect', 'ritter', 12, .64, .32, .69, .68],
        ['rect', 'grenadier', 14, .8, .3, .85, .7],
      ],
      answer: ['reiter'],
      plan: { smart: [['krieger', 20, ...F], ['reiter', 15, ...B]], spam: [['krieger', 60, ...F]] },
    },
    {
      // Ohne Reiter: 50 Reiter gewannen die offene Festung (Tor) zuverlässig, auch gegen 10–18 Ritter. Türme bei y = .24
      // und .76 (nicht am Rand: dort lagen sie unter Missionsleiste und Malleiste); sie halten den Ritter-Spam auf.
      id: 'burg-5', n: 'Die große Festung', budget: 160, par: 142,
      units: ['krieger', 'schuetze', 'ritter', 'grenadier', 'sani', 'roemer'], cats: ['armee'],
      hint: 'Türme voller Grenadiere, ein Schildwall im Tor, Römer, Schützen und Reiter im Hof. Krieger, Schützen, Ritter, Grenadiere, Sanitäter und Römer: Was du in diesem Kapitel gelernt hast, brauchst du jetzt zusammen.',
      place: [
        ['tRect', 'mauer', .6, .18, .62, .44],
        ['tRect', 'mauer', .6, .56, .62, .82],
        ['tCircle', 'mauer', .66, .24, .075, .055],
        ['tCircle', 'mauer', .66, .76, .075, .055],
        ['circle', 'grenadier', 4, .66, .24, .04],
        ['circle', 'grenadier', 4, .66, .76, .04],
        ['rect', 'ritter', 10, .66, .36, .7, .64],
        ['rect', 'roemer', 8, .73, .38, .76, .62],
        ['rect', 'schuetze', 12, .8, .28, .85, .72],
        ['rect', 'reiter', 6, .87, .3, .9, .7],
        ['rect', 'sani', 2, .9, .42, .92, .58],
      ],
      plan: {
        smart: [['ritter', 12, ...F], ['grenadier', 4, ...Md], ['schuetze', 26, .2, .2, .3, .8], ['sani', 1, .14, .45, .16, .55]],
        spam: [['krieger', 80, ...F]],
      },
    },
  ],
};
