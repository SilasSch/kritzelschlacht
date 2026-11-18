// Klänge per WebAudio, vollständig synthetisiert (keine Audiodateien, läuft so auch im Claude-Artifact).
// init() muss nach einer Nutzergeste laufen. Nichts hier wirkt auf die Simulation zurück: Zufall für die
// Klangvariation kommt aus Math.random, nie aus world.rng.
//
// Ablauf je Bild: main.js reicht world.events an onEvents(). resolveSound() macht aus einem Ereignis eine Stimme
// (oder null) und nutzt dabei das letzte Ereignis mit Position davor als Zusammenhang: das sound-Ereignis 'die'
// nach einem death-Ereignis klingt je nach Einheit (Mensch, Tier, Fahrzeug, Geist, Biene), 'shot' nach einem
// Blitz-Zauber wird zum Donner usw. Die Position (Welt-x/y) ergibt Stereo und Abstand zur Kamera.
//
// Mix: Stimme -> Panner -> Bus (sfx | ui) -> Mischpult -> Kompressor -> Lautstärke -> Ausgang, dazu ein Hall-Bus
// (synthetische Impulsantwort). Viele gleiche Töne kurz nacheinander werden leiser statt hart abgeschnitten.
import { UNITS } from './data.js';

// Geräusch zu einem Ereignis aus world.events (oder null). Physik: land (Landung), impact (harte Landung ab
// IMPACT_SOUND_V px/s Aufprall), splash (Wasser), crash (abgestürzter Flieger). Eine in Lava versinkende Leiche
// (terrain-Ereignis kind 'ash', Spez. #17) zischt (sizzle).
// Schildblock der Römer (block-Ereignis, Spez. #25): kein eigener Ton hier. combat.shieldHit schickt dazu das
// sound-Ereignis 'clink'; ein zweiter Ton über block würde nur doppelt zählen. Ebenso blast, death und Treffer im
// Nahkampf: deren Ton kommt als sound-Ereignis direkt danach.
export const IMPACT_SOUND_V = 320;
const ARROWISH = new Set(['arrow', 'firearrow', 'pilum']);
export function eventSound(e) {
  switch (e.type) {
    case 'sound': return e.k;
    case 'land': return e.impact > IMPACT_SOUND_V ? 'impact' : 'land';
    case 'splash': return 'splash';
    case 'crash': return 'crash';
    case 'terrain': return e.kind === 'ash' ? 'sizzle' : null;
    case 'hit': return ARROWISH.has(e.kind) ? 'thunk' : null;          // Pfeil/Pilum steckt im Ziel
    case 'miss': return ARROWISH.has(e.kind) ? 'thwip' : null;         // ... oder im Boden
    case 'ignite': return 'ignite';
    case 'burn': return 'crackle';
    case 'extinguish': return 'hiss';
    case 'heal': return 'heal';
    case 'charge': return e.horn ? 'horn' : null;
    case 'spell': return e.k === 'fizzle' ? 'fizzle' : null;
    case 'vamp': return e.k === 'rise' ? 'rise' : null;
  }
  return null;
}

// Tod je Einheit: Fahrzeuge scheppern, Bienen fiepen, der Geist verhallt, Tiere und Ungeheuer brüllen (Tonhöhe nach
// Größe), alle anderen sind Menschen ("uff").
const METAL = new Set(['panzer', 'heli']);
const SPIRIT = new Set(['geist']);
const BEAST = new Set(['drache', 'troll', 'zyklop', 'phoenix', 'einhorn', 'frosch']);
export function deathVoice(type) {
  const T = UNITS[type];
  if (!T) return 'die';
  if (METAL.has(type)) return 'dieMetal';
  if (type === 'biene') return 'dieBug';
  if (SPIRIT.has(type)) return 'dieSpirit';
  if (T.cat === 'tiere' || BEAST.has(type)) return 'dieBeast';
  return 'die';
}
// Ton eines sound-Ereignisses im Zusammenhang des vorigen Ereignisses (Zauber, Schuss) schärfen
const SPELL_VOICE = { 'bolt:shot': 'zap', 'meteor:impact': 'meteor', 'wind:whoosh': 'wind', 'wall:thud': 'wall' };
const SHOT_VOICE = { 'rocket:whoosh': 'rocket', 'hex:whoosh': 'hex', 'breath:fire': 'breath', 'shell:cannon': 'cannon' };

