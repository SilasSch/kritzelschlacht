// Schlacht als Video (25.11.): nimmt die Leinwand während des Replays auf (MediaRecorder, WebM) und bietet die Datei
// zum Speichern an. Im Claude-Artefakt über die downloads-Capability (claude.use('downloads')), sonst über einen
// normalen Download-Link. Ohne MediaRecorder (ältere Browser) meldet supported() false.
export const VIDEO_FPS = 30, VIDEO_BPS = 6e6;

const pickType = () => {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']) {
    try { if (MediaRecorder.isTypeSupported(t)) return t; } catch (e) { /* weiter */ }
  }
  return null;
};

export function createRecorder(canvas) {
  let rec = null, chunks = [], type = null;
  return {
    supported: () => !!(canvas && canvas.captureStream && pickType()),
    get active() { return !!rec; },
    start() {
      type = pickType();
      if (!type || rec) return false;
      chunks = [];
      try {
        rec = new MediaRecorder(canvas.captureStream(VIDEO_FPS), { mimeType: type, videoBitsPerSecond: VIDEO_BPS });
      } catch (e) { rec = null; return false; }
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.start(250);
      return true;
    },
    // Liefert ein Promise mit { blob, ext } oder null (nichts aufgenommen)
    stop() {
      const r = rec; rec = null;
      if (!r) return Promise.resolve(null);
      return new Promise(res => {
        r.onstop = () => {
          for (const t of r.stream.getTracks()) t.stop();
          const blob = new Blob(chunks, { type: type.split(';')[0] });
          res(blob.size ? { blob, ext: type.includes('mp4') ? 'mp4' : 'webm' } : null);
        };
        try { r.stop(); } catch (e) { res(null); }
      });
    },
  };
}

// Datei speichern: erst die downloads-Capability des Artefakts (höchstens 3 s warten), sonst ein Download-Link.
// Liefert 'saved', 'declined' oder 'link'.
export async function saveFile(blob, filename) {
  const cl = typeof window !== 'undefined' ? window.claude : null;
  if (cl && typeof cl.use === 'function') {
    const dl = await Promise.race([cl.use('downloads').catch(() => null), new Promise(r => setTimeout(() => r(null), 3000))]);
    if (dl) {
      try { await dl.save({ filename, data: blob }); return 'saved'; }
      catch (e) { if (e && e.code === 'declined') return 'declined'; }
    }
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'link';
}
