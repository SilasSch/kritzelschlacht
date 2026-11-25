import { Composition, Still } from 'remotion';
import { Trailer, trailerFrames, FPS } from './Trailer.jsx';
import { CoverDragons, CoverModern, CoverPaper, Banner } from './Cover.jsx';

// Zwei Formate aus derselben Schnittliste: quer (X, YouTube für itch.io) und hoch (X mobil, Shorts)
export const Root = () => (
  <>
    <Composition id="Trailer" component={Trailer} width={1920} height={1080} fps={FPS}
      durationInFrames={trailerFrames} defaultProps={{ vertical: false, cta: 'Free in your browser · no account' }} />
    <Composition id="TrailerVertical" component={Trailer} width={1080} height={1920} fps={FPS}
      durationInFrames={trailerFrames} defaultProps={{ vertical: true, cta: 'Free in your browser · no account' }} />
    {/* itch.io: Cover 630x500 (hier doppelt), Seitenbanner bis 960 breit (hier doppelt) */}
    <Still id="CoverDragons" component={CoverDragons} width={1260} height={1000} />
    <Still id="CoverModern" component={CoverModern} width={1260} height={1000} />
    <Still id="CoverPaper" component={CoverPaper} width={1260} height={1000} />
    <Still id="Banner" component={Banner} width={1920} height={600} />
  </>
);