// Ereignis e (+ voriges Ereignis mit Position prev) -> { k, size, x, y } oder null. x/y null: ohne Ort (mittig).
export function resolveSound(e, prev) {
  let k = eventSound(e);
  if (!k) return null;
  let size = 0;
  if (e.type === 'sound' && prev) {
    if (k === 'die' && prev.type === 'death') { k = deathVoice(prev.unitType); size = UNITS[prev.unitType] ? UNITS[prev.unitType].r : 9; }
    else if (prev.type === 'spell') k = SPELL_VOICE[prev.k + ':' + k] || k;
    else if (prev.type === 'shot') k = SHOT_VOICE[prev.kind + ':' + k] || k;
    else if (prev.type === 'blast') size = prev.R || 0;
  }
  const at = posOf(e) ? e : prev;
  const p = at && posOf(at);
  return { k, size, x: p ? p.x : null, y: p ? p.y : null };
}
const posOf = e => (e.x != null ? { x: e.x, y: e.y } : e.x1 != null ? { x: e.x1, y: e.y1 } : null);

// Stereo und Dämpfung aus der Bildschirmlage: pan -0,8..0,8 über die Breite, außerhalb des Bilds je 400 px Abstand
// leiser (bis 0,15). Nah herangezoomt etwas lauter, weit herausgezoomt etwas leiser.
export function spatial(cam, x, y) {
  if (!cam || x == null) return { pan: 0, gain: 1 };
  const sx = (x - cam.x) * cam.zoom, sy = (y - cam.y) * cam.zoom;
  const w = cam.viewW || 1, h = cam.viewH || 1;
  const pan = Math.max(-1, Math.min(1, (sx / w) * 2 - 1)) * .8;
  const ox = sx < 0 ? -sx : sx > w ? sx - w : 0, oy = sy < 0 ? -sy : sy > h ? sy - h : 0;
  const off = Math.hypot(ox, oy);
  const z = cam.fit ? Math.max(.8, Math.min(1.1, Math.sqrt(cam.zoom / cam.fit))) : 1;
  return { pan, gain: Math.max(.15, 1 / (1 + off / 250)) * z };
}

// Mindestabstand (s) zwischen zwei gleichen Tönen; Vorgabe GAP
const GAP = .03;
const MIN_GAP = { pop: .07, scribble: .11, crackle: .25, heal: .3, hit: .055, clink: .07, die: .06, dieBeast: .08, dieBug: .12,
  shot: .05, thunk: .06, thwip: .09, land: .08, splash: .12, sizzle: .2, hiss: .2, horn: .8, ui: .05, rise: .4, ignite: .2,
  twang: .05, fire: .12 };
// Häufige Töne (Massenkampf) leiser als seltene, damit Explosionen, Zauber und Tode einzelner Großer herausstechen
const BUSY = { hit: .55, clink: .5, shot: .6, thunk: .55, thwip: .5, die: .7, dieBug: .5, land: .6, crackle: .5, ignite: .5,
  twang: .7, heal: .6, fire: .7, pop: .6, scribble: .55 };
