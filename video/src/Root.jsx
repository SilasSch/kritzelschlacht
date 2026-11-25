import { Composition } from 'remotion';
import { Trailer, trailerFrames, FPS } from './Trailer.jsx';

// Zwei Formate aus derselben Schnittliste: quer (X, YouTube für itch.io) und hoch (X mobil, Shorts)
export const Root = () => (
  <>
    <Composition id="Trailer" component={Trailer} width={1920} height={1080} fps={FPS}
      durationInFrames={trailerFrames} defaultProps={{ vertical: false, cta: 'Free in your browser · no account' }} />
    <Composition id="TrailerVertical" component={Trailer} width={1080} height={1920} fps={FPS}
      durationInFrames={trailerFrames} defaultProps={{ vertical: true, cta: 'Free in your browser · no account' }} />
  </>
);
