// Kapitel „Wildnis“ (Spez. #52): nur Tiere, gegen Tiere und gegen Jäger. Felder eines Levels und Regeln: docs/kampagne.md.
// Prüfen: node tools/balance.mjs missions 8 --chapter=wildnis und node tools/balance.mjs newspam 8 --chapter=wildnis
//
// Befund beim Bauen: Bei gleichen Kosten gewinnt fast immer die reine Masse einer Einheit gegen eine Mischung (die
// Schlagkraft wächst mit der Zahl schneller als linear). Eine Mischung lohnt sich darum nur, wenn ein Teil der
// Gegner für eine Einheit unerreichbar ist: Felsen, die nur Flieger überwinden (wild-4), oder ein Buschfeuer, das das
// Tal in zwei getrennte Kämpfe teilt (wild-5). Die ersten drei Level lehren je einen Konter; dort ist die gewollte
// Einheit als Masse die Lösung (answer), die übrigen erlaubten Einheiten verlieren auch mit vollem Budget.
import { F, B, Deep } from './areas.js';

const WIDE = [.30, .15, .38, .85];      // Front, über fast die ganze Höhe
const TOP = [.30, .08, .38, .34];       // obere Talhälfte (wild-5)
const BOT = [.28, .66, .38, .92];       // untere Talhälfte (wild-5)

export default {
  id: 'wildnis',
  n: 'Wildnis',
  d: 'Nur Tiere: Rudel, Schwärme und Herden gegen Jäger und Dickhäuter.',
  levels: [
    // Wölfe sind schnell und jagen ab 3 im Rudel; Schützen weichen langsamen Bären aus und schießen sie zusammen
    {
      id: 'wild-1', n: 'Die Wolfsjagd', budget: 70, par: 50,
      units: ['wolf', 'baer'], cats: ['tiere'], answer: ['wolf'],
      hint: 'Nur Wölfe und Bären. Die Jäger schießen aus sicherer Entfernung und weichen langsamen Gegnern aus. Wer ist schnell genug, sie einzuholen?',
      place: [
        ['tCircle', 'wald', .79, .12, .1], ['tCircle', 'wald', .79, .88, .1],
        ['rect', 'krieger', 8, .64, .35, .67, .65], ['rect', 'schuetze', 20, .74, .2, .84, .8],
      ],
      plan: { smart: [['wolf', 30, ...WIDE]], spam: [['baer', 7, ...F]] },
    },
    // Bienen schlagen Elefanten (COUNTERS), und Elefanten fliehen vor Bienen; jeder Nahkampf verliert
    {
      id: 'wild-2', n: 'Die Elefantenherde', budget: 75, par: 70,
      units: ['biene', 'baer', 'gorilla', 'elefant'], cats: ['tiere'], answer: ['biene'],
      hint: 'Bienen, Bären, Gorillas und Elefanten. Gegen sechs Elefanten verliert jeder Nahkampf. Doch selbst der größte Dickhäuter hat Angst vor etwas ganz Kleinem.',
      place: [['tCircle', 'wasser', .84, .5, .14], ['rect', 'elefant', 6, .66, .25, .74, .75]],
      plan: { smart: [['biene', 70, ...B]], spam: [['baer', 7, ...F]] },
    },
    // Krokodile sind im Wasser schnell und unsichtbar: die watenden Schützen sehen sie erst, wenn es zu spät ist
    {
      id: 'wild-3', n: 'Der Krokodilfluss', budget: 85, par: 62,
      units: ['krokodil', 'baer', 'gorilla', 'bueffel'], cats: ['tiere'], answer: ['krokodil'],
      hint: 'Krokodile, Bären, Gorillas und Büffel. Die Jäger waten durch den Fluss. Wasser bremst alle Bodentruppen, nur eine Einheit ist darin schnell und kaum zu sehen.',
      place: [
        ['tRect', 'wasser', .40, -.1, .78, 1.1],
        ['rect', 'krieger', 8, .58, .3, .62, .7], ['rect', 'schuetze', 16, .66, .25, .74, .75],
      ],
      plan: { smart: [['krokodil', 13, ...F]], spam: [['baer', 8, ...F]] },
    },
    // Über die Felsen kommen nur Adler, aber gegen die Krieger am Fuß des Hügels taugen sie nichts: Bären halten die
    // Krieger auf, Adler weit hinten und breit verteilt holen die Schützen vom Hügel. Jede Einheit allein verliert.
    {
      id: 'wild-4', n: 'Der Adlerhorst', budget: 110, par: 90,
      units: ['adler', 'wolf', 'baer', 'bueffel'], cats: ['tiere'],
      hint: 'Adler, Wölfe, Bären und Büffel. Die Schützen sitzen auf einem Hügel hinter Felsen, unten warten Krieger. Über die Felsen kommt nur, wer fliegt. Und wer hält solange die Krieger auf?',
      place: [
        ['tCircle', 'mauer', .8, .5, .22, .18], ['circle', 'schuetze', 14, .8, .5, .14],
        ['rect', 'krieger', 26, .58, .28, .64, .72],
      ],
      plan: { smart: [['adler', 12, ...Deep], ['baer', 4, ...F]], spam: [['wolf', 76, ...F]] },
    },
    // Ein Buschfeuer (Lava) teilt das Tal in zwei getrennte Kämpfe. Es ist 20 % der Höhe breit: bei 6 % warfen Stöße
    // Bären ins falsche Tal, bei 12 % liefen die Bären oben noch lange den Wölfen jenseits des Feuers nach. Oben ein
    // Bärenclan: dort helfen nur Bären (oder Elefanten), Wölfe gehen unter. Unten Schützen mit einer Büffelherde: dort
    // jagen Wölfe, Bären sind zu langsam. Masse einer Einheit verliert immer eine Talhälfte. Flieger sind nicht
    // erlaubt (sie kämen über das Feuer).
    {
      id: 'wild-5', n: 'Die große Stampede', budget: 220, par: 180,
      units: ['wolf', 'baer', 'krokodil', 'bueffel', 'gorilla', 'elefant'], cats: ['tiere'],
      hint: 'Alle Tiere am Boden. Ein Buschfeuer teilt das Tal: oben ein Bärenclan, unten Jäger mit einer Büffelherde. Über das Feuer kommt keiner, jede Talhälfte braucht ihr eigenes Rudel.',
      place: [
        ['tRect', 'lava', -.2, .40, 1.2, .60],
        ['rect', 'baer', 7, .7, .1, .76, .34],
        ['rect', 'schuetze', 23, .72, .66, .83, .94], ['rect', 'bueffel', 8, .84, .68, .9, .92],
      ],
      plan: { smart: [['baer', 11, ...TOP], ['wolf', 46, ...BOT]], spam: [['wolf', 146, ...F]] },
    },
  ],
};
