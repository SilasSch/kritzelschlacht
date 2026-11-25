// Kritzelschlacht-Trailer. Die Schnittliste SHOTS steuert alles: Reihenfolge, Länge, Text. Clips kommen aus
// public/clips/<name>.mp4 (aufgenommen mit capture.mjs). Texte immer auf Englisch (X, itch.io).
import { useEffect, useState } from 'react';
import {
  AbsoluteFill, OffthreadVideo, Sequence, continueRender, delayRender, interpolate, spring, staticFile,
  useCurrentFrame, useVideoConfig,
} from 'remotion';

export const FPS = 30;
export const INK = '#2a2a33', GO = '#ff7a3d', BLUE = '#4d82f0', RED = '#ef4b4b', PAPER = '#fbfaf4';

// type: 'title' | 'clip' | 'features' | 'end'. clip: Dateiname, from: Start im Clip (s), sec: Länge (s)
export const SHOTS = [
  { type: 'title', sec: 2.2 },
  { type: 'clip', clip: 'paint', from: 0.2, sec: 5.8, caption: 'Paint an army', step: '1' },
  { type: 'clip', clip: 'paint', from: 6.0, sec: 3.6, caption: 'Hit go', step: '2' },
  { type: 'clip', clip: 'romans', from: 1.4, sec: 2.6, caption: 'Watch them fight!', step: '3' },
  { type: 'clip', clip: 'dragons', from: 0.6, sec: 2, caption: 'Dragons vs knights' },
  { type: 'clip', clip: 'modern', from: 0.8, sec: 2, caption: 'Tanks in the rain' },
  { type: 'clip', clip: 'stoneage', from: 0.8, sec: 2, caption: 'Dinos vs robots' },
  { type: 'clip', clip: 'animals', from: 0.8, sec: 2, caption: 'Elephants vs gorillas' },
  { type: 'features', sec: 3.4, lines: ['Campaign & wave mode', 'Daily + weekly challenges', 'Online 1v1, 2v2, King of the Hill'] },
  { type: 'clip', clip: 'epic', from: 2.6, sec: 4, caption: 'Who wins?' },
  { type: 'end', sec: 3.6 },
];
const frames = s => Math.round(s.sec * FPS);
export const trailerFrames = SHOTS.reduce((n, s) => n + frames(s), 0);

// Schriften des Spiels (OFL) einmal laden, bevor das erste Bild gerendert wird
export const useFonts = () => {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    const faces = [
      new FontFace('Luckiest Guy', `url(${staticFile('fonts/luckiest-guy-latin-400-normal.woff2')})`),
      new FontFace('Nunito', `url(${staticFile('fonts/nunito-latin-800-normal.woff2')})`, { weight: '800' }),
    ];
    Promise.all(faces.map(f => f.load().then(() => document.fonts.add(f)))).then(() => continueRender(handle));
  }, [handle]);
};

export const LOGO = { fontFamily: "'Luckiest Guy', Impact, sans-serif", color: '#fff', WebkitTextStroke: `0.06em ${INK}`, paintOrder: 'stroke fill', textShadow: `0.05em 0.07em 0 ${INK}`, letterSpacing: '0.02em', lineHeight: 1 };
const pop = (frame, fps, delay = 0) => spring({ frame: frame - delay, fps, config: { damping: 11, stiffness: 170, mass: 0.7 } });

// Gekritzelte Unterstreichung, die sich selbst zeichnet
const Scribble = ({ width, color = GO, delay = 0, dur = 10 }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [delay, delay + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <svg width={width} height={width * 0.09} viewBox="0 0 400 36" style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}>
      <path d="M6 22 C 70 8, 140 30, 210 16 S 330 8, 394 20 M30 30 C 120 22, 260 34, 370 26" fill="none" stroke={color}
        strokeWidth="9" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - p} />
    </svg>
  );
};

const Logo = ({ size, delay = 0 }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig(), s = pop(f, fps, delay);
  return (
    <div style={{ ...LOGO, fontSize: size, transform: `rotate(-3deg) scale(${s})`, textAlign: 'center' }}>
      Kritzel<span style={{ color: GO }}>schlacht</span>
    </div>
  );
};

// Bildunterschrift: springt rein, kippt leicht, optional mit Schritt-Nummer im Kreis
const Caption = ({ text, step, size }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig(), s = pop(f, fps, 2);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.35, transform: `rotate(-2.5deg) scale(${s})` }}>
      {step && (
        <div style={{ ...LOGO, fontSize: size * 0.8, width: size * 1.25, height: size * 1.25, borderRadius: '50%', background: GO,
          border: `${size * 0.08}px solid ${INK}`, boxShadow: `${size * 0.05}px ${size * 0.07}px 0 ${INK}`, display: 'flex',
          alignItems: 'center', justifyContent: 'center', paddingTop: size * 0.12, boxSizing: 'border-box' }}>{step}</div>
      )}
      <div style={{ ...LOGO, fontSize: size }}>{text}</div>
    </div>
  );
};

