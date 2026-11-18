// Kapitel „Finale“ (Spez. #52). Noch leer: ohne Level zeigt die Kapitelübersicht „Bald verfügbar“.
// Felder eines Levels und Regeln: docs/kampagne.md. Prüfen: node tools/balance.mjs missions 8 1400x875 --chapter=finale
// Vorlage für ein Level (ids 'fin-1', 'fin-2', …; die id nie mehr ändern, an ihr hängen die Sterne):
//   {
//     id: 'fin-1', n: 'Name', budget: 100, par: 80,
//     units: ['ritter', 'schuetze', 'krieger'], cats: ['armee', 'gelaende'],
//     hint: 'Kurzer Hinweis zur Lösung.',
//     place: [['rect', 'krieger', 20, .66, .3, .72, .7]],
//     plan: { smart: [['ritter', 8, ...F]], spam: [['krieger', 40, ...F]] },
//   },
// Für die Pläne: import { F, B, Md, Deep } from './areas.js';

export default {
  id: 'finale',
  n: 'Finale',
  d: 'Alles, was du gelernt hast, in den schwersten Schlachten.',
  levels: [],
};
