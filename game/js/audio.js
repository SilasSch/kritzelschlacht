// Klänge per WebAudio, Port aus kritzelschlacht.html (sfx). init() muss nach einer Nutzergeste laufen.
export function createAudio() {
  let AC = null, noiseB = null;
  const lastS = {};
  let sCount = 0, sWin = 0;

  const audio = {
    muted: false,
    init() {
      if (!AC) {
        try {
          AC = new (window.AudioContext || window.webkitAudioContext)();
          const n = AC.sampleRate * .5;
          noiseB = AC.createBuffer(1, n, AC.sampleRate);
          const d = noiseB.getChannelData(0);
          for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        } catch (e) { AC = null; }
      }
      if (AC && AC.state === 'suspended') AC.resume().catch(() => {});
    },
    play(k) {
      if (audio.muted || !AC || AC.state !== 'running') return;
      const now = AC.currentTime;
      if (lastS[k] && now - lastS[k] < .06) return;
      lastS[k] = now;
      if (now - sWin > .1) { sWin = now; sCount = 0; }
      if (++sCount > 6) return;
      const g = AC.createGain(); g.connect(AC.destination);
      const tone = (type, f0, f1, dur, vol) => {
        const o = AC.createOscillator(); o.type = type;
        o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
        g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(.0001, now + dur);
        o.connect(g); o.start(now); o.stop(now + dur + .02);
      };
      const noise = (ft, fq, dur, vol) => {
        const s = AC.createBufferSource(); s.buffer = noiseB;
        const f = AC.createBiquadFilter(); f.type = ft; f.frequency.value = fq;
        s.connect(f); f.connect(g);
        g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(.0001, now + dur);
        s.start(now, Math.random() * .3); s.stop(now + dur + .02);
      };
      switch (k) {
        case 'pop': tone('sine', 420, 820, .08, .07); break;
        case 'clink': noise('bandpass', 3200, .05, .06); break;
        case 'hit': noise('bandpass', 1300, .06, .07); break;
        case 'thud': tone('sine', 140, 60, .15, .15); break;
        case 'twang': tone('triangle', 520, 240, .09, .05); break;
        case 'throw': tone('sine', 300, 600, .12, .04); break;
        case 'boom': noise('lowpass', 500, .45, .22); break;
        case 'fire': noise('bandpass', 700, .18, .05); break;
        case 'shot': noise('highpass', 2200, .05, .05); break;
        case 'cannon': noise('lowpass', 350, .4, .22); break;
        case 'whoosh': noise('bandpass', 900, .3, .06); break;
        case 'thump': tone('sine', 180, 70, .18, .12); break;
        case 'die': tone('sine', 380, 140, .12, .04); break;
        case 'win':
          [523, 659, 784, 1046].forEach((f, i) => {
            const o = AC.createOscillator(), gg = AC.createGain(); o.type = 'triangle'; o.frequency.value = f;
            gg.gain.setValueAtTime(.0001, now + i * .11);
            gg.gain.exponentialRampToValueAtTime(.09, now + i * .11 + .02);
            gg.gain.exponentialRampToValueAtTime(.0001, now + i * .11 + .3);
            o.connect(gg); gg.connect(AC.destination); o.start(now + i * .11); o.stop(now + i * .11 + .32);
          });
          break;
        case 'lose': tone('triangle', 330, 110, .6, .08); break;
      }
    },
  };
  return audio;
}
