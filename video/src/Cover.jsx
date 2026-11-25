// Standbilder für itch.io: Cover (630x500, hier doppelt: 1260x1000) und Seitenbanner (960 breit, hier 1920x600).
// Hintergründe sind echte Spielszenen aus public/stills (node capture.mjs cover-dragons ...).
// Rendern: npm run covers (alle Varianten als PNG nach out/).
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { INK, GO, BLUE, RED, PAPER, LOGO, useFonts } from './Trailer.jsx';

const Logo = ({ size, rotate = -3, stacked = false }) => (
  <div style={{ ...LOGO, fontSize: size, transform: `rotate(${rotate}deg)`, textAlign: 'center', lineHeight: 0.92 }}>
    Kritzel{stacked && <br />}<span style={{ color: GO }}>schlacht</span>
  </div>
);

const Scene = ({ src, pos = '50% 50%', zoom = 1 }) => (
  <Img src={staticFile(`stills/${src}.png`)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
    objectFit: 'cover', objectPosition: pos, transform: `scale(${zoom})` }} />
);

// Gekritzelter Papierstreifen mit welligem Rand hinter dem Titel
const PaperBand = ({ top, height, tilt = -2 }) => (
  <div style={{ position: 'absolute', left: '-5%', right: '-5%', top, height, background: PAPER, transform: `rotate(${tilt}deg)`,
    borderTop: `8px solid ${INK}`, borderBottom: `8px solid ${INK}`, boxShadow: `0 12px 0 rgba(42,42,51,.18)`,
    backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 38px, #dfe6f3 38px 40px)' }} />
);

const Tag = ({ children, size, color = INK, bg = '#fff' }) => (
  <div style={{ fontFamily: 'Nunito', fontWeight: 800, fontSize: size, color, background: bg, padding: '0.2em 0.7em',
    borderRadius: 999, border: `5px solid ${INK}`, boxShadow: `5px 6px 0 ${INK}`, transform: 'rotate(-1.5deg)', whiteSpace: 'nowrap' }}>
    {children}
  </div>
);

// 1: Drachen gegen Ritter, Titel auf Papierstreifen oben
export const CoverDragons = () => {
  useFonts();
  return (
    <AbsoluteFill style={{ background: '#fff', overflow: 'hidden' }}>
      <Scene src="cover-dragons" pos="40% 60%" zoom={1.05} />
      <PaperBand top={30} height={360} />
      <div style={{ position: 'absolute', top: 75, width: '100%', display: 'flex', justifyContent: 'center' }}><Logo size={205} stacked /></div>
      <div style={{ position: 'absolute', bottom: 46, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <Tag size={52}>Paint armies. Watch them fight.</Tag>
      </div>
    </AbsoluteFill>
  );
};

// 2: Panzer und Hubschrauber, Titel mittig über dem Kampf, "VS"-Gefühl über blaue und rote Ecke
export const CoverModern = () => {
  useFonts();
  return (
    <AbsoluteFill style={{ background: '#fff', overflow: 'hidden' }}>
      <Scene src="cover-modern" pos="50% 50%" zoom={1.1} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 70% 38% at 50% 50%, rgba(255,255,255,.92) 40%, rgba(255,255,255,0) 100%)' }} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}><Logo size={250} stacked /></AbsoluteFill>
      <div style={{ position: 'absolute', left: 40, top: 40 }}><Tag size={48} color="#fff" bg={BLUE}>Paint</Tag></div>
      <div style={{ position: 'absolute', right: 40, bottom: 44 }}><Tag size={48} color="#fff" bg={RED}>Fight!</Tag></div>
    </AbsoluteFill>
  );
};

// 3: Papier mit Kritzel-Rahmen, Schlachtbild als schräg aufgeklebtes Foto
export const CoverPaper = () => {
  useFonts();
  return (
    <AbsoluteFill style={{ background: PAPER, overflow: 'hidden',
      backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 38px, #dfe6f3 38px 40px)' }}>
      <div style={{ position: 'absolute', left: 90, right: 90, top: 330, height: 560, transform: 'rotate(2deg)', background: '#fff',
        border: `8px solid ${INK}`, boxShadow: `14px 16px 0 ${INK}`, overflow: 'hidden' }}>
        <Scene src="cover-epic" pos="45% 50%" zoom={1.25} />
      </div>
      <div style={{ position: 'absolute', top: 60, width: '100%', display: 'flex', justifyContent: 'center' }}><Logo size={128} /></div>
      <div style={{ position: 'absolute', top: 232, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'Nunito', fontWeight: 800, fontSize: 50, color: INK, transform: 'rotate(-2deg)' }}>Paint armies. Watch them fight.</div>
      </div>
    </AbsoluteFill>
  );
};

// Seitenbanner (ersetzt auf itch.io den Titel): Massenschlacht als Streifen, Titel auf Papier mittig
export const Banner = () => {
  useFonts();
  return (
    <AbsoluteFill style={{ background: '#fff', overflow: 'hidden' }}>
      <Scene src="cover-epic" pos="45% 50%" />
      <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0) 8%, rgba(255,255,255,.96) 30%, rgba(255,255,255,.96) 70%, rgba(255,255,255,0) 92%)' }} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <Logo size={140} />
        <div style={{ fontFamily: 'Nunito', fontWeight: 800, fontSize: 46, color: INK }}>Paint armies. Watch them fight.</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
