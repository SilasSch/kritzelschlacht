// Kapitel „Schrottplatz“ (25.11.): Roboter gegen Roboter. Felder eines Levels und Regeln: docs/kampagne.md.
// Budget und par stammen aus der Spar-Suche (tools/cheapwin.mjs): par liegt knapp über der billigsten Armee, die die
// Suche gegen die (gehärteten) Gegner gewinnen sah, das Budget etwa 1,3-mal darüber. So reicht ein Bruchteil des Budgets
// nicht mehr. Werte hier sind vor harden() (campaign/index.js: × BUDGET_SCALE), plan.smart ist der Fund der Suche.
// Prüfen: node tools/cheapwin.mjs schrott und node tools/balance.mjs missions 8 --chapter=schrott
import { F, B } from './areas.js';

export default {
  id: 'schrott',
  n: 'Schrottplatz',
  d: 'Minibots, Laser und Teslaspulen: Roboter gegen Roboter zwischen den Schrotthaufen.',
  levels: [
    // Masse aus Minibots: Kettenblitze der Teslaspule springen von Bot zu Bot
    {
      id: 'schrott-1', n: 'Die Blechlawine', budget: 75, par: 58,
      units: ['minibot', 'laserbot', 'schweisser', 'tesla'], answer: ['tesla'],
      hint: 'Minibots, Laserbots, Schweißer und Teslaspulen. Eine Lawine aus Minibots rollt heran. Was trifft viele auf einmal?',
      place: [
        ['tRect', 'mauer', .55, .05, .57, .3], ['tRect', 'mauer', .55, .7, .57, .95],
        ['rect', 'minibot', 34, .66, .2, .78, .8], ['rect', 'drohne', 3, .84, .4, .88, .6],
      ],
      plan: { smart: [['tesla', 5, ...B]], spam: [['minibot', 34, ...F]] },
    },
    // Der Magnet zieht Metall in einen Haufen: Ritter und Bots kleben fest, Tiere und Schützen nicht
    {
      id: 'schrott-2', n: 'Magnetfalle', budget: 102, par: 78,
      units: ['ritter', 'minibot', 'schuetze', 'wolf'], answer: ['wolf', 'minibot', 'schuetze'],
      hint: 'Ritter, Minibots, Schützen und Wölfe. Die Magnet-Mechs ziehen alles aus Metall zu sich. Wer hat keine Rüstung?',
      place: [
        ['rect', 'magnet', 4, .64, .3, .68, .7], ['rect', 'laserbot', 8, .78, .25, .84, .75],
      ],
      plan: { smart: [['wolf', 32, ...F]], spam: [['ritter', 14, ...F]] },
    },
    // Die Kuppeln fangen Geschosse von außen ab; wer springt oder schlägt, kommt hinein
    {
      id: 'schrott-3', n: 'Hinter der Kuppel', budget: 90, par: 69,
      units: ['laserbot', 'spinne', 'minibot', 'schweisser'], answer: ['spinne', 'minibot', 'laserbot'],
      hint: 'Laserbots, Springspinnen, Minibots und Schweißer. Schildkuppeln halten Schüsse von außen ab. Wer kommt unter die Kuppel?',
      place: [
        ['tCircle', 'wald', .86, .15, .08], ['tCircle', 'wald', .86, .85, .08],
        ['rect', 'kuppel', 4, .68, .3, .72, .7], ['rect', 'laserbot', 10, .76, .25, .82, .75],
      ],
      plan: { smart: [['spinne', 14, ...F]], spam: [['schweisser', 15, ...F]] },
    },
    // Ein Riese aus Stahl: Blitze und Laser setzen ihm zu, Minibots zerschellen
    {
      id: 'schrott-4', n: 'Der Mega-Mech', budget: 61, par: 46,
      units: ['minibot', 'spinne', 'laserbot', 'tesla'], answer: ['tesla', 'laserbot'],
      hint: 'Minibots, Springspinnen, Laserbots und Teslaspulen. Ein Mega-Mech stampft heran und zerfällt beim Tod in Minibots. Was hält ihn auf Abstand?',
      place: [
        ['unit', 'mega', .74, .5], ['rect', 'minibot', 10, .64, .2, .68, .8], ['rect', 'schweisser', 3, .82, .4, .86, .6],
      ],
      plan: { smart: [['tesla', 4, ...B]], spam: [['minibot', 28, ...F]] },
    },
    // Alles zusammen: der Schrottkönig verteidigt seinen Hof
    {
      id: 'schrott-5', n: 'Der Schrottkönig', budget: 142, par: 109,
      cats: ['schrott'], answer: ['tesla', 'laserbot'],
      hint: 'Alle Roboter. Mega-Mech, Teslaspulen hinter Schildkuppeln und Drohnen, die Bots flicken. Erst die Spulen, dann der Riese?',
      place: [
        ['tRect', 'mauer', .6, .08, .62, .32], ['tRect', 'mauer', .6, .68, .62, .92],
        ['unit', 'mega', .7, .5], ['rect', 'kuppel', 2, .78, .35, .8, .65], ['rect', 'tesla', 3, .84, .3, .88, .7],
        ['rect', 'drohne', 3, .9, .4, .93, .6], ['rect', 'minibot', 14, .66, .15, .72, .3],
      ],
      plan: { smart: [['tesla', 5, ...B], ['mega', 1, ...F]], spam: [['minibot', 66, ...F]] },
    },
  ],
};
