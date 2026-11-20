/* ---------- análisis ---------- */
async function toMono(buf, secs) {
  const dur = Math.min(buf.duration, secs);
  const off = new OfflineAudioContext(1, Math.max(1, Math.floor(dur * FS)), FS);
  const s = off.createBufferSource(); s.buffer = buf; s.connect(off.destination); s.start(0, 0, dur);
  return (await off.startRendering()).getChannelData(0);
}

function fft(re, im, cosT, sinT) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, step = n / len;
    for (let i = 0; i < n; i += len)
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const wr = cosT[k], wi = -sinT[k], a = i + j, b = a + half;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
  }
}

// Correlación cruzada GCC-PHAT: devuelve k tal que a[n+k] ≈ b[n]
function gccPhat(a, b) {
  let N = 1; while (N < a.length + b.length) N <<= 1;
  const cosT = new Float64Array(N / 2), sinT = new Float64Array(N / 2);
  for (let k = 0; k < N / 2; k++) { cosT[k] = Math.cos(2 * Math.PI * k / N); sinT[k] = Math.sin(2 * Math.PI * k / N); }
  const ar = new Float32Array(N), ai = new Float32Array(N), br = new Float32Array(N), bi = new Float32Array(N);
  ar.set(a); br.set(b);
  fft(ar, ai, cosT, sinT); fft(br, bi, cosT, sinT);
  const k1 = Math.floor(80 * N / FS), k2 = Math.ceil(3800 * N / FS);
  for (let i = 0; i < N; i++) {
    const f = Math.min(i, N - i);
    if (f < k1 || f > k2) { ar[i] = 0; ai[i] = 0; continue; }
    const xr = ar[i] * br[i] + ai[i] * bi[i], xi = ai[i] * br[i] - ar[i] * bi[i];
    const m = Math.pow(Math.hypot(xr, xi), 0.8) + 1e-12;
    ar[i] = xr / m; ai[i] = -xi / m;           // conjugado para usar la FFT directa como inversa
  }
  fft(ar, ai, cosT, sinT);
  const idx = k => (k >= 0 ? k : N + k);
  let best = -Infinity, bk = 0;
  for (let k = -(b.length - 1); k < a.length; k++) { const v = ar[idx(k)]; if (v > best) { best = v; bk = k; } }
  let second = 1e-12;
  for (let k = -(b.length - 1); k < a.length; k++) { if (Math.abs(k - bk) < 800) continue; const v = ar[idx(k)]; if (v > second) second = v; }
  return { lag: bk / FS, ratio: best / second };
}

$('#btnSync').onclick = async () => {
  const btn = $('#btnSync'); btn.disabled = true; lock(true); $('#result').style.display = 'none';
  try {
    const c = getCtx(), secs = +$('#win').value;
    status('Leyendo el audio del video…'); await tick();
    let vBuf;
    try { vBuf = await c.decodeAudioData(await videoFile.arrayBuffer()); }
    catch (e) { throw new Error('No pude leer el audio de este video (formato o tamaño no compatible). Conviértelo antes a MP4 (por ejemplo: ffmpeg -i video.mkv -c copy video.mp4).'); }
    videoDur = isFinite(video.duration) && video.duration > 0 ? video.duration : vBuf.duration;
    status('Leyendo el audio externo…'); await tick();
    if (!extBuffer || extBufferFile !== audioFile) { extBuffer = await c.decodeAudioData(await audioFile.arrayBuffer()); extBufferFile = audioFile; }
    status('Preparando señales…'); await tick();
    const a = await toMono(vBuf, secs), b = await toMono(extBuffer, secs);
    pk.v = peaksOf(vBuf); pk.e = peaksOf(extBuffer);
    origBuffer = vBuf; vBuf = null;
    status('Buscando la coincidencia (puede tardar unos segundos)…'); await tick();
    const r = gccPhat(a, b);
    setOffset(r.lag);
    const good = r.ratio >= 2, mid = r.ratio >= 1.4;
    $('#conf').textContent = good ? 'Confianza alta' : mid ? 'Confianza media' : 'Confianza baja';
    $('#conf').style.background = good ? 'var(--ok)' : mid ? 'var(--mid)' : 'var(--bad)';
    $('#result').style.display = 'block';
    $('#volO').value = 0; $('#volO').dispatchEvent(new Event('input'));
    lock(false);
    $('#tStart').value = 0; $('#tEnd').value = videoDur.toFixed(2); draw(); makeThumbs();
    status(good ? 'Listo. Reproduce el video para comprobarlo.' : 'Coincidencia débil: revisa a mano y ajusta el desfase. Prueba con una ventana de análisis mayor.', !good && !mid);
    video.currentTime = 0;
  } catch (e) { status(e.message, true); lock(false); }
  btn.disabled = false;
};
