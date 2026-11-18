// Tutorial (Audit 18.11.): eine Mini-Mission vor der Kampagne. Nicht in CHAPTERS, also ohne Sterne und Freischaltung;
// main.js lädt sie direkt als Level, ui/coach.js führt mit Sprechblasen durch die drei Schritte.
import { F } from './areas.js';

export default {
  id: 'tut-1', n: 'Erste Schritte', budget: 40, par: 30,
  units: ['krieger', 'ritter'],
  hint: 'Wähle Krieger, male sie links der gestrichelten Linie und drück Los!',
  place: [['rect', 'krieger', 8, .72, .4, .78, .6]],
  plan: { smart: [['krieger', 14, ...F]] },
};