const MAX_VOICES = 24;
export const DEFAULT_VOLUME = .6;
// Pentatonik für das Plopp beim Malen von Einheiten: steigt, solange schnell nacheinander gesetzt wird
const POP_SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export function createAudio() {
  let AC = null, noiseB = null, mix, comp, master, sfxBus, uiBus, wetIn, hasPan = false;
  const lastT = {}, recent = {};
  let ends = [], popStep = 0, popT = -9, cam = null, rate = 1;

  const audio = {
    muted: false,
    volume: DEFAULT_VOLUME,
    init() {
      if (!AC) {
        try {
          AC = new (window.AudioContext || window.webkitAudioContext)();
          build();
        } catch (e) { AC = null; }
      }
      if (AC && AC.state === 'suspended') AC.resume().catch(() => {});
    },
    setVolume(v) {
      audio.volume = Math.max(0, Math.min(1, v));
      if (master) master.gain.setTargetAtTime(audio.volume * audio.volume, AC.currentTime, .03);
    },
    // Kamera für Stereo/Abstand und Zeitlupe (tiefer, langsamer); jedes Bild vor den Ereignissen
    setView(c, slow) { cam = c; rate = slow ? .72 : 1; },
    onEvents(ev, c, slow) {
      audio.setView(c, slow);
      if (audio.muted || !AC || AC.state !== 'running') return;
      let prev = null;
      for (let i = 0; i < ev.length; i++) {
        const e = ev[i];
        const r = resolveSound(e, prev);
        if (r) audio.play(r.k, r);
        if (e.type !== 'sound' && posOf(e)) prev = e;
      }
    },
    // Klicks auf Knöpfe (Delegation): Reiter klingen anders als normale Knöpfe, Regler und der Ton-Knopf selbst still
    bindUI(root) {
      root.addEventListener('click', ev => {
        const b = ev.target.closest && ev.target.closest('button');
        if (!b || b.disabled || b.id === 'bMute') return;
        audio.init();
        audio.play(b.getAttribute('role') === 'tab' || b.closest('.tabs, .seg') ? 'tab' : 'ui');
      });
    },
    // k: Stimme; o: { x, y, size, kind } (alles optional)
    play(k, o) {
      if (audio.muted || !AC || AC.state !== 'running') return;
      const R = RECIPES[k];
      if (!R) return;
      const now = AC.currentTime;
      if (lastT[k] && now - lastT[k] < (MIN_GAP[k] || GAP) / rate) return;
      lastT[k] = now;
      ends = ends.filter(t => t > now);
      const prio = k === 'win' || k === 'lose' || k === 'go';
      if (!prio && ends.length >= MAX_VOICES) return;
      // Dichte: der n-te gleiche Ton binnen 0,4 s ist 1/(1 + 0,6·(n−1)) so laut, häufige Töne (BUSY) grundsätzlich leiser
      const rc = recent[k] || (recent[k] = []);
      while (rc.length && now - rc[0] > .4) rc.shift();
      rc.push(now);
      const dens = (BUSY[k] || 1) / (1 + .6 * (rc.length - 1));
      const ui = k === 'ui' || k === 'tab' || k === 'go' || k === 'pop' || k === 'scribble' || k === 'win' || k === 'lose';
      const sp = ui ? { pan: 0, gain: 1 } : spatial(cam, o && o.x, o && o.y);
      if (k === 'pop') { popStep = now - popT < .4 ? Math.min(popStep + 1, POP_SCALE.length - 1) : 0; popT = now; }
      const v = voice(ui ? uiBus : sfxBus, sp.pan, sp.gain * dens, now + (ui ? 0 : Math.random() * .012));
      R(v, o || {});
      ends.push(now + v.len + .05);
    },
  };

  /* ---------- Aufbau ---------- */
  function build() {
    const sr = AC.sampleRate, n = sr * 2;
    noiseB = AC.createBuffer(1, n, sr);
    const d = noiseB.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    master = AC.createGain(); master.gain.value = audio.volume * audio.volume;
    comp = AC.createDynamicsCompressor();
    comp.threshold.value = -24; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = .003; comp.release.value = .22;
    mix = AC.createGain(); mix.gain.value = 1.5;
    // Höhen dämpfen (weniger spitz), Tiefstes unter 40 Hz weg (dröhnt nur auf großen Boxen)
    const shelf = AC.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 3200; shelf.gain.value = -8;
    const hp = AC.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 40;
    mix.connect(shelf); shelf.connect(hp); hp.connect(comp); comp.connect(master); master.connect(AC.destination);
    sfxBus = AC.createGain(); sfxBus.gain.value = 1; sfxBus.connect(mix);
    uiBus = AC.createGain(); uiBus.gain.value = .45; uiBus.connect(mix);
    // Hall: abklingendes Rauschen als Impulsantwort (1,6 s), zweikanalig leicht verschieden
    const ir = AC.createBuffer(2, sr * 1.6 | 0, sr);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 3.2);
    }
    const conv = AC.createConvolver(); conv.buffer = ir;
    const wetG = AC.createGain(); wetG.gain.value = .32;
    const wetLp = AC.createBiquadFilter(); wetLp.type = 'lowpass'; wetLp.frequency.value = 3500;
    wetIn = AC.createGain();
    wetIn.connect(conv); conv.connect(wetLp); wetLp.connect(wetG); wetG.connect(mix);
    hasPan = typeof AC.createStereoPanner === 'function';
  }

  /* ---------- Bausteine ---------- */
  // Eine Stimme: eigener Ausgang (Pegel g) -> Panner -> Bus; v.wet(a) schickt a davon in den Hall.
  function voice(bus, pan, g, t0) {
    const out = AC.createGain(); out.gain.value = g;
    if (hasPan && pan) { const p = AC.createStereoPanner(); p.pan.value = pan; out.connect(p); p.connect(bus); }
    else out.connect(bus);
    const v = {
      out, t0, len: 0,
      // Tonhöhe: Grundwert × Zeitlupe × Zufall ±amt
      f: (hz, amt = .06) => hz * rate * (1 + (Math.random() * 2 - 1) * amt),
      d: s => s / rate,
      wet(a) { const s = AC.createGain(); s.gain.value = a; out.connect(s); s.connect(wetIn); },
    };
    return v;
  }
  // Hüllkurve: Anstieg a, Abfall auf 0 bis t + dur
  function env(g, t, a, dur, vol) {
    a = Math.max(a, .006);   // kein harter Klick am Anfang
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(.0001, t + Math.max(a + .005, dur));
  }
  // Oszillator f0 -> f1 über dur, Start nach dt
  function osc(v, type, f0, f1, dur, vol, o = {}) {
    const t = v.t0 + (o.dt || 0), D = v.d(dur);
    const os = AC.createOscillator(), g = AC.createGain();
    os.type = type;
    os.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 !== f0) os.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + D * (o.bend || 1));
    if (o.vib) { // Vibrato: LFO auf die Frequenz
      const l = AC.createOscillator(), lg = AC.createGain();
      l.frequency.value = o.vib[0] * rate; lg.gain.value = o.vib[1]; l.connect(lg); lg.connect(os.frequency);
      l.start(t); l.stop(t + D + .05);
    }
    let node = os;
    if (o.lp) { const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q || .7; os.connect(f); node = f; }
    if (o.bp) { const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = o.bp; f.Q.value = o.q || 3; os.connect(f); node = f; }
    node.connect(g); g.connect(v.out);
    env(g, t, o.a || .003, D, vol);
    os.start(t); os.stop(t + D + .05);
    v.len = Math.max(v.len, (o.dt || 0) + D);
  }
  // Gefiltertes Rauschen; Filter fährt von f0 nach f1
  function noise(v, type, f0, f1, dur, vol, o = {}) {
    const t = v.t0 + (o.dt || 0), D = v.d(dur);
    const s = AC.createBufferSource(); s.buffer = noiseB; s.playbackRate.value = rate;
    const f = AC.createBiquadFilter(), g = AC.createGain();
    f.type = type; f.Q.value = o.q || (type === 'bandpass' ? 1.4 : .7);
    f.frequency.setValueAtTime(f0 * rate, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1 * rate), t + D);
    s.connect(f); f.connect(g); g.connect(v.out);
    env(g, t, o.a || .002, D, vol);
    s.start(t, Math.random() * 1.4); s.stop(t + D + .05);
    v.len = Math.max(v.len, (o.dt || 0) + D);
  }
  // Metall: unharmonische Teiltöne (Glocke/Klinge)
  function metal(v, base, dur, vol, parts = [1, 2.76, 5.4, 8.93]) {
    parts.forEach((p, i) => osc(v, 'sine', base * p, base * p * .998, dur / (1 + i * .6), vol / (1 + i * .8)));
  }
  // Knistern: n kurze Klicks zufällig über span s verteilt
  function crackle(v, n, span, vol) {
    for (let i = 0; i < n; i++) noise(v, 'highpass', 2500 + Math.random() * 3000, 2000, .012 + Math.random() * .02, vol * (.4 + Math.random() * .6), { dt: Math.random() * span });
  }
  // Explosion nach Größe s (1 = Granate)
  function explosion(v, s, vol) {
    const L = Math.min(1.6, .5 + s * .35);
    osc(v, 'sine', v.f(75 / Math.sqrt(s), .15), 28, L * .8, vol * .9, { a: .004 });
    noise(v, 'lowpass', 1800, 140, L, vol, { a: .003, q: .9 });
    noise(v, 'highpass', 1800, 1200, .06, vol * .3);
    crackle(v, 4 + s * 3 | 0, L * .7, vol * .12);
    v.wet(.45);
  }
  const notes = (v, type, seq, vol, o = {}) => seq.forEach(([hz, dt, dur, vv]) => osc(v, type, hz * rate, hz * rate * (o.glide || 1), dur, vol * (vv || 1), { ...o, dt: v.d(dt) }));

  /* ---------- Rezepte ---------- */
  const SCRIB = {
    wasser: v => { noise(v, 'bandpass', v.f(700, .2), 1300, .1, .08); osc(v, 'sine', v.f(380, .25), 760, .06, .056, { dt: .02 }); },
    lava: v => { noise(v, 'lowpass', 500, 250, .12, .096); osc(v, 'sine', v.f(140, .3), 260, .07, .096, { dt: .03 }); },
    wald: v => { noise(v, 'highpass', v.f(3500, .2), 3000, .05, .08); noise(v, 'highpass', 4500, 4000, .04, .056, { dt: .04 }); },
    mauer: v => { osc(v, 'sine', v.f(95, .15), 60, .07, .16); noise(v, 'bandpass', v.f(700, .2), 500, .06, .096); },
    radierer: v => { osc(v, 'triangle', v.f(950, .15), 760, .06, .032); noise(v, 'bandpass', v.f(2400, .2), 2000, .05, .056); },
  };
  const RECIPES = {
    /* Malen und Oberfläche */
    pop(v) {
      const f = 392 * Math.pow(2, POP_SCALE[popStep] / 12) * rate;
      osc(v, 'sine', f * .8, f, .09, .13, { bend: .3 });
      osc(v, 'triangle', f * 2, f * 2, .05, .03);
    },
    scribble(v, o) { (SCRIB[o.kind] || SCRIB.radierer)(v); },
    ui(v) { osc(v, 'sine', v.f(1200, .05), 900, .035, .04); },
    tab(v) { osc(v, 'sine', v.f(660, .02), 660, .05, .045); osc(v, 'sine', v.f(990, .02), 990, .07, .04, { dt: .045 }); },
    go(v) { // Kampfbeginn: kurzer Trommelwirbel und Signal
      for (let i = 0; i < 4; i++) noise(v, 'bandpass', 900, 600, .05, .05 + i * .015, { dt: i * .05 });
      notes(v, 'square', [[392, .2, .12], [392, .33, .1], [523, .45, .35, 1.3]], .028, { lp: 1800 });
      osc(v, 'sine', 70, 40, .35, .14, { dt: .45 });
      v.wet(.3);
    },
    win(v) {
      notes(v, 'triangle', [[523, 0, .16], [659, .12, .16], [784, .24, .16], [1046, .36, .7, 1.2]], .08);
      notes(v, 'square', [[523, .36, .7], [659, .36, .7], [784, .36, .7]], .018, { lp: 2200 });
      osc(v, 'sine', 130, 130, .9, .08, { dt: .36 });
      for (let i = 0; i < 6; i++) osc(v, 'sine', v.f(2093 + i * 330, .05), 2600, .12, .02, { dt: .5 + i * .07 });
      v.wet(.5);
    },
    lose(v) { // traurige Posaune: vier fallende Töne, der letzte mit Vibrato
      notes(v, 'sawtooth', [[196, 0, .3], [185, .32, .3], [175, .64, .3]], .06, { lp: 900, a: .03 });
      osc(v, 'sawtooth', 165 * rate, 160 * rate, 1.0, .065, { dt: v.d(.96), lp: 900, a: .03, vib: [5.5, 6] });
      v.wet(.35);
    },

    /* Nahkampf */
    hit(v) { // Hieb: Klatsch + dumpfer Körper
      noise(v, 'bandpass', v.f(1300, .25), 700, .07, .09, { q: 1.2 });
      osc(v, 'sine', v.f(170, .2), 70, .09, .1);
    },
    clink(v) { // Klinge auf Schild/Rüstung
      noise(v, 'highpass', 3500, 3500, .02, .035);
      metal(v, v.f(1250, .12), .22, .05);
      osc(v, 'sine', v.f(220, .2), 90, .05, .05);
      v.wet(.2);
    },
    thud(v) { osc(v, 'sine', v.f(120, .15), 45, .2, .16); noise(v, 'lowpass', 400, 150, .12, .09); },
    impact(v) { osc(v, 'sine', v.f(105, .12), 32, .28, .2); noise(v, 'lowpass', 700, 120, .2, .12); crackle(v, 3, .12, .03); },
    land(v) { osc(v, 'sine', v.f(150, .2), 80, .08, .06); noise(v, 'lowpass', 500, 200, .05, .04); },
    horn(v) { // Reiter-Angriff: zweitöniges Horn
      notes(v, 'sawtooth', [[233, 0, .25], [349, .22, .55, 1.15]], .032, { lp: 1100, a: .04, glide: 1.003 });
      v.wet(.4);
    },

    /* Fernkampf */
    twang(v) { // Bogensehne + Schwirren
      osc(v, 'triangle', v.f(300, .1), 270, .12, .07, { bend: .2 });
      noise(v, 'bandpass', 2600, 2600, .025, .04, { q: 2 });
      noise(v, 'bandpass', 3200, 1200, .16, .018, { dt: .03, q: 2 });
    },
    thunk(v) { noise(v, 'bandpass', v.f(1900, .2), 1200, .025, .05, { q: 2 }); osc(v, 'sine', v.f(260, .15), 140, .05, .045); },
    thwip(v) { noise(v, 'bandpass', v.f(1500, .2), 800, .05, .09, { q: 1.2 }); },
    throw(v) { noise(v, 'bandpass', v.f(450, .15), 1500, .2, .085, { a: .06, q: 1.4 }); },
    thump(v) { osc(v, 'sine', v.f(90, .1), 40, .25, .16); noise(v, 'lowpass', 300, 100, .2, .1); noise(v, 'highpass', 2000, 1500, .03, .04); v.wet(.25); },
    shot(v) { // Gewehr: Knall, Körper, kurzer Nachklang
      noise(v, 'highpass', v.f(1400, .2), 900, .035, .06);
      noise(v, 'bandpass', v.f(2600, .2), 1400, .07, .06, { q: 1 });
      osc(v, 'sine', v.f(190, .15), 60, .05, .07);
      v.wet(.15);
    },
    cannon(v) {
      noise(v, 'highpass', 2000, 1000, .05, .07);
      osc(v, 'sine', v.f(70, .1), 28, .55, .3, { a: .004 });
      noise(v, 'lowpass', 1100, 160, .65, .26, { a: .003 });
      v.wet(.4);
    },
    rocket(v) {
      noise(v, 'bandpass', v.f(2600, .15), 1100, .5, .07, { a: .02, q: 1 });
      noise(v, 'lowpass', 400, 200, .45, .08);
    },
    hex(v) { osc(v, 'sine', v.f(520, .1), 880, .3, .04, { vib: [11, 25] }); noise(v, 'bandpass', 900, 1600, .25, .025); v.wet(.4); },

    /* Explosionen, Feuer, Elemente */
    boom(v, o) { explosion(v, Math.max(.7, (o.size || 40) / 40), .3); },
    fire(v) { noise(v, 'bandpass', v.f(650, .2), 900, .3, .07, { a: .03, q: .9 }); crackle(v, 5, .3, .035); },
    breath(v) { noise(v, 'lowpass', 900, 500, .5, .1, { a: .05 }); osc(v, 'sawtooth', v.f(70, .1), 55, .5, .03, { lp: 300, a: .05 }); crackle(v, 6, .45, .035); },
    ignite(v) { noise(v, 'lowpass', 200, 1600, .3, .09, { a: .06 }); osc(v, 'sine', 90, 180, .25, .05, { a: .05 }); },
    crackle(v) { crackle(v, 2, .08, .025); },
    hiss(v) { noise(v, 'highpass', 2200, 3500, .35, .045, { a: .02 }); },
    sizzle(v) { noise(v, 'highpass', 3000, 4500, .45, .025, { a: .04 }); crackle(v, 5, .4, .015); osc(v, 'sine', v.f(150, .3), 260, .08, .03, { dt: .1 }); },
    splash(v) {
      noise(v, 'bandpass', v.f(1100, .2), 2600, .12, .08, { q: .8 });
      noise(v, 'highpass', 3000, 2000, .3, .03, { dt: .04 });
      for (let i = 0; i < 3; i++) osc(v, 'sine', v.f(420 + i * 160, .3), 900, .05, .03, { dt: .08 + i * .06 });
    },
    whoosh(v) { noise(v, 'bandpass', v.f(400, .15), 1500, .32, .07, { a: .1, q: 1.5 }); },
    wind(v) { noise(v, 'bandpass', 300, 900, .8, .08, { a: .25, q: 1.2 }); noise(v, 'bandpass', 900, 400, .7, .05, { a: .3, dt: .1, q: 2 }); },
    crash(v) { explosion(v, 1.4, .3); metal(v, v.f(380, .1), .5, .04); },

    /* Zauber */
    zap(v) { // Blitz: Knall, elektrisches Sirren, Donner
      noise(v, 'highpass', 2500, 1800, .06, .1);
      osc(v, 'square', v.f(140, .2), 70, .16, .035, { lp: 2500, vib: [60, 80] });
      noise(v, 'lowpass', 500, 80, 1.1, .13, { dt: .06, a: .08 });
      v.wet(.5);
    },
    meteor(v) { explosion(v, 3, .34); noise(v, 'lowpass', 300, 60, 1.6, .12, { a: .2 }); },
    wall(v) { osc(v, 'sine', v.f(80, .1), 40, .3, .16); noise(v, 'bandpass', 600, 250, .45, .08, { a: .05 }); crackle(v, 5, .3, .03); },
    fizzle(v) { osc(v, 'sine', v.f(700, .1), 180, .18, .03); noise(v, 'highpass', 3000, 3000, .08, .02); },
    heal(v) { osc(v, 'sine', v.f(880, .03), 880, .3, .025, { a: .02 }); osc(v, 'sine', v.f(1320, .03), 1320, .35, .018, { dt: .06, a: .02 }); v.wet(.5); },
    rise(v) { osc(v, 'sine', v.f(95, .1), 70, .7, .035, { a: .2, vib: [4, 5] }); noise(v, 'lowpass', 500, 200, .6, .04, { a: .2 }); v.wet(.6); },

    /* Tode */
    die(v, o) { // "Uff": Sägezahn durch zwei Formanten, kleinere Einheiten etwas höher
      const f = v.f(210 * 9 / Math.max(6, o.size || 9), .18);
      osc(v, 'sawtooth', f, f * .6, .17, .22, { bp: v.f(750, .1), q: 4, a: .01 });
      osc(v, 'sawtooth', f, f * .6, .17, .11, { bp: v.f(1150, .1), q: 5, a: .01 });
      noise(v, 'lowpass', 400, 200, .07, .05, { dt: .05 });
    },
    dieBeast(v, o) { // Jaulen (klein) bis Brüllen (groß)
      const s = Math.max(6, o.size || 12), f = v.f(520 * 8 / s, .15);
      osc(v, 'sawtooth', f * 1.15, f * .55, .28 + s * .012, .045, { lp: 1600, a: .015, vib: [7, f * .03] });
      if (s > 13) noise(v, 'lowpass', 400, 150, .3, .06);
    },
    dieBug(v) { osc(v, 'sine', v.f(1400, .2), 500, .07, .02); },
    dieSpirit(v) { osc(v, 'sine', v.f(820, .1), 220, .6, .04, { vib: [6, 20], a: .03 }); v.wet(.7); },
    dieMetal(v) { explosion(v, 1.3, .26); metal(v, v.f(300, .15), .6, .045); crackle(v, 8, .5, .04); },
  };

  return audio;
}
