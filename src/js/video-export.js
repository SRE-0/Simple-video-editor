/* ---------- utilidades ---------- */
const root = document.documentElement, MB = window.Mediabunny;
let stopAt = null;
const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
const setProgress = value => {
  const progress = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  $('#prog').value = progress;
  return progress;
};
const seekTo = t => new Promise(res => {
  if (Math.abs(video.currentTime - t) < 0.001) return res();
  video.addEventListener('seeked', res, { once: true }); video.currentTime = t;
});
const bmsg = (t, err) => {
  const message = $('#bmsg');
  message.textContent = t;
  message.classList.toggle('err', !!err);
};
function joinMessage(t, err) {
  const status = $('#joinStatus');
  status.textContent = t;
  status.classList.toggle('err', !!err);
}
function validRange() {
  const a = +$('#tStart').value, b = +$('#tEnd').value;
  if (!(a >= 0 && b > a && b <= videoDur + 0.01)) { bmsg('Revisa inicio y fin', true); return null; }
  return { a, b };
}
$('#btnIn').onclick = () => { $('#tStart').value = video.currentTime.toFixed(2); draw(); };
$('#btnOut').onclick = () => { $('#tEnd').value = video.currentTime.toFixed(2); draw(); };
setInterval(() => { if (stopAt != null && video.currentTime >= stopAt) { stopAt = null; video.pause(); } }, 40);
function playPreview() {
  const r = validRange(); if (!r) return;
  if (!video.paused) { video.pause(); return; }
  let t = video.currentTime; if (t < r.a || t >= r.b - 0.05) t = r.a;
  seekTo(t).then(() => { stopAt = r.b; video.play(); });
}
$('#btnPlay').onclick = playPreview;
const lab = () => { $('#btnPlay').classList.toggle('on', !video.paused); $('#btnPlay span').textContent = video.paused ? 'Reproducir' : 'Pausa'; };
video.addEventListener('play', lab); video.addEventListener('pause', lab);
document.querySelectorAll('input[type=range]').forEach(r => { const f = () => r.style.setProperty('--p', r.value + '%'); r.addEventListener('input', f); f(); });

/* ---------- exportación rápida (WebCodecs + aceleración por hardware) ---------- */
async function setupFormats() {
  const opts = [];
  try {
    if (window.VideoEncoder && window.AudioEncoder) {
      if (await MB.canEncodeVideo('avc') && await MB.canEncodeAudio('aac')) opts.push(['mp4', 'MP4']);
      if (await MB.canEncodeVideo('vp9') && await MB.canEncodeAudio('opus')) opts.push(['webm', 'WebM']);
    }
  } catch (e) {}
  opts.push(['wav', 'WAV']);
  const seg = $('#fmt');
  opts.forEach(([v, l], i) => {
    const b = document.createElement('button'); b.textContent = l;
    b.onclick = () => { seg.dataset.v = v; [...seg.children].forEach(c => c.classList.toggle('on', c === b)); };
    seg.append(b); if (!i) b.click();
  });
}

const captureMix = () => ({ original: origBuffer, external: extBuffer, shift: offset,
  originalGain: +$('#volO').value / 100, externalGain: +$('#volE').value / 100 });
async function mixAudio(a, b, state = captureMix()) {
  const sr = 48000, off = new OfflineAudioContext(2, Math.max(1, Math.round((b - a) * sr)), sr);
  const add = (buf, when, from, gain) => {
    const s = off.createBufferSource(), g = off.createGain(); s.buffer = buf; g.gain.value = gain;
    s.connect(g).connect(off.destination);
    if (from < buf.duration && when < b - a) s.start(when, from);
  };
  if (state.original && state.originalGain > 0) add(state.original, 0, a, state.originalGain);
  if (state.external && state.externalGain > 0) add(state.external, Math.max(0, state.shift - a), Math.max(0, a - state.shift), state.externalGain);
  return off.startRendering();
}
let exportBusy = false;
const exportInertState = new Map();
function exportLock(busy) {
  exportBusy = busy;
  $('#btnExport').disabled = busy;
  $('#btnJoin').disabled = busy || joinFiles.length < 2;
  $('#btnWav').disabled = busy;
  for (const selector of ['.join-toolbar', '.export-options', '#joinList', '#dropV', '#dropA', '#ctrls', '#fmt', '#btnSync']) {
    const element = $(selector);
    if (busy) { exportInertState.set(element, element.inert); element.inert = true; }
    else element.inert = exportInertState.get(element) || element.classList.contains('locked');
  }
  if (!busy) exportInertState.clear();
  $('#bar').classList.toggle('busy', busy);
}
const exportMime = { wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm',
  mkv: 'video/x-matroska', mov: 'video/quicktime' };