const Paper = ({ children }) => (
  <AbsoluteFill style={{ background: PAPER, backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 46px, #dfe6f3 46px 48px)' }}>
    {children}
  </AbsoluteFill>
);

// Spielclip: quer bildfüllend, hoch als Band in der Mitte mit Text darüber
const ClipShot = ({ shot, vertical }) => {
  const f = useCurrentFrame(), { width, height } = useVideoConfig();
  const punch = interpolate(f, [0, 6], [1.06, 1], { extrapolateRight: 'clamp' });
  const flash = interpolate(f, [0, 4], [0.7, 0], { extrapolateRight: 'clamp' });
  const video = <OffthreadVideo src={staticFile(`clips/${shot.clip}.mp4`)} trimBefore={Math.round(shot.from * FPS)} muted
    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  if (!vertical) {
    return (
      <AbsoluteFill style={{ background: '#fff' }}>
        <AbsoluteFill style={{ transform: `scale(${punch})` }}>{video}</AbsoluteFill>
        <AbsoluteFill style={{ background: '#fff', opacity: flash }} />
        {shot.caption && <div style={{ position: 'absolute', left: 70, top: 56 }}><Caption text={shot.caption} step={shot.step} size={96} /></div>}
      </AbsoluteFill>
    );
  }
  const bandH = Math.round(width * 9 / 16 * 1.45), bandW = Math.round(bandH * 16 / 9);   // etwas breiter als das Bild, Ränder abgeschnitten
  return (
    <Paper>
      <div style={{ position: 'absolute', top: height * 0.5 - bandH / 2, left: (width - bandW) / 2, width: bandW, height: bandH,
        borderTop: `10px solid ${INK}`, borderBottom: `10px solid ${INK}`, overflow: 'hidden', background: '#fff', transform: `scale(${punch})` }}>
        {video}
        <AbsoluteFill style={{ background: '#fff', opacity: flash }} />
      </div>
      <div style={{ position: 'absolute', top: 150, width: '100%', display: 'flex', justifyContent: 'center' }}><Logo size={92} /></div>
      {shot.caption && <div style={{ position: 'absolute', top: height * 0.5 - bandH / 2 - 200, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <Caption text={shot.caption} step={shot.step} size={100} /></div>}
      <div style={{ position: 'absolute', top: height * 0.5 + bandH / 2 + 110, width: '100%', textAlign: 'center', fontFamily: 'Nunito',
        fontWeight: 800, fontSize: 50, color: INK }}>Paint armies. Watch them fight.</div>
    </Paper>
  );
};

const TitleShot = ({ vertical }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const sub = pop(f, fps, 14);
  return (
    <Paper>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 30 }}>
        <Logo size={vertical ? 108 : 180} />
        <Scribble width={vertical ? 760 : 1100} delay={8} />
        <div style={{ fontFamily: 'Nunito', fontWeight: 800, fontSize: vertical ? 58 : 64, color: INK, opacity: sub, transform: `translateY(${(1 - sub) * 30}px)` }}>
          Paint armies. Watch them fight.
        </div>
      </AbsoluteFill>
    </Paper>
  );
};

const FeaturesShot = ({ shot, vertical }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  return (
    <Paper>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: vertical ? 70 : 46, padding: 60 }}>
        {shot.lines.map((l, i) => {
          const s = pop(f, fps, 4 + i * 9);
          return (
            <div key={l} style={{ ...LOGO, fontSize: vertical ? 84 : 96, textAlign: 'center', color: i % 2 ? '#fff' : '#fff',
              transform: `rotate(${i % 2 ? 2 : -2}deg) scale(${s})` }}>
              <span style={{ color: [BLUE, GO, RED][i % 3] }}>✱</span> {l}
            </div>
          );
        })}
      </AbsoluteFill>
    </Paper>
  );
};

const EndShot = ({ vertical, cta, url }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const b = pop(f, fps, 12), wob = Math.sin(f / 5) * 1.5;
  return (
    <Paper>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: vertical ? 60 : 40 }}>
        <Logo size={vertical ? 108 : 200} />
        <div style={{ ...LOGO, fontSize: vertical ? 96 : 110, background: GO, padding: '0.28em 0.7em 0.12em', borderRadius: 999,
          border: `8px solid ${INK}`, boxShadow: `8px 10px 0 ${INK}`, transform: `rotate(${-2 + wob}deg) scale(${b})` }}>Play now</div>
        <div style={{ fontFamily: 'Nunito', fontWeight: 800, fontSize: vertical ? 50 : 56, color: INK, opacity: b, textAlign: 'center' }}>{cta}</div>
        {url && <div style={{ fontFamily: 'Nunito', fontWeight: 800, fontSize: vertical ? 46 : 52, color: GO, opacity: b }}>{url}</div>}
      </AbsoluteFill>
    </Paper>
  );
};

export const Trailer = ({ vertical, cta, url }) => {
  useFonts();
  let at = 0;
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      {SHOTS.map((s, i) => {
        const from = at, d = frames(s); at += d;
        const el = s.type === 'title' ? <TitleShot vertical={vertical} />
          : s.type === 'features' ? <FeaturesShot shot={s} vertical={vertical} />
          : s.type === 'end' ? <EndShot vertical={vertical} cta={cta} url={url} />
          : <ClipShot shot={s} vertical={vertical} />;
        return <Sequence key={i} from={from} durationInFrames={d}>{el}</Sequence>;
      })}
    </AbsoluteFill>
  );
};
