const $ = s => document.querySelector(s);
const FS = 8000;
const video = $('#video');
const tick = () => new Promise(r => setTimeout(r, 30));
let ctx, origGain, extGain, mon, streamDest, videoFile, audioFile, extBuffer, extBufferFile, origBuffer, videoDur = 0, offset = 0, editorBusy = true;
let extSrc = null, extStartCtx = 0, extStartPos = 0;

function getCtx() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  origGain = ctx.createGain(); extGain = ctx.createGain();
  ctx.createMediaElementSource(video).connect(origGain);
  mon = ctx.createGain(); streamDest = ctx.createMediaStreamDestination();
  origGain.connect(mon); extGain.connect(mon); mon.connect(ctx.destination);
  origGain.connect(streamDest); extGain.connect(streamDest);
  applyGains();
  return ctx;
}
function applyGains() { if (!origGain || !extGain) return; origGain.gain.value = $('#volO').value / 100; extGain.gain.value = $('#volE').value / 100; }
$('#volO').oninput = $('#volE').oninput = applyGains;

/* ---------- selección de archivos ---------- */
function setupDrop(id, onFile) {
  const z = $(id), inp = z.querySelector('input');
  const take = f => { if (!f || exportBusy) return; video.pause(); stopExt(); $('#result').style.display = 'none'; status(''); z.classList.add('ok'); z.querySelector('.file-name').textContent = f.name; onFile(f); $('#btnSync').disabled = !(videoFile && audioFile); };
  inp.onchange = () => take(inp.files[0]);
  z.ondragover = e => { e.preventDefault(); z.classList.add('over'); };
  z.ondragleave = () => z.classList.remove('over');
  z.ondrop = e => { e.preventDefault(); z.classList.remove('over'); take(e.dataTransfer.files[0]); };
}
setupDrop('#dropV', f => {
  video.pause(); stopExt();
  $('#video').parentElement.classList.add('has-video');
  videoFile = f; videoDur = 0; origBuffer = null; extBuffer = null; extBufferFile = null; offset = 0; pk.v = null; pk.e = null; getCtx();
  if (video.src) URL.revokeObjectURL(video.src);
  video.src = URL.createObjectURL(f);
  lock(true);
  addJoinFiles([f]);
});
setupDrop('#dropA', f => { audioFile = f; extBuffer = null; extBufferFile = null; lock(!videoDur); });
video.onerror = () => { if (video.src) status('Tu navegador no puede reproducir este video (se analizará igual si puede leer su audio). Para la vista previa, convierte el video a MP4 o WebM.', true); };

function lock(v) {
  editorBusy = v;
  const videoReady = !!videoFile && videoDur > 0;
  const audioReady = videoReady && !!audioFile && !!origBuffer && !!extBuffer;
  const states = { '#ctrls': !videoReady || editorBusy, '#trim': !videoReady || editorBusy, '#bar': !videoReady || editorBusy, '#exp': !audioReady || editorBusy };
  Object.entries(states).forEach(([s, disabled]) => { const el = $(s); el.classList.toggle('locked', disabled); el.inert = disabled; el.setAttribute('aria-disabled', String(disabled)); });
}
function status(t, err) { const s = $('#status'); s.textContent = t; s.classList.toggle('err', !!err); }

