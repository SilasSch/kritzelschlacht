// Wetter-Darstellung (Regen-Überarbeitung 25.11.): Regen als gekritzelte Striche statt des CSS-Streifenmusters.
// createWeather({ app, scene }) hängt zwei Ebenen an: Spritzer am Boden (in der Szene, bleiben beim Schwenken liegen)
// und fallende Striche plus leichte Abdunklung über dem Bild (Bildschirm-Raum, Kosten unabhängig vom Zoom).
//   frame(weather, cam, t)  pro Bild nach dem Setzen der Kamera; weather = world.weather (null | 'regen' | 'nebel')
//   style  'strich' (Bleistift-Striche, Standard) | 'tropfen' (gemalte Tropfen); nur Darstellung
// Reine Optik: kein Einfluss auf die Simulation, eigene Zufallsfolge, Echtzeit t.
/* global PIXI */

const TAU = Math.PI * 2;
const ANGLE = .2;                 // Neigung des Regens (rad, nach links unten)
const DENSITY = 1 / 4200;         // Striche je Bildschirmpixel² (1280×720 ≈ 220)
const MAX_DROPS = 420, MAX_SPLASH = 90;
const SPLASH_T = .34;             // Lebensdauer eines Spritzers (s)
const FADE_T = .6;                // Ein- und Ausblenden beim Wetterwechsel (s)

// eigene kleine Zufallsfolge (Math.random bleibt der Simulation fern, Bilder wiederholbar)
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function canvasTex(w, h, paint) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d'); c.lineCap = 'round'; c.lineJoin = 'round';
  paint(c, w, h); return PIXI.Texture.from(cv);
}

// Bleistift-Strich: leicht gebogen, an den Enden dünner, manchmal doppelt nachgezogen (senkrecht, Spitze unten)
function strokeTex(len, wob, twice) {
  const S = 2;   // doppelte Auflösung, damit die Striche bei Zoom scharf bleiben
  return canvasTex(12 * S, (len + 6) * S, (c, w, h) => {
    c.scale(S, S);
    const line = (dx, a, lw) => {
      const x0 = 6 + dx + (rnd() - .5) * wob, x1 = 6 + dx + (rnd() - .5) * wob, xm = 6 + dx + (rnd() - .5) * wob * 2;
      c.strokeStyle = `rgba(70,86,120,${a})`;
      // Verjüngung: drei Teilstücke mit wachsender Breite
      const pts = 6;
      for (let i = 0; i < pts; i++) {
        const u0 = i / pts, u1 = (i + 1) / pts;
        const q = (u, A, B, M) => (1 - u) * (1 - u) * A + 2 * u * (1 - u) * M + u * u * B;
        c.lineWidth = lw * (.35 + .65 * Math.sin(Math.PI * (u0 + u1) / 2));
        c.beginPath(); c.moveTo(q(u0, x0, x1, xm), 3 + u0 * len); c.lineTo(q(u1, x0, x1, xm), 3 + u1 * len); c.stroke();
      }
    };
    line(0, .9, 1.8);
    if (twice) line(.9, .45, 1.1);
  });
}

// gemalter Tropfen: Tränenform mit Kritzel-Kontur und hellem Glanzpunkt (Spitze oben)
function dropTex(r) {
  const S = 2, H = r * 3.4;
  return canvasTex(Math.ceil((r * 2 + 6) * S), Math.ceil((H + 6) * S), (c) => {
    c.scale(S, S);
    const cx = r + 3, by = H + 3 - r, ty = 3;
    const path = j => {
      c.beginPath();
      c.moveTo(cx + j(), ty);
      c.bezierCurveTo(cx + r * .35 + j(), ty + r * 1.2, cx + r + j(), by - r * .5, cx + r, by);
      c.arc(cx, by, r, 0, Math.PI, false);
      c.bezierCurveTo(cx - r + j(), by - r * .5, cx - r * .35 + j(), ty + r * 1.2, cx + j(), ty);
    };
    path(() => 0); c.fillStyle = 'rgba(150,190,235,.85)'; c.fill();
    c.strokeStyle = 'rgba(55,70,105,.9)'; c.lineWidth = 1.2; path(() => (rnd() - .5) * .8); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.ellipse(cx - r * .38, by - r * .15, r * .18, r * .32, -.3, 0, TAU); c.fill();
  });
}

