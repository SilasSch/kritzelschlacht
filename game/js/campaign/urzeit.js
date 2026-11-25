// Kapitel „Urzeit“ (25.11.): Höhlenmenschen und Dinosaurier. Felder eines Levels und Regeln: docs/kampagne.md.
// Budget und par stammen aus der Spar-Suche (tools/cheapwin.mjs): par liegt knapp über der billigsten Armee, die die
// Suche gegen die (gehärteten) Gegner gewinnen sah, das Budget etwa 1,3-mal darüber. Werte hier sind vor harden()
// (campaign/index.js: × BUDGET_SCALE), plan.smart ist der Fund der Suche.
// Prüfen: node tools/cheapwin.mjs urzeit und node tools/balance.mjs missions 8 --chapter=urzeit
import { F, B } from './areas.js';

export default {
  id: 'urzeit',
  n: 'Urzeit',
  d: 'Keulen, Speere und Dinosaurier: Wer zuerst zuschlägt, bevor die Riesen groß sind?',
  levels: [
    // Raptoren springen Fernkämpfer an; Höhlenmenschen mit Fackel halten sie auf
    {
      id: 'urzeit-1', n: 'Die Raptorenjagd', budget: 61, par: 46,
      units: ['hoehle', 'speer', 'anky'], answer: ['hoehle'],
      hint: 'Höhlenmenschen, Speerwerfer und Ankylosaurier. Raptoren springen jeden an, der hinten steht. Wer stellt sich ihnen in den Weg?',
      place: [
        ['tCircle', 'wald', .7, .2, .1], ['tCircle', 'wald', .7, .8, .1],
        ['rect', 'raptor', 16, .74, .3, .84, .7],
      ],
      plan: { smart: [['hoehle', 14, ...F]], spam: [['speer', 16, ...B]] },
    },
    // Drei Eier: wer früh angreift, trifft die T-Rexe, bevor sie groß sind
    {
      id: 'urzeit-2', n: 'Die Brutstätte', budget: 102, par: 78,
      units: ['raptor', 'hoehle', 'speer', 'trike'], answer: ['speer', 'hoehle', 'raptor'],
      hint: 'Raptoren, Höhlenmenschen, Speerwerfer und Triceratopse. Hinten liegen drei Dino-Eier, in acht Sekunden schlüpfen T-Rexe. Erst die Wachen oder gleich die Eier?',
      place: [
        ['unit', 'rex', .86, .3], ['unit', 'rex', .88, .5], ['unit', 'rex', .86, .7],
        ['rect', 'hoehle', 8, .66, .3, .7, .7],
      ],
      plan: { smart: [['speer', 19, ...B]], spam: [['trike', 8, ...F]] },
    },
    // Flugsaurier sind für Keulen zu hoch; Speere fliegen im Bogen bis zu ihnen
    {
      id: 'urzeit-3', n: 'Das Flugsauriernest', budget: 102, par: 78,
      units: ['speer', 'hoehle', 'raptor', 'schamane'], answer: ['hoehle', 'speer', 'raptor'],
      hint: 'Speerwerfer, Höhlenmenschen, Raptoren und Schamaninnen. Flugsaurier werfen Steine von oben, Höhlenmenschen werfen zurück. Masse oder Reichweite?',
      place: [
        ['tCircle', 'huegel', .82, .5, .16],
        ['rect', 'ptera', 7, .72, .25, .8, .75], ['rect', 'hoehle', 6, .66, .35, .7, .65],
      ],
      plan: { smart: [['hoehle', 24, ...F]], spam: [['schamane', 20, ...B]] },
    },
    // Gepanzerte Echsen: von vorn halber Schaden, aber Feuer und Steine von oben treffen sie
    {
      id: 'urzeit-4', n: 'Panzerechsen', budget: 110, par: 85,
      units: ['hoehle', 'speer', 'raptor', 'ptera'], answer: ['hoehle', 'raptor'],
      hint: 'Höhlenmenschen, Speerwerfer, Raptoren und Flugsaurier. Ankylosaurier und Triceratopse halten von vorn viel aus. Aber Feuer brennt auch unter dem Panzer.',
      place: [
        ['rect', 'anky', 3, .66, .3, .7, .7], ['rect', 'trike', 3, .76, .3, .8, .7], ['rect', 'speer', 6, .86, .35, .9, .65],
      ],
      plan: { smart: [['hoehle', 26, ...F]], spam: [['speer', 30, ...B]] },
    },
    // Der König der Echsen: zwei T-Rexe mit Gefolge
    {
      id: 'urzeit-5', n: 'Der König der Echsen', budget: 153, par: 118,
      cats: ['urzeit'], answer: ['raptor', 'speer', 'trike', 'anky', 'hoehle'],
      hint: 'Alle Urzeit-Einheiten. Zwei T-Rex-Eier, Raptoren als Wache und Schamaninnen, die heilen. Schnell zuschlagen oder lange durchhalten?',
      place: [
        ['tCircle', 'wald', .62, .15, .08], ['tCircle', 'wald', .62, .85, .08],
        ['unit', 'rex', .86, .35], ['unit', 'rex', .86, .65],
        ['rect', 'raptor', 10, .68, .25, .74, .75], ['rect', 'speer', 8, .8, .2, .84, .8], ['rect', 'schamane', 3, .9, .4, .92, .6],
      ],
      plan: { smart: [['raptor', 29, ...F]], spam: [['ptera', 23, ...B]] },
    },
  ],
};
