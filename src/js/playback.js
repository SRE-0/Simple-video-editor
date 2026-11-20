/* ---------- desfase ---------- */
function setOffset(s) {
  offset = s; $('#offMs').value = Math.round(s * 1000);
  $('#offBig').textContent = Math.round(s * 1000) + ' ms';
  const a = Math.abs(s).toFixed(3);
  $('#offTxt').textContent = s >= 0 ? `El audio externo empieza ${a} s después del inicio del video.` : `El audio externo empezó ${a} s antes que el video; se recorta su inicio.`;
  startExt(); updateCmd(); draw();
}
$('#offMs').oninput = e => setOffset((+e.target.value || 0) / 1000);
document.querySelectorAll('[data-d]').forEach(b => b.onclick = () => setOffset(offset + b.dataset.d / 1000));

/* ---------- reproducción sincronizada ---------- */
function stopExt() { if (extSrc) { try { extSrc.stop(); } catch (e) {} extSrc.disconnect(); extSrc = null; } }
function startExt() {
  stopExt();
  if (!extBuffer || video.paused || $('#ctrls').classList.contains('locked')) return;
  const rate = video.playbackRate, pos = video.currentTime - offset, now = ctx.currentTime;
  const s = ctx.createBufferSource(); s.buffer = extBuffer; s.playbackRate.value = rate; s.connect(extGain);
  if (pos >= 0) { if (pos >= extBuffer.duration) return; s.start(now, pos); }
  else s.start(now + (-pos / rate), 0);
  extSrc = s; extStartCtx = now; extStartPos = pos;
}
video.onplay = () => { getCtx().resume(); startExt(); };
video.onpause = video.onended = stopExt;
video.onseeked = video.onratechange = startExt;
setInterval(() => {
  if (!extSrc || video.paused) return;
  const actual = extStartPos + (ctx.currentTime - extStartCtx) * video.playbackRate;
  if (Math.abs(actual - (video.currentTime - offset)) > 0.08) startExt();
}, 400);