/* ---------- clips para unir ---------- */
const joinFiles = [];
const joinThumbnails = new Map();
const joinInput = $('#joinFiles');
async function makeJoinThumbnail(file) {
  const key = `${file.name}:${file.size}:${file.lastModified}`;
  if (joinThumbnails.has(key)) return joinThumbnails.get(key);
  const promise = new Promise(resolve => {
    const probe = document.createElement('video');
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = src => { if (settled) return; settled = true; URL.revokeObjectURL(url); probe.removeAttribute('src'); probe.load(); resolve(src); };
    probe.muted = true; probe.playsInline = true; probe.preload = 'metadata';
    probe.onloadeddata = () => {
      try { probe.currentTime = Math.min(0.1, Math.max(0, (probe.duration || 0) / 20)); } catch {}
    };
    probe.onseeked = () => {
      try {
        const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90;
        const scale = Math.min(canvas.width / probe.videoWidth, canvas.height / probe.videoHeight);
        const width = probe.videoWidth * scale, height = probe.videoHeight * scale;
        canvas.getContext('2d').drawImage(probe, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
        finish(canvas.toDataURL('image/jpeg', .72));
      } catch { finish(''); }
    };
    probe.onerror = () => finish('');
    setTimeout(() => finish(''), 10000);
    probe.src = url;
  });
  joinThumbnails.set(key, promise);
  return promise;
}
function addJoinFiles(files) {
  for (const file of files) if (!joinFiles.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) joinFiles.push(file);
  renderJoinList();
}
const renderJoinList = () => {
  const list = $('#joinList'); list.replaceChildren();
  joinFiles.forEach((file, index) => {
    const item = document.createElement('li'); item.className = 'join-item'; item.setAttribute('aria-label', `Clip ${index + 1}: ${file.name}`);
    const number = document.createElement('span'); number.className = 'clip-number'; number.textContent = String(index + 1).padStart(2, '0');
    const preview = document.createElement('span'); preview.className = 'clip-preview'; preview.setAttribute('aria-hidden', 'true');
    const placeholder = document.createElement('span'); placeholder.className = 'material-symbols-rounded'; placeholder.textContent = 'movie'; preview.append(placeholder);
    makeJoinThumbnail(file).then(src => { if (src && preview.isConnected) { preview.style.backgroundImage = `url("${src}")`; preview.classList.add('has-thumbnail'); placeholder.remove(); } });
    const titleWrap = document.createElement('span'); titleWrap.className = 'clip-details';
    const title = document.createElement('span'); title.className = 'clip-name'; title.textContent = file.name;
    const size = document.createElement('span'); size.className = 'clip-size'; size.textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB`;
    titleWrap.append(title, size); item.append(number, preview, titleWrap);
    const actions = document.createElement('span'); actions.className = 'clip-actions';
    for (const [label, icon, delta] of [['Subir', 'arrow_upward', -1], ['Bajar', 'arrow_downward', 1]]) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn'; button.setAttribute('aria-label', `${label} ${file.name}`); button.disabled = index + delta < 0 || index + delta >= joinFiles.length;
      const glyph = document.createElement('span'); glyph.className = 'material-symbols-rounded'; glyph.setAttribute('aria-hidden', 'true'); glyph.textContent = icon; button.append(glyph);
      button.onclick = () => { const target = index + delta; [joinFiles[index], joinFiles[target]] = [joinFiles[target], joinFiles[index]]; renderJoinList(); };
      actions.append(button);
    }
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn clip-remove'; remove.setAttribute('aria-label', `Quitar ${file.name}`); remove.innerHTML = '<span aria-hidden="true" class="material-symbols-rounded">close</span>'; remove.onclick = () => { joinFiles.splice(index, 1); renderJoinList(); }; actions.append(remove); item.append(actions); list.append(item);
  });
  const enough = joinFiles.length >= 2; $('#btnJoin').disabled = !enough;
  $('#joinCount').textContent = enough ? `${joinFiles.length} clips listos en este orden` : 'Agrega al menos dos clips para unirlos.';
  $('#joinBadge').textContent = `${joinFiles.length} ${joinFiles.length === 1 ? 'clip' : 'clips'}`;
  $('#joinEmpty').hidden = joinFiles.length > 0;
};
joinInput.onchange = () => { addJoinFiles(joinInput.files); joinInput.value = ''; };

/* ---------- soltar medios en cualquier parte ---------- */
const videoExt = /\.(mkv|mov|mp4|webm|avi|m4v|mpeg|mpg|ogv)$/i;
const audioExt = /\.(wav|mp3|m4a|flac|ogg|aac|opus|aiff?)$/i;
const isVideo = file => file.type.startsWith('video/') || videoExt.test(file.name);
const isAudio = file => file.type.startsWith('audio/') || audioExt.test(file.name);
let pageDragDepth = 0;
document.addEventListener('dragenter', event => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault(); pageDragDepth++;
  document.body.classList.add('drag-media');
});
document.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
document.addEventListener('dragleave', event => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  pageDragDepth = Math.max(0, pageDragDepth - 1);
  if (!pageDragDepth) document.body.classList.remove('drag-media');
});
document.addEventListener('drop', event => {
  if (!event.dataTransfer?.files?.length) return;
  event.preventDefault(); pageDragDepth = 0; document.body.classList.remove('drag-media');
  if (exportBusy) return;
  const files = [...event.dataTransfer.files];
  const videos = files.filter(isVideo), audios = files.filter(isAudio);
  if (videos.length) {
    addJoinFiles(videos);
    const file = videos[0];
    video.pause(); stopExt(); $('#result').style.display = 'none'; status('');
    const tile = $('#dropV'); tile.classList.add('ok'); tile.querySelector('.file-name').textContent = file.name;
    video.pause(); stopExt(); $('#video').parentElement.classList.add('has-video');
    videoFile = file; videoDur = 0; origBuffer = null; extBuffer = null; extBufferFile = null; offset = 0; pk.v = null; pk.e = null; getCtx();
    if (video.src) URL.revokeObjectURL(video.src);
    video.src = URL.createObjectURL(file); lock(true);
  }
  if (audios.length) {
    const file = audios[0];
    video.pause(); stopExt(); $('#result').style.display = 'none'; status('');
    const tile = $('#dropA'); tile.classList.add('ok'); tile.querySelector('.file-name').textContent = file.name;
    audioFile = file; extBuffer = null; extBufferFile = null; lock(!videoDur);
  }
  if (!videos.length && !audios.length) status('Suelta archivos de video o audio compatibles.', true);
});
