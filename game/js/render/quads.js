// Flache Sprite-Listen (Task 13): statt eines PIXI-Containers je Einheit mit Kind-Sprites rechnet der
// Renderer die Lage jedes Teils selbst (2D-Matrizen wie PIXI.Transform) und schreibt Vierecke in eine
// QuadBatch. Die QuadBatch ist ein einzelnes Anzeigeobjekt; ihr Zeichner (quadRenderer) packt die Vierecke in
// Listenreihenfolge mit ihrer Welt-Transformation (Kamera) selbst und zeichnet sie mit dem PIXI-Batch-Shader.
// Kein Szenengraph je Teil, keine ObservablePoint-/Color-Setter je Bild.
//
// Matrix = Float64Array(6) [a, b, c, d, tx, ty] wie PIXI.Matrix: x' = a·x + c·y + tx, y' = b·x + d·y + ty.
// Reiner Teil (mat, mul, corners, bgr) ohne PIXI, für die Tests; createQuadBatch braucht das globale PIXI.
/* global PIXI */

export const newMat = () => new Float64Array([1, 0, 0, 1, 0, 0]);

// Lokale Matrix wie PIXI.Transform.updateLocalTransform (ohne Schräge): Lage (x, y), Drehung rot,
// Skalierung (sx, sy), Drehpunkt (px, py)
export function mat(o, x, y, rot, sx, sy, px = 0, py = 0) {
  const cr = rot ? Math.cos(rot) : 1, sr = rot ? Math.sin(rot) : 0;
  const a = cr * sx, b = sr * sx, c = -sr * sy, d = cr * sy;
  o[0] = a; o[1] = b; o[2] = c; o[3] = d;
  o[4] = x - (px * a + py * c); o[5] = y - (px * b + py * d);
  return o;
}

// o = P · C (erst C, dann P), o darf P oder C sein
export function mul(o, P, C) {
  const a = P[0] * C[0] + P[2] * C[1], b = P[1] * C[0] + P[3] * C[1];
  const c = P[0] * C[2] + P[2] * C[3], d = P[1] * C[2] + P[3] * C[3];
  const tx = P[0] * C[4] + P[2] * C[5] + P[4], ty = P[1] * C[4] + P[3] * C[5] + P[5];
  o[0] = a; o[1] = b; o[2] = c; o[3] = d; o[4] = tx; o[5] = ty;
  return o;
}

// Ecken eines w×h-Bilds mit Anker (ax, ay) unter Matrix M in v (8 Zahlen), Reihenfolge wie
// Sprite.calculateVertices: oben links, oben rechts, unten rechts, unten links
export function corners(v, M, w, h, ax, ay) {
  const x1 = -ax * w, x0 = x1 + w, y1 = -ay * h, y0 = y1 + h;
  const a = M[0], b = M[1], c = M[2], d = M[3], tx = M[4], ty = M[5];
  v[0] = a * x1 + c * y1 + tx; v[1] = d * y1 + b * x1 + ty;
  v[2] = a * x0 + c * y1 + tx; v[3] = d * y1 + b * x0 + ty;
  v[4] = a * x0 + c * y0 + tx; v[5] = d * y0 + b * x0 + ty;
  v[6] = a * x1 + c * y0 + tx; v[7] = d * y0 + b * x1 + ty;
  return v;
}

// Farbe 0xRRGGBB → Reihenfolge von Sprite._tintRGB (Color.toLittleEndianNumber)
export const bgr = c => ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff);


// Farbe mit Deckkraft wie Color.toPremultiplied (PIXI 7.4) für c in _tintRGB-Reihenfolge: bei rgb (Textur mit
// vormultipliziertem Alpha) werden auch die Farbanteile mit alpha multipliziert
export function premul(c, alpha, rgb) {
  if (alpha === 1) return (255 << 24) + c;
  if (alpha === 0) return rgb ? 0 : c;
  let r = c >> 16 & 255, g = c >> 8 & 255, b = c & 255;
  if (rgb) { r = r * alpha + .5 | 0; g = g * alpha + .5 | 0; b = b * alpha + .5 | 0; }
  return (alpha * 255 << 24) + (r << 16) + (g << 8) + b;
}

