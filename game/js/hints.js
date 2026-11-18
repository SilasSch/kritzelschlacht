// Hinweis nach einer Niederlage (Audit 18.11.): Woran sind deine Einheiten gestorben, und was hilft dagegen? Rein: kein DOM.
// Die Konter kommen aus data.COUNTERS ([a, b, Punkte]: a schlägt b), nur Einheiten, die das Level erlaubt.
import { UNITS, COUNTERS, PLURAL } from './data.js';
import { unitAllowed } from './campaign/index.js';
import { tr, unitPlural } from './i18n.js';

const plural = t => unitPlural(t);
const list = a => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} ${tr('oder')} ${a[a.length - 1]}`);

// Wer schlägt type? Malbare, im Level erlaubte Einheiten, nach Punkten des Duells (größter Vorteil zuerst)
export function countersOf(type, level) {
  return COUNTERS.filter(([a, b]) => b === type && UNITS[a] && UNITS[a].paint !== false && unitAllowed(level, a))
    .map(([a]) => a).filter((a, i, all) => all.indexOf(a) === i);
}

// killers: Map Typ des Verursachers -> eigene Verluste (death-Ereignisse mit team 'blau'); level: das Level (oder null);
// timeUp: Zeit abgelaufen. Liefert { text, killer, counters } oder null, wenn es nichts zu sagen gibt.
export function defeatHint({ killers, level, timeUp = false }) {
  let killer = null, n = 0, total = 0;
  for (const [t, k] of killers) { total += k; if (UNITS[t] && k > n) { killer = t; n = k; } }
  if (timeUp) {
    return { killer, counters: [], text: tr('Die Zeit ist abgelaufen: Deine Armee hat nicht genug Schlagkraft. Male mehr Angreifer oder rücke näher heran.') };
  }
  if (!killer) return null;
  const counters = countersOf(killer, level).slice(0, 3);
  const share = total ? Math.round(n / total * 100) : 0;
  const head = tr(share >= 60 ? 'Die meisten deiner Einheiten fielen durch {k} ({n} von {t}).' : 'Viele deiner Einheiten fielen durch {k} ({n} von {t}).', { k: plural(killer), n, t: total });
  if (counters.length) return { killer, counters, text: `${head} ${tr('Dagegen helfen {c}.', { c: list(counters.map(plural)) })}` };
  return { killer, counters, text: `${head} ${tr('Versuch eine andere Aufstellung, zum Beispiel breiter verteilt oder weiter hinten.')}` };
}
