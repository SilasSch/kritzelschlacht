// Kritzelwörter (Ideenrunde 18.11.): handgeschriebene Comic-Wörter bei großen Momenten ("BUMM!", "ZACK!", ...).
// Rein Darstellung: liest die Ereignisse der Welt (consume), zeichnet in einen eigenen Layer (Weltkoordinaten).
// Je Wort: kurzes Aufploppen (Skala POP), dann Ausblenden über LIFE s, leichte Neigung. Gedrosselt: höchstens ein Wort
// je GAP s (Echtzeit) und höchstens N gleichzeitig; ein neues Wort nahe (NEAR px) einem lebenden ersetzt keins.
import { tr } from '../i18n.js';   // Sprache (18.11.): wordFor bleibt deutsch (Tests), übersetzt wird beim Zeichnen
export const WORDS = { N: 5, LIFE: .75, POP: .12, GAP: .3, NEAR: 60, RISE: 18 };
// Ereignis → [Wort, Farbe] oder null
export function wordFor(e) {
  switch (e.type) {
    case 'blast': return e.R >= 40 ? (e.kind === 'fire' ? ['FAUCH!', 0xff8a3d] : ['BUMM!', 0xffd84d]) : null;
    case 'charge': return ['ZACK!', 0xffd84d];
    case 'crash': return ['KRACH!', 0xffd84d];
    case 'ability':
      if (e.k === 'pike') return ['KLONG!', 0xd8e2ee];
      if (e.k === 'grab') return ['HAPP!', 0xffd84d];
      if (e.k === 'thrown') return ['PLUMPS!', 0xffd84d];
      if (e.k === 'stampede' || e.k === 'trample') return ['RUMMS!', 0xffd84d];
      return null;
    case 'spell': return e.k === 'meteor' ? ['WUMMS!', 0xff8a3d] : null;
    default: return null;
  }
}

export function createWords(PIXI, layer) {
  const style = { fontFamily: "'Luckiest Guy', Nunito, system-ui, sans-serif", fontSize: 26, fill: 0xffd84d, stroke: '#2a2a33', strokeThickness: 5, lineJoin: 'round' };
  const pool = [];
  for (let i = 0; i < WORDS.N; i++) {
    const t = new PIXI.Text('', style); t.anchor.set(.5); t.visible = false; t.resolution = 2;
    layer.addChild(t); pool.push({ t, age: 0, live: false, x: 0, y: 0, rot: 0 });
  }
  let last = -1e9, seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  function consume(events, now) {
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (now - last < WORDS.GAP) return;
      const w = wordFor(e);
      if (!w) continue;
      const x = e.x, y = e.y - (e.z || 0) - 20;
      if (pool.some(p => p.live && (p.x - x) ** 2 + (p.y - y) ** 2 < WORDS.NEAR ** 2)) continue;
      const p = pool.find(q => !q.live) || pool.reduce((a, b) => (b.age > a.age ? b : a));
      p.live = true; p.age = 0; p.x = x; p.y = y; p.rot = (rnd() - .5) * .5;
      p.t.text = tr(w[0]); p.t.style.fill = w[1]; p.t.visible = true;
      last = now;
    }
  }
  function update(dt) {
    for (const p of pool) {
      if (!p.live) continue;
      p.age += dt;
      if (p.age >= WORDS.LIFE) { p.live = false; p.t.visible = false; continue; }
      const k = p.age / WORDS.LIFE, s = p.age < WORDS.POP ? .4 + .8 * (p.age / WORDS.POP) : 1.2 - .2 * Math.min(1, (p.age - WORDS.POP) / .1);
      p.t.scale.set(s); p.t.rotation = p.rot; p.t.alpha = k < .6 ? 1 : 1 - (k - .6) / .4;
      p.t.position.set(p.x, p.y - WORDS.RISE * k);
    }
  }
  function clear() { for (const p of pool) { p.live = false; p.t.visible = false; } }
  return { consume, update, clear };
}