// Eigener Zeichner der QuadBatches (ein PIXI.ObjectRenderer je Renderer): packt alle Vierecke einer Liste in
// einem engen Durchlauf in einen Vertex-Puffer im Format des PIXI-Batch-Shaders (x, y, u, v, Farbe, Textur-Nr.)
// und zeichnet sie mit dessen Shader, ein drawElements je Abschnitt (höchstens QMAX Vierecke und maxTextures
// Texturen). Die Arbeit des PIXI-Batch je Element (render, buildTexturesAndDrawCalls, buildDrawCalls) entfällt.
// Wechselt danach ein Sprite o. Ä. den Zeichner zurück, bindet der PIXI-Batch seinen Shader und Puffer neu.
const QMAX = 16383;   // 4 Ecken je Viereck, 16-Bit-Indizes
let QR_CLASS = null;
function quadRenderer(renderer) {
  if (renderer._quadRenderer) return renderer._quadRenderer;
  if (!QR_CLASS) {
    QR_CLASS = class QuadRenderer extends PIXI.ObjectRenderer {
      constructor(r) {
        super(r);
        this.geom = new PIXI.BatchGeometry(); this.state = PIXI.State.for2d();
        this.cap = 0; this.f32 = null; this.u32 = null; this.texs = []; this.tick = 0;
        this.blendPM = PIXI.utils.premultiplyBlendMode;
      }
      start() {
        const r = this.renderer, p = r.plugins.batch;
        r.state.set(this.state); r.texture.ensureSamplerType(p.maxTextures);
        r.shader.bind(p._shader); r.geometry.bind(this.geom);
      }
      ensure(nq) {
        if (nq <= this.cap) return;
        const cap = Math.min(QMAX, Math.max(nq, this.cap * 2, 1024));
        this.f32 = new Float32Array(cap * 24); this.u32 = new Uint32Array(this.f32.buffer);
        const idx = new Uint16Array(cap * 6);
        for (let i = 0, v = 0; i < idx.length; i += 6, v += 4) { idx[i] = v; idx[i + 1] = v + 1; idx[i + 2] = v + 2; idx[i + 3] = v; idx[i + 4] = v + 2; idx[i + 5] = v + 3; }
        this.geom._indexBuffer.update(idx);
        this.cap = cap;
      }
      draw(qb) {
        const r = this.renderer, gl = r.gl, maxT = r.plugins.batch.maxTextures, W = qb.worldTransform, wa = qb.worldAlpha;
        const a = W.a, b = W.b, c = W.c, d = W.d, tx = W.tx, ty = W.ty, q = qb.q, n = qb.n;
        let i = 0;
        while (i < n) {
          this.ensure(Math.min(n - i, QMAX));
          const f = this.f32, u = this.u32, tick = ++this.tick;
          let nt = 0, k = 0, o = 0, pma = true;
          for (; i < n && k < QMAX; i++) {
            const e = q[i], tex = e._texture, base = tex.baseTexture;
            if (!tex.valid) continue;
            if (base._qTick !== tick) { if (nt === maxT) break; base._qTick = tick; base._qSlot = nt; this.texs[nt++] = base; }
            const am = base.alphaMode > 0;
            if (!am) pma = false;
            const slot = base._qSlot, l = e.loc, uv = e.uvs, al = e.alpha * wa;
            const argb = premul(e._tintRGB, al > 1 ? 1 : al, am);
            for (let m = 0; m < 8; m += 2) {
              const x = l[m], y = l[m + 1];
              f[o++] = a * x + c * y + tx; f[o++] = b * x + d * y + ty; f[o++] = uv[m]; f[o++] = uv[m + 1]; u[o++] = argb; f[o++] = slot;
            }
            k++;
          }
          if (!k) break;
          for (let t = 0; t < nt; t++) { r.texture.bind(this.texs[t], t); this.texs[t] = null; }
          this.state.blendMode = this.blendPM[pma ? 1 : 0][qb.blend]; r.state.set(this.state);
          this.geom._buffer.update(f.subarray(0, k * 24));
          r.geometry.updateBuffers();
          gl.drawElements(gl.TRIANGLES, k * 6, gl.UNSIGNED_SHORT, 0);
        }
      }
    };
  }
  return (renderer._quadRenderer = new QR_CLASS(renderer));
}

