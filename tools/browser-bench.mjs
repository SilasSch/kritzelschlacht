// Headless-Messung im echten Renderer: node tools/browser-bench.mjs [units=2000] [--chrome=PFAD] [--warm=240]
//   [--frames=60] [--size=1280x800] [--runs=1] [--seed=1] [--shot=bild.png] [--clip=x,y,w,h,zoom] [--profile=out.cpuprofile] [--swiftshader]
// Startet einen kleinen statischen Server für das Repo, einen kopflosen Chrome/Chromium (CDP über den in
// Node eingebauten WebSocket), öffnet game/index.html?bench=N&debug und ruft dort
// __bench.restart(); __bench.measure(frames, { warm }) auf (siehe main.js). Ausgabe: JSON je Lauf.
// Chrome: --chrome=… oder Umgebungsvariable CHROME; sonst wird ein Playwright-Chromium unter
// %LOCALAPPDATA%/ms-playwright bzw. ~/.cache/ms-playwright gesucht.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (k, d) => { const a = argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const N = parseInt(argv.find(a => !a.startsWith('--')) || '2000', 10);
const WARM = parseInt(flag('warm', '240'), 10), FRAMES = parseInt(flag('frames', '60'), 10), RUNS = parseInt(flag('runs', '1'), 10);
const [VW, VH] = flag('size', '1280x800').split('x').map(Number);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function findChrome() {
  const c = flag('chrome', process.env.CHROME);
  if (c) return c;
  const bases = [path.join(process.env.LOCALAPPDATA || '', 'ms-playwright'), path.join(os.homedir(), '.cache', 'ms-playwright')];
  for (const b of bases) {
    if (!fs.existsSync(b)) continue;
    for (const d of fs.readdirSync(b).filter(d => d.startsWith('chromium-')).sort().reverse()) {
      for (const rel of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(b, d, rel); if (fs.existsSync(p)) return p;
      }
    }
  }
  throw new Error('kein Chrome gefunden: --chrome=PFAD oder CHROME setzen');
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port, dport = 9300 + (process.pid % 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'kritzel-bench-'));
const gpu = argv.includes('--swiftshader') ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'];
const chrome = spawn(findChrome(), ['--headless=new', `--remote-debugging-port=${dport}`, `--window-size=${VW},${VH}`, `--user-data-dir=${prof}`,
  '--remote-allow-origins=*', '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', ...gpu, 'about:blank'], { stdio: 'ignore' });

let ok = false, connected = false;
try {
  // Verbindung zum Browser (nicht zu einer Seite): eigene Seite per Target.createTarget, Befehle über eine
  // flache Sitzung (sessionId); robuster als die Seite aus /json/list
  let ver = null;
  for (let i = 0; i < 100 && !ver; i++) { await sleep(100); try { ver = await (await fetch(`http://127.0.0.1:${dport}/json/version`)).json(); } catch { /* startet noch */ } }
  const log = s => process.stderr.write(s + '\n');
  log('cdp ' + ver.webSocketDebuggerUrl);
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0, session = null; const wait = new Map();
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); return; }
    // Fehler der Seite mit ausgeben
    if (d.method === 'Runtime.exceptionThrown') log('page exception: ' + JSON.stringify(d.params.exceptionDetails).slice(0, 600));
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') log('console.error: ' + JSON.stringify(d.params.args.map(a => a.value ?? a.description)).slice(0, 600));
  };
  // CDP-Aufruf (in der Seiten-Sitzung, sobald es eine gibt); ohne Antwort Abbruch mit Meldung statt Hängen
  const cdp = (method, params = {}) => new Promise((r, j) => {
    const i = ++id, to = setTimeout(() => { wait.delete(i); j(new Error('CDP timeout: ' + method)); }, method === 'Runtime.evaluate' ? 600000 : 15000);
    wait.set(i, d => { clearTimeout(to); if (d.error) j(new Error(method + ': ' + d.error.message)); else r(d); });
    ws.send(JSON.stringify(session ? { id: i, method, params, sessionId: session } : { id: i, method, params }));
  });
  const evaluate = async expr => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 600000 });
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 800));
    return r.result.result.value;
  };
  const tg = await cdp('Target.createTarget', { url: 'about:blank' });
  session = (await cdp('Target.attachToTarget', { targetId: tg.result.targetId, flatten: true })).result.sessionId;
  await cdp('Runtime.enable'); log('connected'); connected = true;
  await cdp('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/game/index.html?bench=${N}&debug&seed=${flag('seed', '1')}` });
  for (let i = 0; i < 200; i++) { await sleep(100); if (await evaluate('!!(window.__bench && window.__kritzel)')) break; }
  const gl = await evaluate(`(() => { const gl = __kritzel.renderer.app.renderer.gl, e = gl.getExtension('WEBGL_debug_renderer_info');
    return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })()`);
  console.log(`chrome headless ${VW}x${VH}  gl: ${gl}`);
  for (let k = 0; k < RUNS; k++) {
    const profOut = flag('profile', null);
    // Profil nur über die gemessenen Bilder: warm vorweg ohne Profil, dann measure ohne eigenes Aufwärmen
    if (profOut) { await evaluate(`(() => { __bench.restart(); __bench.measure(1, { warm: ${WARM} }); return 1; })()`); await cdp('Profiler.enable'); await cdp('Profiler.start'); }
    const out = await evaluate(profOut ? `__bench.measure(${FRAMES}, { warm: 0 })` : `(() => { __bench.restart(); return __bench.measure(${FRAMES}, { warm: ${WARM} }); })()`);
    if (profOut) { const pr = await cdp('Profiler.stop'); fs.writeFileSync(profOut, JSON.stringify(pr.result.profile)); log('profile ' + profOut); }
    console.log(JSON.stringify(out));
  }
  const shot = flag('shot', null);
  if (shot) {
    // Bild der zuletzt gezeichneten Szene (die angehaltene Schleife zeichnet sie weiter)
    const c = flag('clip', null), cl = c && c.split(',').map(Number);
    const r = await cdp('Page.captureScreenshot', cl ? { format: 'png', clip: { x: cl[0], y: cl[1], width: cl[2], height: cl[3], scale: cl[4] || 1 } } : { format: 'png' });
    fs.writeFileSync(shot, Buffer.from(r.result.data, 'base64')); log('shot ' + shot);
  }
  ok = true;
} catch (e) { console.error(e); }
chrome.kill(); server.close();
try { fs.rmSync(prof, { recursive: true, force: true }); } catch { /* Chrome hält noch Dateien */ }
// Manchmal antwortet eine frisch gestartete Seite nicht (Runtime.enable): mit neuem Chrome bis zu 3 Versuche
const attempt = parseInt(process.env.KRITZEL_BENCH_TRY || '1', 10);
if (!ok && !connected && attempt < 3) {
  process.stderr.write(`neuer Versuch ${attempt + 1}
`);
  const c = spawn(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, KRITZEL_BENCH_TRY: String(attempt + 1) } });
  c.on('exit', code => process.exit(code ?? 1));
} else process.exit(ok ? 0 : 1);
