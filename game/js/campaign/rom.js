// Kapitel „Rom gegen die Barbaren“ (Spez. #52). Felder eines Levels und Regeln: docs/kampagne.md.
// Prüfen: node tools/balance.mjs missions 8 --chapter=rom und node tools/balance.mjs newspam 8 --chapter=rom
import { F, B } from './areas.js';

// Römer bilden nur aus dicht gemalten Gruppen einen Block (formation.FORM.LINK 50 px; Pinsel: 21–30 px). Die Pläne
// setzen sie darum als dichten Block: n Römer in einem 0,05 breiten Rechteck um (x, y), etwa 24 px Abstand.
const blk = (n, x = .355, y = .5) => { const h = n * .0055; return [x - .025, y - h / 2, x + .025, y + h / 2]; };

export default {
  id: 'rom',
  n: 'Rom gegen die Barbaren',
  d: 'Der Römerblock gegen wilde Horden, Wälder und Flüsse.',
  levels: [
    {
      id: 'rom-1', n: 'Der erste Block', budget: 100, par: 80,
      units: ['roemer'],
      hint: 'Nur Römer. Male sie dicht beieinander: Als Block marschieren sie im Gleichschritt und werfen vor dem Zusammenstoß ihre Speere. Verstreut fallen sie einzeln.',
      place: [['rect', 'krieger', 32, .62, .3, .72, .7], ['rect', 'schuetze', 6, .8, .38, .84, .62]],   // Audit 18.11.: 30 → 32 Krieger nach dem Vorhalt-Fix (verstreute Römer gewannen sonst manchmal)
      // Lehre: derselbe Römer, dicht als Block gemalt, gewinnt; über das ganze Feld verstreut verliert er
      answer: ['roemer'],
      plan: { smart: [['roemer', 26, ...blk(26)]], spam: [['roemer', 33, .05, .06, .4, .94]] },
    },
    {
      id: 'rom-2', n: 'Pfeilhagel am Waldrand', budget: 125, par: 115,
      units: ['roemer', 'krieger'],
      hint: 'Römer und Krieger. Am Waldrand warten viele Bogenschützen. Krieger laufen offen in die Pfeile, die Schilde der Römer halten sie von vorn ab, solange der Block geschlossen bleibt.',
      place: [['tRect', 'wald', .66, .05, .9, .95], ['rect', 'schuetze', 50, .7, .15, .86, .85]],
      // Lehre: Schilde gegen Pfeile; Krieger mit vollem Budget verlieren 0/8
      answer: ['roemer'],
      plan: { smart: [['roemer', 38, ...blk(38)]], spam: [['krieger', 62, ...F]] },
    },
    {
      id: 'rom-3', n: 'Hinterhalt im Wald', budget: 125, par: 121,   // 17 Schützen (18.11.)
      units: ['roemer', 'schuetze'],
      hint: 'Römer und Schützen. Aus den Wäldern oben und unten brechen Wolfsrudel hervor, in der Mitte stehen Bären. Wölfe hetzen Schützen, Bären sprengen einen einzelnen Block. Wer fängt die Rudel an den Flanken ab?',
      place: [
        ['tRect', 'wald', .62, 0, .82, .26], ['tRect', 'wald', .62, .74, .82, 1],
        ['rect', 'wolf', 18, .66, .04, .78, .22], ['rect', 'wolf', 18, .66, .78, .78, .96],
        ['rect', 'baer', 3, .66, .35, .7, .65], ['rect', 'krieger', 12, .74, .38, .78, .62],
      ],
      plan: {
        // zwei Blöcke an den Flanken fangen die Rudel ab, die Schützen dahinter schießen die Bären (ein Block: 0–1/8)
        smart: [['roemer', 13, ...blk(13, .32, .28)], ['roemer', 13, ...blk(13, .32, .72)], ['schuetze', 17, ...B]],
        spam: [['schuetze', 48, ...F]],
      },
    },
    {
      id: 'rom-4', n: 'Die Furt', budget: 120, par: 115,   // Audit 18.11.: +5 nach dem Vorhalt-Fix (Smart 22 statt 20 Schützen)
      units: ['roemer', 'schuetze'],
      hint: 'Römer und Schützen. Wölfe und Bären waten durch den Fluss, drüben schießen Bogenschützen. Im Wasser sind sie langsam: Ein Block am Ufer hält sie auf, dahinter treffen die Pfeile.',
      place: [
        ['tRect', 'wasser', .45, 0, .55, 1],
        ['rect', 'wolf', 36, .6, .1, .68, .9], ['rect', 'baer', 5, .72, .3, .76, .7], ['rect', 'schuetze', 10, .8, .3, .84, .7],
      ],
      // Schützen allein: die Wölfe holen sie ein; Römer allein: die Bären sprengen den Block
      plan: { smart: [['roemer', 20, ...blk(20)], ['schuetze', 22, ...B]], spam: [['roemer', 38, ...F]] },
    },
    {
      id: 'rom-5', n: 'Die große Horde', budget: 210, par: 205,
      units: ['roemer', 'schuetze', 'sani'],
      hint: 'Römer, Schützen und Sanitäter. Die ganze Horde kommt: Krieger, Bären und Bogenschützen in der Mitte, große Wolfsrudel an beiden Flanken. Ein Block allein reicht nicht: Alles, was du gelernt hast, zählt jetzt.',
      place: [
        ['tRect', 'wald', .9, 0, 1, 1],
        ['rect', 'krieger', 36, .62, .25, .72, .75], ['rect', 'baer', 5, .74, .35, .77, .65],
        ['rect', 'wolf', 22, .64, .02, .78, .2], ['rect', 'wolf', 22, .64, .8, .78, .98],
        ['rect', 'schuetze', 12, .8, .28, .86, .72],
      ],
      plan: {
        // drei Blöcke (die äußeren groß, gegen die Rudel), die Schützen dahinter gegen Bären und Krieger
        smart: [['roemer', 18, ...blk(18, .34, .22)], ['roemer', 12, ...blk(12, .36, .5)], ['roemer', 18, ...blk(18, .34, .78)], ['schuetze', 24, ...B]],
        spam: [['schuetze', 84, ...F]],
      },
    },
  ],
};