// Spritzer: offener Kritzelring (von oben gesehen flach) mit drei kurzen Strichen nach außen
function splashTex() {
  const S = 2, W = 26, H = 16;
  return canvasTex(W * S, H * S, (c) => {
    c.scale(S, S);
    const cx = W / 2, cy = H / 2 + 2;
    c.strokeStyle = 'rgba(70,86,120,.85)'; c.lineWidth = 1.1;
    const a0 = rnd() * TAU;
    c.beginPath(); c.ellipse(cx, cy, 6.5, 2.8, 0, a0, a0 + TAU * .82); c.stroke();
    c.lineWidth = 1.2;
    for (const [dx, dy, ex, ey] of [[-7, -2, -11, -6], [0, -3.5, 0, -8], [7, -2, 11, -6]]) {
      c.beginPath(); c.moveTo(cx + dx, cy + dy); c.lineTo(cx + ex + (rnd() - .5), cy + ey + (rnd() - .5)); c.stroke();
    }
  });
}

export function createWeather({ app, scene, layer }) {
  const screen = new PIXI.Container(); screen.name = 'weather';
  const dim = new PIXI.Sprite(PIXI.Texture.WHITE); dim.tint = 0x3c4a68;
  const drops = new PIXI.Container(), splashes = new PIXI.Container();
  screen.addChild(dim, drops); app.stage.addChild(screen);
  (layer || scene).addChild(splashes);
  screen.visible = splashes.visible = false;

  let texS = null, texD = null, texP = null;
  const ensureTex = () => {
    if (texS) return;
    texS = [strokeTex(26, 2, false), strokeTex(34, 3, true), strokeTex(20, 1.5, false), strokeTex(30, 2.5, true), strokeTex(40, 3, false)];
    texD = [dropTex(3.6), dropTex(4.4), dropTex(3.2)];
    texP = [splashTex(), splashTex(), splashTex()];
  };

  // Tropfen: x, y im Bildschirm (CSS-Pixel), Tiefe z (0 fern … 1 nah)
  const D = [], P = [];
  let lastT = -1, mix = 0, style = 'strich', builtStyle = null, reduced = false;
  try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* alte Browser */ }
  let camX = null, camY = null;

  function resetDrop(d, w, h, top) {
    d.z = rnd();
    d.x = rnd() * (w + h * Math.tan(ANGLE));
    d.y = top ? -40 - rnd() * 60 : rnd() * h;
    d.land = h * (.08 + rnd() * .92);   // nahe Tropfen „landen“ irgendwo im Bild: dort ein Spritzer
  }

  function build() {
    ensureTex();
    drops.removeChildren();
    D.length = 0;
    builtStyle = style;
    for (let i = 0; i < MAX_DROPS; i++) {
      const d = { s: new PIXI.Sprite(), x: 0, y: 0, z: 0, land: 0 };
      d.s.anchor.set(.5, 1);
      drops.addChild(d.s); D.push(d);
    }
    for (const d of D) {
      resetDrop(d, app.screen.width, app.screen.height, false);
      dress(d);
    }
    if (!P.length) for (let i = 0; i < MAX_SPLASH; i++) {
      const s = new PIXI.Sprite(texP[i % texP.length]); s.anchor.set(.5, .6); s.visible = false;
      splashes.addChild(s); P.push({ s, life: 0 });
    }
  }

  function dress(d) {
    const s = d.s, z = d.z;
    if (style === 'tropfen') {
      s.texture = texD[(rnd() * texD.length) | 0];
      s.scale.set(.5 * (.55 + .6 * z));
      s.alpha = .45 + .5 * z;
      s.rotation = ANGLE * .6;
    } else {
      s.texture = texS[(rnd() * texS.length) | 0];
      s.scale.set(.5 * (.5 + .75 * z), .5 * (.6 + .8 * z));
      s.alpha = .18 + .5 * z;
      s.rotation = ANGLE;
    }
  }

  function splash(sx, sy, cam, z) {
    for (const p of P) {
      if (p.life > 0) continue;
      p.life = SPLASH_T;
      p.s.texture = texP[(rnd() * texP.length) | 0];
      p.s.position.set(cam.x + sx / cam.zoom, cam.y + sy / cam.zoom);   // Weltpunkt unter dem Bildschirmpunkt
      p.base = (.55 + .5 * z) * .75 / cam.zoom * Math.max(.7, Math.min(1.6, cam.zoom));
      p.s.scale.x = rnd() < .5 ? -1 : 1;
      p.s.visible = true;
      return;
    }
  }

  function frame(weather, cam, t) {
    const dt = lastT < 0 || t < lastT ? 0 : Math.min(.1, t - lastT); lastT = t;
    const want = weather === 'regen' ? 1 : 0;
    mix += Math.sign(want - mix) * Math.min(Math.abs(want - mix), dt / FADE_T);
    if (dt === 0 && want) mix = Math.max(mix, .001);
    const on = mix > 0;
    screen.visible = splashes.visible = on;
    if (!on) { camX = null; return; }
    if (builtStyle !== style) build();
    const w = app.screen.width, h = app.screen.height;
    dim.width = w; dim.height = h; dim.alpha = .075 * mix;
    // Wie viele Striche sichtbar: nach Bildschirmfläche (itch.io 1280×720 ≈ 220), beim Ein-/Ausblenden weniger
    const n = Math.min(MAX_DROPS, Math.round(w * h * DENSITY * (style === 'tropfen' ? .55 : 1) * mix));
    // Kamera-Schwenk: Regen wandert mit (sonst „steht“ er beim Ziehen über dem Feld)
    let px = 0, py = 0;
    if (camX !== null) { px = (camX - cam.x) * cam.zoom; py = (camY - cam.y) * cam.zoom; }
    camX = cam.x; camY = cam.y;
    const tanA = Math.tan(ANGLE), span = w + h * tanA;
    const step = reduced ? 0 : dt;
    for (let i = 0; i < D.length; i++) {
      const d = D[i], s = d.s;
      if (i >= n) { s.visible = false; continue; }
      const sp = (style === 'tropfen' ? 380 : 900) * (.55 + .7 * d.z);   // nahe Tropfen fallen schneller
      d.y += sp * step + py; d.x += -sp * tanA * step + px * .9;
      d.x = ((d.x % span) + span) % span;
      if (d.y > d.land && d.z > .35 && step > 0) {
        // Aufschlag: Spritzer am Boden, neuer Tropfen oben
        if (rnd() < .55) splash(d.x - h * tanA * .5, d.y, cam, d.z);
        resetDrop(d, w, h, true); dress(d);
      } else if (d.y > h + 40) { resetDrop(d, w, h, true); dress(d); }
      else if (d.y < -120) d.y += h + 120;
      s.visible = true;
      s.position.set(d.x - h * tanA * .5, d.y);
    }
    for (const p of P) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const u = 1 - p.life / SPLASH_T;           // 0 → 1
      const k = p.base * (.45 + .75 * Math.sqrt(u));
      p.s.scale.set(Math.sign(p.s.scale.x) * k, k);
      p.s.alpha = (1 - u * u) * .85 * mix;
    }
  }

  return {
    frame,
    get style() { return style; },
    set style(v) { style = v === 'tropfen' ? 'tropfen' : 'strich'; },
    debug: () => ({ drops: D.filter(d => d.s.visible).length, splashes: P.filter(p => p.life > 0).length, mix }),
  };
}
