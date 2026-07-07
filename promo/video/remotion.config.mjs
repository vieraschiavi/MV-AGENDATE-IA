import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer('angle');

// Reutiliza el Chromium ya instalado en este entorno en vez de descargar otro.
const chromeExecutable = process.env.REMOTION_CHROME_EXECUTABLE;
if (chromeExecutable) {
  Config.setBrowserExecutable(chromeExecutable);
}
