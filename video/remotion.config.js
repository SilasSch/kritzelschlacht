// Remotion-Einstellungen. Ohne REMOTION_CHROME (und ohne Playwright-Chrome) lädt Remotion sein eigenes Chrome Headless Shell herunter.
import { Config } from '@remotion/cli/config';
import { existsSync } from 'node:fs';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setCodec('h264');
Config.setCrf(18);
Config.setPixelFormat('yuv420p');
// Claude-Cloud-Umgebung: vorinstallierter Headless-Chrome von Playwright
const PW = '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const chrome = process.env.REMOTION_CHROME || (existsSync(PW) ? PW : null);
if (chrome) Config.setBrowserExecutable(chrome);