// QuadBatch: add(tex, M, ax, ay, tint, alpha) mit Matrix M in Weltkoordinaten (Textur-Pixel werden über M
// skaliert, wie bei einem Sprite mit dieser Welt-Transformation); rect(x, y, w, h, tint, alpha) für
// einfarbige Rechtecke; clear() vor jedem Bild. blendMode gilt für alle Vierecke der Liste.
export function createQuadBatch(name, blendMode = 0) {
  const white = PIXI.Texture.WHITE, wf = white.frame;
  class QuadBatch extends PIXI.Container {
    constructor() {
      super();
      this.name = name; this.q = []; this.n = 0; this.blend = blendMode;
      this.UM = newMat();
    }
    clear() { this.n = 0; }
    get count() { return this.n; }
    slot(tex, tint, alpha) {
      let e = this.q[this.n];
      if (!e) {
        e = { _texture: null, uvs: null, loc: new Float32Array(8), alpha: 1, _tintRGB: 0xffffff };
        this.q.push(e);
      }
      this.n++;
      e._texture = tex; e.uvs = tex._uvs.uvsFloat32; e.alpha = alpha; e._tintRGB = tint === 0xffffff ? tint : bgr(tint);
      return e;
    }
    add(tex, M, ax, ay, tint = 0xffffff, alpha = 1) {
      if (!(alpha > 0)) return;
      const o = tex.orig, e = this.slot(tex, tint, alpha);
      corners(e.loc, M, o.width, o.height, ax, ay);
    }
    // Wie add(tex, P · mat(x, y, rot, sx, sy), ax, ay, …), aber ohne Zwischenmatrizen (P null: keine Eltern);
    // der häufigste Weg (Teile der Figuren, Partikel, Schatten, Leichen)
    addPart(tex, P, x, y, rot, sx, sy, ax, ay, tint, alpha) {
      if (!(alpha > 0)) return;
      const cr = rot ? Math.cos(rot) : 1, sr = rot ? Math.sin(rot) : 0;
      const la = cr * sx, lb = sr * sx, lc = -sr * sy, ld = cr * sy;
      let A = la, B = lb, Cc = lc, D = ld, TX = x, TY = y;
      if (P !== null) {
        A = P[0] * la + P[2] * lb; B = P[1] * la + P[3] * lb; Cc = P[0] * lc + P[2] * ld; D = P[1] * lc + P[3] * ld;
        TX = P[0] * x + P[2] * y + P[4]; TY = P[1] * x + P[3] * y + P[5];
      }
      const o = tex.orig, w = o.width, h = o.height, x1 = -ax * w, x0 = x1 + w, y1 = -ay * h, y0 = y1 + h;
      const v = this.slot(tex, tint, alpha).loc;
      v[0] = A * x1 + Cc * y1 + TX; v[1] = D * y1 + B * x1 + TY;
      v[2] = A * x0 + Cc * y1 + TX; v[3] = D * y1 + B * x0 + TY;
      v[4] = A * x0 + Cc * y0 + TX; v[5] = D * y0 + B * x0 + TY;
      v[6] = A * x1 + Cc * y0 + TX; v[7] = D * y0 + B * x1 + TY;
    }
    rect(x, y, w, h, tint, alpha = 1) {
      if (!(alpha > 0) || !(w > 0)) return;
      const M = this.UM;
      M[0] = w / wf.width; M[1] = 0; M[2] = 0; M[3] = h / wf.height; M[4] = x; M[5] = y;
      const e = this.slot(white, tint, alpha);
      corners(e.loc, M, wf.width, wf.height, 0, 0);
    }
    // Strich (x0, y0) → (x1, y1) der Breite w mit geraden Enden (wie Graphics.lineStyle mit LINE_CAP.BUTT)
    line(x0, y0, x1, y1, w, tint, alpha = 1) {
      const dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy);
      if (!(alpha > 0) || !(len > 0)) return;
      const M = mat(this.UM, x0, y0, Math.atan2(dy, dx), len / wf.width, w / wf.height);
      const e = this.slot(white, tint, alpha);
      corners(e.loc, M, wf.width, wf.height, 0, .5);
    }
    render(renderer) {
      if (!this.visible || this.worldAlpha <= 0 || !this.renderable || !this.n) return;
      const qr = quadRenderer(renderer);
      renderer.batch.setObjectRenderer(qr);
      qr.draw(this);
    }
    // Für Prüfungen: Ecken des Vierecks i in Weltkoordinaten
    loc(i) { return i < this.n ? Array.from(this.q[i].loc) : null; }
  }
  return new QuadBatch();
}
