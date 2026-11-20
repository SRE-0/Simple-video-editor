/* ---------- línea de tiempo (zoom, desplazamiento, fotogramas, ondas) ---------- */
const PPS = 50, NT = 24, pk = { v: null, e: null }, cv = $('#tl');
let thumbs = [], thumbId = 0, vw = 16, vh = 9, v0 = 0, span = 0, C = {};
function readColors() {
  const s = getComputedStyle(root);
  ['tlLabel', 'tlDot', 'tlBlue', 'tlWave', 'tlBar', 'tlGrey', 'tlOutline', 'tlInner', 'tlTrack', 'tlThumb', 'tlBtn', 'tlPlayhead'].forEach(k => C[k] = s.getPropertyValue('--' + k).trim());
}
function peaksOf(buf) {
  const d = buf.getChannelData(0), step = Math.max(1, Math.floor(buf.sampleRate / PPS)), n = Math.ceil(d.length / step), out = new Float32Array(n);
  let mx = 1e-9;
  for (let i = 0; i < n; i++) {
    let m = 0; const e = Math.min(d.length, (i + 1) * step);
    for (let j = i * step; j < e; j++) { const v = d[j] < 0 ? -d[j] : d[j]; if (v > m) m = v; }
    out[i] = m; if (m > mx) mx = m;
  }
  for (let i = 0; i < n; i++) out[i] /= mx;
  return out;
}
const tfmt = t => { const m = Math.floor(t / 60); return m + ':' + (t - m * 60).toFixed(2).padStart(5, '0'); };
const clock = t => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.floor(t % 60)).padStart(2, '0');
async function makeThumbs() {
  const id = ++thumbId; thumbs = [];
  const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = video.src;
  try {
    await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = no; });
    vw = v.videoWidth || 16; vh = v.videoHeight || 9;
    for (let i = 0; i < NT; i++) {
      if (id !== thumbId) return;
      await new Promise(r => { v.onseeked = r; v.currentTime = (i + 0.5) / NT * videoDur; });
      const c = document.createElement('canvas'); c.width = 120; c.height = Math.round(120 * vh / vw);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); thumbs[i] = c; draw();
    }
  } catch (e) {}
}
function peakMax(arr, t0, t1, shift) {
  if (!arr) return 0;
  const i0 = Math.floor((t0 - shift) * PPS), i1 = Math.max(i0 + 1, Math.ceil((t1 - shift) * PPS));
  let m = 0; for (let i = Math.max(0, i0); i < Math.min(arr.length, i1); i++) if (arr[i] > m) m = arr[i];
  return m;
}
function draw() {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (!W) return;
  if (!C.tlLabel) readColors();
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  if (!videoDur) return;
  if (!span || span > videoDur) span = videoDur;
  if (!video.paused) { const t = video.currentTime; if (t > v0 + span * 0.92 || t < v0) v0 = t - span * 0.08; }
  v0 = Math.max(0, Math.min(videoDur - span, v0));
  const pps = W / span, X = t => (t - v0) * pps, T = x => x / pps + v0;
  const a = +$('#tStart').value, b = +$('#tEnd').value;
  const rulerFont = Math.max(12, Math.min(15, W * 0.02));
  const rulerY = 30, top = 42, pad = 4, fh = 40, gap = 6, wh = 44, ch = pad * 2 + fh + gap + wh + 8, side = 12;
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, Math.max(0, w), h, r); };
  // Regla superior minimalista: escala tipográfica grande, ligera y marcas verticales finas.
  const step = [1, 2, 5, 10, 15, 20, 30, 40, 60, 120, 300, 600, 1800, 3600].find(s => s * pps >= Math.max(rulerFont * 4, 110)) || 3600;
  g.font = `400 ${rulerFont}px Jost,-apple-system,"Segoe UI",sans-serif`; g.textBaseline = 'middle';
  for (let t = Math.floor(v0 / step) * step; t <= v0 + span; t += step) {
    const x = X(t); g.fillStyle = C.tlLabel; g.fillText(clock(t), x + 4, 22);
    g.fillStyle = C.tlLabel; g.globalAlpha = .48; g.fillRect(Math.round(x), rulerY, 1, top - rulerY - 3); g.globalAlpha = 1;
    g.fillStyle = C.tlDot; g.globalAlpha = .62;
    for (let k = 1; k < 5; k++) { const dx = X(t + step * k / 5); if (dx > x + 12) g.fillRect(Math.round(dx), rulerY + 4, 1, top - rulerY - 7); }
    g.globalAlpha = 1;
  }
  const x0 = X(0), x1 = X(videoDur), ty = top + pad, wy = ty + fh + gap, tw = Math.max(20, fh * vw / vh);
  const content = (xa, xb, sel) => {
    if (xb <= xa) return;
    g.save(); g.beginPath(); g.rect(Math.max(0, xa), top, Math.min(W, xb) - Math.max(0, xa), ch); g.clip();
    g.save(); rr(xa, ty, xb - xa, fh, 6); g.clip();
    g.fillStyle = C.tlTrack; g.fillRect(xa, ty, xb - xa, fh);
    const first = thumbs.find(Boolean);
    for (let x = x0 + Math.floor((Math.max(0, xa) - x0) / tw) * tw; x < Math.min(W, xb); x += tw) {
      const c = thumbs[Math.min(NT - 1, Math.max(0, Math.floor(T(x + tw / 2) / videoDur * NT)))] || first;
      if (c) g.drawImage(c, x, ty, tw + 0.5, fh);
    }
    g.restore();
    g.fillStyle = sel ? C.tlWave : C.tlInner; rr(xa, wy, xb - xa, wh, 6); g.fill();
    const cy = wy + wh / 2;
    for (let x = Math.max(xa + 3, 2); x < Math.min(xb - 2, W); x += 4) {
      const t0 = T(x - 2), t1 = T(x + 2);
      if (sel) { const o = Math.sqrt(peakMax(pk.v, t0, t1, 0)) * wh * 0.8; g.globalAlpha = .35; g.fillStyle = C.tlGrey; rr(x - 1, cy - o / 2, 2, Math.max(2, o), 1); g.fill(); g.globalAlpha = 1; }
      const h = Math.sqrt(peakMax(pk.e, t0, t1, offset)) * wh * 0.8;
      g.fillStyle = sel ? C.tlBar : C.tlGrey; rr(x - 1, cy - h / 2, 2, Math.max(2, h), 1); g.fill();
    }
    g.restore();
  };
  // clip completo (sin seleccionar)
  g.strokeStyle = C.tlOutline; g.lineWidth = 1.5; rr(x0 + .75, top + .75, x1 - x0 - 1.5, ch - 1.5, 12); g.stroke();
  content(x0 + 5, x1 - 5, false);
  // selección (azul, con asas blancas)
  const sa = X(a), sb = X(b);
  const leftEnd = Math.max(0, Math.min(W, sa)), rightStart = Math.max(0, Math.min(W, sb));
  // Vuelve a dibujar las miniaturas descartadas con alpha reducido. Así la
  // propia miniatura conserva sus curvas y no aparece una máscara cuadrada.
  g.save();
  const dimThumbRange = (from, to) => {
    const xa = Math.max(from, x0 + 5), xb = Math.min(to, x1 - 5);
    if (xb <= xa) return;
    g.save(); g.beginPath(); g.rect(xa, top, xb - xa, ch); g.clip();
    g.save(); rr(xa, ty, xb - xa, fh, 6); g.clip();
    g.globalAlpha = .38;
    const first = thumbs.find(Boolean);
    for (let x = x0 + Math.floor((xa - x0) / tw) * tw; x < xb; x += tw) {
      const c = thumbs[Math.min(NT - 1, Math.max(0, Math.floor(T(x + tw / 2) / videoDur * NT)))] || first;
      if (c) g.drawImage(c, x, ty, tw + .5, fh);
    }
    g.restore(); g.restore();
  };
  dimThumbRange(-Infinity, leftEnd);
  dimThumbRange(rightStart, Infinity);
  g.restore();
  if (sb > sa) {
    g.fillStyle = C.tlBlue; rr(sa, top, sb - sa, ch, 12); g.fill();
    g.fillStyle = C.tlInner; rr(sa + side, top + pad, sb - sa - side * 2, ch - pad * 2, 8); g.fill();
    content(sa + side, sb - side, true);
    g.fillStyle = snapActive ? C.tlPlayhead : '#fff'; const my = top + ch / 2 - 11;
    rr(sa + 4.5, my, 3, 22, 1.5); g.fill(); rr(sb - 7.5, my, 3, 22, 1.5); g.fill();
  }
  // Cabezal amarillo con etiqueta flotante, como en editores de video móviles.
  const p = X(video.currentTime || 0);
  if (p >= 0 && p <= W) {
    const label = clock(video.currentTime || 0); g.font = '700 9px -apple-system,"Segoe UI",sans-serif';
    const bw = Math.max(32, g.measureText(label).width + 10), bh = 17, bx = Math.max(2, Math.min(W - bw - 2, p - bw / 2)), by = 1;
    g.fillStyle = C.tlPlayhead; rr(bx, by, bw, bh, 8); g.fill();
    g.fillStyle = '#171717'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, bx + bw / 2, by + bh / 2 + .5); g.textAlign = 'start';
    g.fillStyle = C.tlPlayhead; g.beginPath(); g.moveTo(p - 4, by + bh - 1); g.lineTo(p + 4, by + bh - 1); g.lineTo(p, by + bh + 4); g.closePath(); g.fill();
    g.fillRect(p - 1, by + bh + 3, 2, top + ch - (by + bh + 3));
    g.beginPath(); g.arc(p, top + 2, 3.5, 0, 7); g.fill();
  }
  // Botón "ajustar"; el desplazamiento horizontal se hace con shift + rueda, sin scrollbar visible.
  const cx = W - 22, cyb = H - 22;
  g.fillStyle = C.tlBtn; g.beginPath(); g.arc(cx, cyb, 17, 0, 7); g.fill();
  g.strokeStyle = C.tlLabel; g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
  g.moveTo(cx + 2, cyb - 2); g.lineTo(cx + 7, cyb - 7); g.moveTo(cx + 3, cyb - 7); g.lineTo(cx + 7, cyb - 7); g.lineTo(cx + 7, cyb - 3);
  g.moveTo(cx - 2, cyb + 2); g.lineTo(cx - 7, cyb + 7); g.moveTo(cx - 3, cyb + 7); g.lineTo(cx - 7, cyb + 7); g.lineTo(cx - 7, cyb + 3); g.stroke();
  $('#sD').textContent = 'Recorte ' + tfmt(Math.max(0, b - a)); $('#sP').textContent = tfmt(video.currentTime || 0) + ' / ' + tfmt(videoDur);
}
let drag = null, snapActive = false;
const loc = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, W: r.width }; };
function dragMove(e) {
  const { x, W } = loc(e), a = +$('#tStart').value, b = +$('#tEnd').value;
  let t = Math.max(0, Math.min(videoDur, x / W * span + v0));
  const wasSnapped = snapActive;
  snapActive = false;
  const snapWindow = (wasSnapped ? 18 : 10) * span / W, playhead = video.currentTime;
  if (drag === 'a') {
    const limit = b - 0.05;
    if (playhead <= limit && Math.abs(t - playhead) <= snapWindow) { t = playhead; snapActive = true; }
    $('#tStart').value = Math.min(t, limit).toFixed(2);
  } else if (drag === 'b') {
    const limit = a + 0.05;
    if (playhead >= limit && Math.abs(t - playhead) <= snapWindow) { t = playhead; snapActive = true; }
    $('#tEnd').value = Math.max(t, limit).toFixed(2);
  } else video.currentTime = t;
  draw();
}
cv.onpointerdown = e => {
  if (!videoDur) return;
  cv.setPointerCapture(e.pointerId);
  const { x, y, W } = loc(e), H = cv.clientHeight, pps = W / span, X = t => (t - v0) * pps;
  if (x > W - 42 && y > H - 42) { span = videoDur; v0 = 0; draw(); return; }
  const a = +$('#tStart').value, b = +$('#tEnd').value;
  drag = Math.abs(x - X(a)) <= 18 ? 'a' : Math.abs(x - X(b)) <= 18 ? 'b' : 'seek';
  if (drag === 'seek') stopAt = null;
  dragMove(e);
};
cv.onpointermove = e => { if (drag) dragMove(e); };
cv.onpointerup = cv.onpointercancel = () => { drag = null; snapActive = false; draw(); };
cv.addEventListener('wheel', e => {
  if (!videoDur) return;
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, tAt = x / r.width * span + v0;
  if (e.ctrlKey || e.metaKey) { e.preventDefault(); span = Math.max(Math.min(2, videoDur), Math.min(videoDur, span * Math.exp(e.deltaY * 0.01))); v0 = tAt - x / r.width * span; }
  else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); v0 += (e.deltaX || e.deltaY) / r.width * span; }
  else return;
  draw();
}, { passive: false });
function zoom(f) {
  if (!videoDur) return;
  const c = video.currentTime, ns = Math.max(Math.min(2, videoDur), Math.min(videoDur, span * f));
  v0 = c - (c - v0) / span * ns; span = ns; draw();
}
$('#zIn').onclick = () => zoom(0.5); $('#zOut').onclick = () => zoom(2);
function loop() { draw(); if (!video.paused) requestAnimationFrame(loop); }
video.addEventListener('play', loop);
['seeked', 'timeupdate', 'pause', 'loadedmetadata'].forEach(ev => video.addEventListener(ev, draw));
['#tStart', '#tEnd'].forEach(q => $(q).addEventListener('input', draw));
video.addEventListener('loadedmetadata', async () => {
  if (!videoFile || !Number.isFinite(video.duration) || video.duration <= 0) return;
  const selectedFile = videoFile;
  videoDur = video.duration;
  $('#tStart').value = '0'; $('#tEnd').value = videoDur.toFixed(2);
  span = videoDur; v0 = 0; offset = 0; extBuffer = null; extBufferFile = null;
  lock(false); draw(); makeThumbs();
  try {
    const decoded = await getCtx().decodeAudioData(await selectedFile.arrayBuffer());
    if (selectedFile !== videoFile) return;
    origBuffer = decoded; pk.v = peaksOf(decoded); draw(); lock(false);
  } catch (e) {
    if (selectedFile === videoFile) { origBuffer = null; pk.v = null; lock(false); }
  }
});
window.addEventListener('resize', draw);
