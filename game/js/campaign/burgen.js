// Kapitel „Burgen & Ritter“ (Spez. #52). Noch leer: ohne Level zeigt die Kapitelübersicht „Bald verfügbar“.
// Felder eines Levels und Regeln: docs/kampagne.md. Prüfen: node tools/balance.mjs missions 8 1400x875 --chapter=burgen
// Vorlage für ein Level (ids 'burg-1', 'burg-2', …; die id nie mehr ändern, an ihr hängen die Sterne):
//   {
//     id: 'burg-1', n: 'Name', budget: 100, par: 80,
//     units: ['ritter', 'schuetze', 'krieger'], cats: ['armee', 'gelaende'],
//     hint: 'Kurzer Hinweis zur Lösung.',
//     place: [['rect', 'krieger', 20, .66, .3, .72, .7]],
//     plan: { smart: [['ritter', 8, ...F]], spam: [['krieger', 40, ...F]] },
//   },
// Für die Pläne: import { F, B, Md, Deep } from './areas.js';

export default {
  id: 'burgen',
  n: 'Burgen & Ritter',
  d: 'Mauern stürmen, Tore halten: Ritter, Schützen und Belagerung.',
  levels: [],
};
