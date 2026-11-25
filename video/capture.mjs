// Nimmt Spielszenen Bild für Bild auf (deterministisch): die Seite bekommt eine eigene Uhr, requestAnimationFrame
// läuft nur, wenn wir einen Schritt machen. So ist jedes Bild genau 1/FPS s Spielzeit, egal wie langsam der
// Headless-Browser zeichnet. Ergebnis: public/clips/<name>.mp4 für Remotion.
// Aufruf: node capture.mjs [clipname ...]   (ohne Namen: alle aus clips.mjs)
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { CLIPS } from './clips.mjs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

// Playwright: lokal installiert oder global (npm root -g)
const loadPlaywright = async () => {
  try { return await import('playwright'); }
  catch { return createRequire(join(execSync('npm root -g').toString().trim(), 'x'))('playwright'); }
};
const { chromium } = await loadPlaywright();

const FPS = 30;
const GAME = resolve(import.meta.dirname, '../game');
const OUT = resolve(import.meta.dirname, 'public/clips');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  const p = join(GAME, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  try { res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(await readFile(p)); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;

// Eigene Uhr: performance.now, Date.now und requestAnimationFrame hängen an __t, das nur __step weiterschiebt
const CLOCK = () => {
  let t = 1000; const q = [];
  const t0 = Date.now();
  performance.now = () => t;
  Date.now = () => t0 + t;
  window.requestAnimationFrame = cb => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  window.__step = ms => { t += ms; const cbs = q.splice(0); for (const cb of cbs) { try { cb(t); } catch (e) { console.error(e); } } };
};

// Hilfen im Browser: __clean() ohne HUD-Ränder, __cam(zoom, cx, cy) Kamera auf Weltpunkt (Anteile 0..1)
const HELPERS = () => {
  const k = window.__kritzel;
  window.__clean = () => { k.cam.pad = { t: 0, b: 0, l: 0, r: 0 }; window.__cam(1, .5, .5); };
  window.__cam = (z, cx, cy) => {
    const c = k.cam; c.pad = { t: 0, b: 0, l: 0, r: 0 };
    c.zoom = c.fit * z;
    c.x = cx * c.worldW - c.viewW / c.zoom / 2; c.y = cy * c.worldH - c.viewH / c.zoom / 2;
  };
  window.__clean();
};

const want = process.argv.slice(2);
const clips = want.length ? CLIPS.filter(c => want.includes(c.name)) : CLIPS;
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });

for (const clip of clips) {
  const [w, h] = clip.size || [1280, 720];
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: +process.env.SCALE || clip.scale || 1.5 });
  page.on('pageerror', e => console.error('pageerror', e.message));
  await page.addInitScript(CLOCK);
  await page.addInitScript(() => { try { localStorage.setItem('kritzelschlacht.lang', 'en'); } catch {} });
  await page.goto(`http://localhost:${port}/index.html?debug${clip.query || ''}`);
  await page.waitForFunction(() => window.__step && window.__kritzel, null, { timeout: 30000 });
  for (let i = 0; i < 10; i++) await page.evaluate(() => window.__step(1000 / 30));
  await page.evaluate(HELPERS);
  if (clip.hud !== true) await page.addStyleTag({ content: '.hud, .toast, .banner, .coach { display: none !important; }' });
  await page.evaluate(clip.setup);
  if (clip.css) await page.addStyleTag({ content: clip.css });
  for (let i = 0; i < (clip.warmup || 0) * FPS; i++) await page.evaluate(() => window.__step(1000 / 30));

  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'medium', join(OUT, clip.name + '.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round(clip.seconds * FPS);
  for (let i = 0; i < n; i++) {
    if (clip.camAt) await page.evaluate(([z, x, y]) => window.__cam(z, x, y), clip.camAt(i / FPS));
    if (clip.each) await clip.each(page, i / FPS);
    await page.evaluate(() => window.__step(1000 / 30));
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log(`${clip.name}: ${n} Bilder`);
  await page.close();
}
await browser.close();
server.close();
