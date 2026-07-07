import { Composition } from 'remotion';
import { Launch, FPS, DURATION_IN_FRAMES, WIDTH, HEIGHT } from './Launch.jsx';

export const RemotionRoot = () => {
  return (
    <Composition
      id="Launch"
      component={Launch}
      durationInFrames={DURATION_IN_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