async function chooseExportFile(name, format) {
  if (!window.showSaveFilePicker) return null;
  return window.showSaveFilePicker({ suggestedName: name,
    types: [{ description: format.toUpperCase(), accept: {
      [exportMime[format]]: ['.' + format]
    } }] });
}
async function runExport(job, name, mix) {
  if (exportBusy) return;
  const message = job.mode === 'join' ? joinMessage : bmsg;
  if (job.mode !== 'join' && !mix) { const state = captureMix(); mix = (a, b) => mixAudio(a, b, state); }
  exportLock(true); video.pause(); stopAt = null; setProgress(0);
  let worker;
  try {
    // Must open the picker in the original user gesture, before any processing.
    job.handle = await chooseExportFile(name, job.format);
    message(job.handle ? 'Preparando exportación al disco…' : 'Preparando exportación en memoria…');
    worker = new Worker('src/js/export-worker.js');
    await new Promise((resolve, reject) => {
      worker.onerror = event => reject(new Error(event.message || 'No se pudo iniciar el procesador de video.'));
      worker.onmessage = async ({ data }) => {
        if (data.type === 'audio') {
          try {
            const buffer = await mix(data.start, data.end);
            const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => new Float32Array(buffer.getChannelData(i)));
            worker.postMessage({ type: 'audioResult', channels, sampleRate: buffer.sampleRate }, channels.map(c => c.buffer));
          } catch (error) { worker.postMessage({ type: 'audioResult', error: error.message }); }
        } else if (data.type === 'progress') {
          setProgress(data.value); message(`${data.message} · ${Math.round(data.value * 100)} %`);
        } else if (data.type === 'error') reject(new Error(data.message));
        else if (data.type === 'done') {
          try {
            if (data.buffer) save(new Blob([data.buffer], { type: exportMime[job.format] }), name);
            resolve();
          } catch (error) { reject(error); }
        }
      };
      worker.postMessage({ type: 'start', job });
    });
    setProgress(1); message(job.handle ? 'Archivo guardado' : 'Archivo listo para descargar');
  } catch (error) {
    if (error.name === 'AbortError') message('Exportación cancelada');
    else message('No se pudo exportar: ' + error.message, true);
  } finally { worker?.terminate(); exportLock(false); }
}
$('#btnExport').onclick = () => {
  const range = validRange(); if (!range || exportBusy) return;
  const format = $('#fmt').dataset.v;
  const name = videoFile.name.replace(/\.[^.]+$/, '') + '_recorte.' + format;
  return runExport({ mode: 'selection', files: [videoFile], format, start: range.a, end: range.b }, name);
};
$('#btnJoin').onclick = () => {
  if (exportBusy || joinFiles.length < 2) return;
  const format = $('#joinFormat').value;
  const files = [...joinFiles];
  const name = files[0].name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_') + '_unido.' + format;
  return runExport({ mode: 'join', files, format, copyOnly: $('#joinMode').value === 'fast' }, name);
};
$('#btnWav').onclick = () => {
  if (exportBusy || !extBuffer) return;
  const external = extBuffer, shift = offset;
  const mix = async (a, b) => {
    const context = new OfflineAudioContext(2, Math.round((b - a) * 48000), 48000);
    const source = context.createBufferSource(); source.buffer = external; source.connect(context.destination);
    const from = Math.max(0, a - shift), when = Math.max(0, shift - a);
    if (from < external.duration && when < b - a) source.start(when, from);
    return context.startRendering();
  };
  return runExport({ mode: 'selection', files: [], format: 'wav', start: 0, end: videoDur },
    videoFile.name.replace(/\.[^.]+$/, '') + '_audio_sincronizado.wav', mix);
};
$('#joinMode').onchange = () => {
  const fast = $('#joinMode').value === 'fast';
  const format = $('#joinFormat');
  for (const option of format.options) {
    option.disabled = !fast && (option.value === 'mkv' || option.value === 'mov');
  }
  if (!format.value || format.selectedOptions[0].disabled) format.value = 'mp4';
  joinMessage(fast
    ? 'Para clips con los mismos ajustes de video y audio.'
    : 'Copia los clips si es posible. Si hace falta, los recodifica.');
};
setupFormats();
