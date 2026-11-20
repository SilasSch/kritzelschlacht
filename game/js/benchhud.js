import { buildBench, SCENARIOS } from './bench.js';
import { createRng } from './rng.js';
import { rebuildHash } from './world.js';
import { SIM_PHASES, SIM_TIME } from './sim.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ctx: { params, host, world, cam, game, ui, renderer, STEP, clearWorld, markAll, simStep, drainEvents }
// Liefert { n (0 = aus), start(n, scenario), tick() (je Simulationsschritt), frame(rawMs, simMs, renderMs, steps, dt) }.
export function createBenchHud(ctx) {
  const { params, host, world, cam, game, ui, renderer, STEP, clearWorld, markAll, simStep, drainEvents } = ctx;
  /* Leistungsprobe ?bench=N (Task 13), aus main.js ausgelagert.
     Baut die Szene aus bench.js (mixed mit N Einheiten; &scenario=blastcrowd: Bienenschwarm mit Salven) im
     Sandkasten und zeigt oben links fps, Sim-ms und Render-ms je Bild, die Bilddauer (Mittel und Spitze), die
     Einheiten und die Fx-Detailstufe. Die Anzeige ist maschinenlesbar (key=value), dazu jede Sekunde
     window.__bench = { fps, simMs, simStepMs, steps, renderMs, frameMs, frameMaxMs, units, lod, t, scenario,
     history (eine Zeile je Sekunde), summary(fromSec), restart() }. Sim-ms: alle Simulationsschritte des Bilds;
     Render-ms: der Rest der Arbeit im Bild (Ereignisse, Effekte, Zeichnen); Bilddauer: Abstand der Bilder. */
  const benchN = params.has('bench') ? clamp(parseInt(params.get('bench'), 10) || 2000, 4, 10000) : 0;
  const benchScen = SCENARIOS.includes(params.get('scenario')) ? params.get('scenario') : 'mixed';   // mixed, mixed2, blastcrowd
  const BENCH_HISTORY = 600;
  let bench = null, benchBox = null;

  // Szene (neu) aufbauen und die Messung von vorn beginnen; mit ?debug auch als __kritzel.bench(n, scenario)
  function startBench(n = benchN || 2000, scenario = benchScen) {
    if (!benchBox) { benchBox = document.createElement('div'); benchBox.className = 'fps'; benchBox.textContent = 'bench …'; host.append(benchBox); }
    if (game.mission || game.battle) game.enterSandbox();
    clearWorld();
    // &seed=N: feste Saat, damit Szene und Verlauf (die Simulation) bei jedem Lauf gleich sind
    const seed = parseInt(params.get('seed'), 10);
    if (Number.isFinite(seed)) world.rng = createRng(seed);
    const tick = buildBench(world, scenario, n);
    markAll(); rebuildHash(world); ui.closeBanner(); ui.refresh();
    const hist = bench ? bench.out.history : [];
    hist.length = 0;
    bench = { tick, k: 0, t: 0, n: 0, sim: 0, steps: 0, render: 0, frame: 0, frameMax: 0, boxN: 0, boxT: 0, boxSim: 0, boxRender: 0, boxFrame: 0,
      scenario, out: { scenario, fps: 0, simMs: 0, simStepMs: 0, steps: 0, renderMs: 0, frameMs: 0, frameMaxMs: 0, units: 0, lod: 0, t: 0,
        history: hist, summary: benchSummary, measure: benchMeasure, restart: () => startBench(n, scenario) } };
    window.__bench = bench.out;
    return scenario;
  }
  // Messung mit angehaltener Schleife: warm Schritte (mit Zeichnen) vorweg, dann frames Bilder je aus einem
  // Schritt + Ereignissen + fx.update (simFx), renderer.prepare (draw, JS), renderer.present (render: PIXI
  // durchläuft und bündelt die Szene) und gl.finish (gpuWait). Liefert avg/p95 je Teil, die Teile von draw
  // (drawParts), die Anzeigeobjekte je Ebene (counts) und den Zustand der Szene.
  function benchMeasure(frames = 60, opt = {}) {
    const warm = opt.warm ?? 30, wasPaused = game.paused;
    game.paused = true;
    const SF = { sim: 0, events: 0, fxUpdate: 0 };
    const S = { simFx: [], draw: [], render: [], gpuWait: [], total: [] }, parts = {};
    let ms0;
    try {
      let t = performance.now() / 1000;
      // simFx = Schritt (sim, je Teil aus sim.SIM_TIME) + Ereignisse (events) + fx.update (fxUpdate)
      const one = () => {
        const a = performance.now(); simStep();
        const b = performance.now(); drainEvents();
        const c = performance.now(); renderer.fx.update(STEP, world);
        SF.sim += b - a; SF.events += c - b; SF.fxUpdate += performance.now() - c;
      };
      for (let i = 0; i < warm; i++) { one(); renderer.draw(world, cam, t += STEP); }
      SF.sim = SF.events = SF.fxUpdate = 0;
      ms0 = Float64Array.from(SIM_TIME.ms);
      for (let i = 0; i < frames; i++) {
        const a = performance.now(); one();
        const b = performance.now(); renderer.prepare(world, cam, t += STEP);
        const c = performance.now(); renderer.present();
        const d = performance.now(); renderer.gpuFinish();
        const e = performance.now();
        S.simFx.push(b - a); S.draw.push(c - b); S.render.push(d - c); S.gpuWait.push(e - d); S.total.push(e - a);
        for (const k in renderer.prepMs) parts[k] = (parts[k] || 0) + renderer.prepMs[k] / frames;
      }
    } finally {
      game.paused = wasPaused;
    }
    const simParts = {};
    for (const k in SF) simParts[k] = r2(SF[k] / frames);
    SIM_PHASES.forEach((k, i) => { simParts['sim.' + k] = r2((SIM_TIME.ms[i] - ms0[i]) / frames); });
    const st = v => { const s = v.slice().sort((x, y) => x - y); return { avg: r2(s.reduce((p, x) => p + x, 0) / s.length), p95: r2(s[Math.min(s.length - 1, Math.floor(s.length * .95))]) }; };
    const out = { frames, warm };
    for (const k in S) out[k] = st(S[k]);
    for (const k in parts) parts[k] = r2(parts[k]);
    const fd = renderer.fx.debug();
    Object.assign(out, { simParts, drawParts: parts, counts: renderer.countObjects(), units: world.totalAlive, corpses: world.corpses.length,
      particles: fd.particles, lod: renderer.fx.lod, view: `${renderer.app.renderer.width}x${renderer.app.renderer.height}@${renderer.app.renderer.resolution}` });
    return out;
  }
  const r2 = v => Math.round(v * 100) / 100;
  // Mittel über die Sekunden ab fromSec (Standard 2: ohne den Aufbau der Szene), dazu die schlechteste Sekunde
  function benchSummary(fromSec = 2) {
    const h = bench.out.history.filter(s => s.t > fromSec);
    if (!h.length) return null;
    const avg = k => +(h.reduce((p, s) => p + s[k], 0) / h.length).toFixed(2);
    return { seconds: h.length, fps: avg('fps'), minFps: Math.min(...h.map(s => s.fps)), simMs: avg('simMs'), renderMs: avg('renderMs'),
      frameMs: avg('frameMs'), frameMaxMs: Math.max(...h.map(s => s.frameMaxMs)), lodMax: Math.max(...h.map(s => s.lod)) };
  }
  const r1 = v => Math.round(v * 10) / 10;
  function benchFrame(rawMs, simMs, renderMs, steps, dt) {
    if (!(rawMs >= 0) || rawMs > 1000) return;   // Tab im Hintergrund: nicht werten
    const b = bench;
    b.n++; b.sim += simMs; b.render += renderMs; b.steps += steps; b.frame += rawMs; if (rawMs > b.frameMax) b.frameMax = rawMs;
    b.t += rawMs / 1000; b.boxN++; b.boxT += dt; b.boxFrame += rawMs; b.boxSim += simMs; b.boxRender += renderMs;
    const lod = renderer.fx.lod;
    if (b.boxT >= .5) {
      benchBox.textContent = `bench ${b.scenario} fps=${Math.round(b.boxN * 1000 / (b.boxFrame || 1))} sim=${(b.boxSim / b.boxN).toFixed(1)}ms ` +
        `render=${(b.boxRender / b.boxN).toFixed(1)}ms frame=${(b.boxFrame / b.boxN).toFixed(1)}ms units=${world.totalAlive} lod=${lod}`;
      b.boxN = 0; b.boxT = 0; b.boxSim = 0; b.boxRender = 0; b.boxFrame = 0;
    }
    const o = b.out, secT = b.frame / 1000;
    if (secT >= 1) {
      o.fps = r1(b.n / secT); o.simMs = r1(b.sim / b.n); o.simStepMs = b.steps ? r1(b.sim / b.steps) : 0; o.steps = b.steps;
      o.renderMs = r1(b.render / b.n); o.frameMs = r1(b.frame / b.n); o.frameMaxMs = r1(b.frameMax);
      o.units = world.totalAlive; o.lod = lod; o.t = r1(b.t);
      o.history.push({ t: o.t, fps: o.fps, simMs: o.simMs, simStepMs: o.simStepMs, renderMs: o.renderMs, frameMs: o.frameMs, frameMaxMs: o.frameMaxMs, units: o.units, lod });
      if (o.history.length > BENCH_HISTORY) o.history.shift();
      b.n = 0; b.sim = 0; b.render = 0; b.steps = 0; b.frame = 0; b.frameMax = 0;
    }
  }
  return {
    n: benchN,
    start: startBench,
    get active() { return !!bench; },
    tick() { if (bench && bench.tick) bench.tick(bench.k++); },   // ?bench&scenario=blastcrowd: Salven im Takt der Schritte
    frame(rawMs, simMs, renderMs, steps, dt) { if (bench) benchFrame(rawMs, simMs, renderMs, steps, dt); },
  };
}
