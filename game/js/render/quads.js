// Flache Sprite-Listen (Task 13): statt eines PIXI-Containers je Einheit mit Kind-Sprites rechnet der
// Renderer die Lage jedes Teils selbst (2D-Matrizen wie PIXI.Transform) und schreibt Vierecke in eine
// QuadBatch. Die QuadBatch ist ein einzelnes Anzeigeobjekt, das seine Vierecke in Listenreihenfolge direkt
// an den Batch-Renderer von PIXI reicht (wie Sprite._render), mit ihrer Welt-Transformation (Kamera).
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

const IDX = new Uint16Array([0, 1, 2, 0, 2, 3]);

// Farbe mit Deckkraft wie Color.toPremultiplied (PIXI 7.4) für c in _tintRGB-Reihenfolge: bei rgb (Textur mit
// vormultipliziertem Alpha) werden auch die Farbanteile mit alpha multipliziert
export function premul(c, alpha, rgb) {
  if (alpha === 1) return (255 << 24) + c;
  if (alpha === 0) return rgb ? 0 : c;
  let r = c >> 16 & 255, g = c >> 8 & 255, b = c & 255;
  if (rgb) { r = r * alpha + .5 | 0; g = g * alpha + .5 | 0; b = b * alpha + .5 | 0; }
  return (alpha * 255 << 24) + (r << 16) + (g << 8) + b;
}

// Schnellerer Packweg im Batch-Renderer für Vierecke der QuadBatch (Farbe schon in e._argb, 4 Ecken, feste
// Indizes); alle anderen Elemente (Sprites, Graphics, Text) gehen den Weg von PIXI. Einmal je Renderer.
function fastPack(plugin) {
  const orig = plugin.packInterleavedGeometry;
  plugin.packInterleavedGeometry = function (el, ab, ib, aIndex, iIndex) {
    const argb = el._argb;
    if (argb === undefined) return orig.call(this, el, ab, ib, aIndex, iIndex);
    const f = ab.float32View, u32 = ab.uint32View, p = aIndex / this.vertexSize;
    const uvs = el.uvs, v = el.vertexData, tid = el._texture.baseTexture._batchLocation;
    for (let i = 0; i < 8; i += 2) {
      f[aIndex++] = v[i]; f[aIndex++] = v[i + 1]; f[aIndex++] = uvs[i]; f[aIndex++] = uvs[i + 1];
      u32[aIndex++] = argb; f[aIndex++] = tid;
    }
    ib[iIndex++] = p; ib[iIndex++] = p + 1; ib[iIndex++] = p + 2; ib[iIndex++] = p; ib[iIndex++] = p + 2; ib[iIndex] = p + 3;
  };
  plugin._quadFast = true;
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
        e = { _texture: null, uvs: null, indices: IDX, loc: new Float32Array(8), vertexData: new Float32Array(8), worldAlpha: 1, alpha: 1, _tintRGB: 0xffffff, _argb: 0, blendMode: this.blend };
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
      const plugin = renderer.plugins.batch, W = this.worldTransform, wa = this.worldAlpha;
      if (!plugin._quadFast) fastPack(plugin);
      const a = W.a, b = W.b, c = W.c, d = W.d, tx = W.tx, ty = W.ty;
      renderer.batch.setObjectRenderer(plugin);
      for (let i = 0; i < this.n; i++) {
        const e = this.q[i], l = e.loc, v = e.vertexData;
        for (let k = 0; k < 8; k += 2) { const x = l[k], y = l[k + 1]; v[k] = a * x + c * y + tx; v[k + 1] = b * x + d * y + ty; }
        const al = e.alpha * wa;
        e.worldAlpha = al;
        e._argb = premul(e._tintRGB, al > 1 ? 1 : al, e._texture.baseTexture.alphaMode > 0);
        plugin.render(e);
      }
    }
    // Für Prüfungen: Ecken des Vierecks i in Weltkoordinaten
    loc(i) { return i < this.n ? Array.from(this.q[i].loc) : null; }
  }
  return new QuadBatch();
}
