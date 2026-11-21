/* Local codecs run off the UI thread. The bundled UMD build expects window. */
self.window = self;
importScripts('../../public/vendor/mediabunny.js');
const MB = self.Mediabunny;
let audioReply;
let lastUpdate = 0;
function progress(value, message, force = false) {
  if (force || performance.now() - lastUpdate > 150) {
    lastUpdate = performance.now();
    self.postMessage({ type: 'progress', value, message });
  }
}
const inputFor = file => new MB.Input({ source: new MB.BlobSource(file), formats: MB.ALL_FORMATS });
const videoCodec = format => format === 'mp4' ? 'avc' : 'vp9';
const audioCodec = format => format === 'wav' ? 'pcm-s16' : format === 'mp4' ? 'aac' : 'opus';
function outputFormat(format) {
  switch (format) {
    case 'wav': return new MB.WavOutputFormat();
    case 'mp4': return new MB.Mp4OutputFormat({ fastStart: false });
    case 'mov': return new MB.MovOutputFormat({ fastStart: false });
    case 'mkv': return new MB.MkvOutputFormat();
    case 'webm': return new MB.WebMOutputFormat();
    default: throw new Error('Formato de salida no admitido.');
  }
}
function mixedBlock(start, end) {
  return new Promise((resolve, reject) => {
    audioReply = { resolve, reject };
    self.postMessage({ type: 'audio', start, end });
  });
}
function audioSource(format) {
  return new MB.AudioSampleSource({ codec: audioCodec(format), bitrate: 192000,
    transform: { sampleRate: 48000, numberOfChannels: 2 } });
}
async function addMixedAudio(source, start, end, timestamp) {
  const { channels, sampleRate } = await mixedBlock(start, end);
  const length = channels[0].length;
  const data = new Float32Array(length * channels.length);
  channels.forEach((channel, i) => data.set(channel, i * length));
  const sample = new MB.AudioSample({ format: 'f32-planar', data, sampleRate,
    numberOfChannels: channels.length, timestamp });
  try { await source.add(sample); } finally { sample.close(); }
}
async function exportSelection(job, output, hw) {
  const { start, end, format } = job;
  const audio = audioSource(format);
  output.addAudioTrack(audio);
  let input, conversion;
  try {
    if (format !== 'wav') {
      input = inputFor(job.files[0]);
      conversion = await MB.Conversion.init({ input, output, tracks: 'primary', composable: true,
        trim: { start, end }, copy: { boundaryTolerance: 0, shiftTolerance: 0 },
        video: { codec: videoCodec(format), hardwareAcceleration: hw }, audio: { discard: true } });
      if (!conversion.isValid || !conversion.utilizedTracks.some(track => track.isVideoTrack())) {
        throw new Error('El navegador no puede exportar la pista de video de este archivo.');
      }
    }
    await output.start();
    // Feed both tracks in lockstep so the muxer never buffers a whole track.
    const frames = Math.round((end - start) * 48000);
    for (let frame = 0; frame < frames; frame += 48000) {
      const a = frame / 48000, b = Math.min(frames, frame + 48000) / 48000;
      await addMixedAudio(audio, start + a, start + b, a);
      if (conversion) await conversion.execute({ until: b });
      progress(b / (end - start), 'Exportando');
    }
    audio.close();
    if (conversion) await conversion.execute();
  } finally { input?.dispose(); }
}
async function exportJoin(job, output, hw) {
  // A single encoder per output avoids independent GOPs/configuration changes.
  const first = inputFor(job.files[0]);
  let width, height;
  try {
    const track = await first.getPrimaryVideoTrack();
    if (!track) throw new Error('El primer clip no contiene video.');
    width = Math.ceil(await track.getDisplayWidth() / 2) * 2;
    height = Math.ceil(await track.getDisplayHeight() / 2) * 2;
  } finally { first.dispose(); }
  const video = new MB.VideoSampleSource({ codec: videoCodec(job.format), bitrate: MB.QUALITY_HIGH,
    hardwareAcceleration: hw, transform: { width, height }, sizeChangeBehavior: 'contain' });
  output.addVideoTrack(video);
  // Inspect audio before start; absent audio is represented by timestamp gaps.
  let hasAudio = false;
  for (const file of job.files) {
    const input = inputFor(file);
    try { hasAudio ||= !!await input.getPrimaryAudioTrack(); } finally { input.dispose(); }
  }
  const audio = hasAudio ? audioSource(job.format) : null;
  if (audio) output.addAudioTrack(audio);
  await output.start();
  let position = 0;
  for (let i = 0; i < job.files.length; i++) {
    const input = inputFor(job.files[i]);
    let vi, ai, v, a;
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new Error(`Sin video: ${job.files[i].name}`);
      const origin = await track.getFirstTimestamp();
      const end = await track.computeDuration();
      const duration = end - origin;
      if (!(duration > 0)) throw new Error(`Clip vacío: ${job.files[i].name}`);
      const at = audio ? await input.getPrimaryAudioTrack() : null;
      vi = new MB.VideoSampleSink(track, { hardwareAcceleration: hw }).samples(origin, end);
      ai = at ? new MB.AudioSampleSink(at).samples(origin, end) : null;
      v = await vi.next(); a = ai ? await ai.next() : { done: true };
      while (!v.done || !a.done) {
        if (a.done || (!v.done && v.value.timestamp <= a.value.timestamp)) {
          const sample = v.value; v = null;
          try {
            sample.setTimestamp(position + Math.max(0, sample.timestamp - origin));
            await video.add(sample);
            progress((i + Math.min(1, (sample.timestamp - position) / duration)) / job.files.length,
              `Uniendo ${i + 1} de ${job.files.length}`);
          } finally { sample.close(); }
          v = await vi.next();
        } else {
          let sample = a.value; a = null;
          try {
            const from = Math.max(0, Math.round((origin - sample.timestamp) * sample.sampleRate));
            const to = Math.min(sample.numberOfFrames, Math.round((end - sample.timestamp) * sample.sampleRate));
            if (to > from) {
              if (from || to < sample.numberOfFrames) {
                const trimmed = sample.trim(from, to); sample.close(); sample = trimmed;
              }
              sample.setTimestamp(position + Math.max(0, sample.timestamp - origin));
              await audio.add(sample);
            }
          } finally { sample.close(); }
          a = await ai.next();
        }
      }
      position += duration;
    } finally {
      if (v && !v.done) v.value.close();
      if (a && !a.done) a.value.close();
      try { await vi?.return(); await ai?.return(); } finally { input.dispose(); }
    }
  }
  video.close(); audio?.close();
}
const copyTimestampTolerance = 0.000001;
// AAC priming can occupy a complete packet before the clip's video starts.
function isAacPreroll(packet, origin) {
  return packet.duration > 0 && packet.timestamp < origin - copyTimestampTolerance
    && packet.timestamp + packet.duration <= origin + copyTimestampTolerance;
}

// Validate frame intervals in presentation order within each GOP. The copy
// still emits packets in decode order, as required by the muxer.
async function validCopyTrack(track, isVideo, origin, end, skipAacPreroll = false) {
  const sink = new MB.EncodedPacketSink(track);
  if (isVideo && (await sink.getFirstPacket({ verifyKeyPackets: true }))?.type !== 'key') return false;
  const tolerance = copyTimestampTolerance;
  let previousEnd = -Infinity;
  const frames = [];
  const checkFrames = () => {
    frames.sort((a, b) => a.timestamp - b.timestamp);
    for (const frame of frames) {
      if (frame.timestamp < previousEnd - tolerance) return false;
      previousEnd = frame.timestamp + frame.duration;
    }
    frames.length = 0;
    return true;
  };
  for await (const packet of sink.packets(undefined, undefined, { metadataOnly: true })) {
    if (skipAacPreroll && frames.length === 0 && isAacPreroll(packet, origin)) continue;
    if (!(packet.duration > 0) || packet.timestamp < origin - tolerance
      || packet.timestamp + packet.duration > end + tolerance) return false;
    if ((!isVideo || packet.type === 'key') && !checkFrames()) return false;
    frames.push(packet);
  }
  return checkFrames() && previousEnd !== -Infinity;
}

async function inspectCopyJoin(job) {
  const plan = [];
  const format = outputFormat(job.format);
  const supportedVideo = format.getSupportedVideoCodecs();
  const supportedAudio = format.getSupportedAudioCodecs();
  let signature;
  const describe = config => {
    if (!config) return null;
    const description = config.description;
    const bytes = description ? (ArrayBuffer.isView(description)
      ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
      : new Uint8Array(description)) : [];
    return JSON.stringify({ ...config, description: Array.from(bytes) });
  };
  for (const file of job.files) {
    const input = inputFor(file);
    try {
      const vt = await input.getPrimaryVideoTrack(), at = await input.getPrimaryAudioTrack();
      if (!vt) return null;
      const vc = await vt.getDecoderConfig(), ac = at ? await at.getDecoderConfig() : null;
      if (!vc || (at && !ac)) return null;
      const codec = await vt.getCodec(), audio = at ? await at.getCodec() : null;
      if (!supportedVideo.includes(codec) || (at && !supportedAudio.includes(audio))) return null;
      const rotation = await vt.getRotation(), flip = await vt.getFlip();
      const matrix = await vt.getTransformationMatrix();
      const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      const transformationMatrix = matrix?.some((value, i) => value !== identity[i]) ? matrix : null;
      if ((rotation || flip || transformationMatrix) && !format.supportsVideoTransformationMetadata) return null;
      const current = JSON.stringify([describe(vc), describe(ac), rotation, flip, transformationMatrix]);
      if (signature !== undefined && signature !== current) return null;
      signature = current;
      const origin = await vt.getFirstTimestamp(), videoEnd = await vt.computeDuration();
      if (!(videoEnd > origin) || !await validCopyTrack(vt, true, origin, videoEnd)) return null;
      const audioEnd = at ? await at.computeDuration() : videoEnd;
      if (at && !await validCopyTrack(at, false, origin, audioEnd, audio === 'aac')) return null;
      // Place the next clip after both tracks, including the trailing audio
      // packet used by recordings such as Zoom.
      const end = Math.max(videoEnd, audioEnd);
      plan.push({ origin, duration: end - origin, codec, audio, vc, ac, rotation, flip, transformationMatrix });
    } finally { input.dispose(); }
  }
  return plan;
}
async function copyJoin(job, output, plan) {
  const first = plan[0];
  const video = new MB.EncodedVideoPacketSource(first.codec);
  output.addVideoTrack(video, { rotation: first.rotation, flip: first.flip,
    transformationMatrix: first.transformationMatrix ?? undefined });
  const audio = first.audio ? new MB.EncodedAudioPacketSource(first.audio) : null;
  if (audio) output.addAudioTrack(audio);
  await output.start();
  let position = 0;
  for (let i = 0; i < job.files.length; i++) {
    const input = inputFor(job.files[i]);
    let vi, ai, v, a;
    try {
      const vt = await input.getPrimaryVideoTrack(), at = await input.getPrimaryAudioTrack();
      vi = new MB.EncodedPacketSink(vt).packets();
      ai = at ? new MB.EncodedPacketSink(at).packets() : null;
      v = await vi.next(); a = ai ? await ai.next() : { done: true };
      while (first.audio === 'aac' && !a.done && isAacPreroll(a.value, plan[i].origin)) {
        a = await ai.next();
      }
      let clipProgress = 0;
      while (!v.done || !a.done) {
        const useVideo = a.done || (!v.done && v.value.timestamp <= a.value.timestamp);
        const packet = (useVideo ? v : a).value;
        const timestamp = position + Math.max(0, packet.timestamp - plan[i].origin);
        await (useVideo ? video : audio).add(packet.clone({ timestamp }), {
          decoderConfig: useVideo ? plan[i].vc : plan[i].ac
        });
        clipProgress = Math.max(clipProgress, (timestamp - position) / plan[i].duration);
        progress((i + clipProgress) / job.files.length, 'Uniendo sin recodificar');
        if (useVideo) v = await vi.next(); else a = await ai.next();
      }
      position += plan[i].duration;
    } finally {
      try { await vi?.return(); await ai?.return(); } finally { input.dispose(); }
    }
  }
  video.close(); audio?.close();
}
async function run(job) {
  let copyPlan = null;
  if (job.mode === 'join') {
    progress(0, 'Comprobando unión sin recodificar', true);
    copyPlan = await inspectCopyJoin(job);
    if (!copyPlan && job.copyOnly) {
      throw new Error('La copia directa requiere clips y formato compatibles. Prueba el modo Compatible.');
    }
  }
  // Retry only processing failures, never disk failures or finalization errors.
  const attempts = copyPlan ? ['copy'] : [];
  if (!job.copyOnly) attempts.push('prefer-hardware', 'no-preference');
  for (const hw of attempts) {
    let output, writable, storageFailed = false;
    try {
      let target;
      if (job.handle) {
        try { writable = await job.handle.createWritable(); }
        catch (error) { storageFailed = true; throw error; }
        target = new MB.StreamTarget(new WritableStream({
          async write(chunk) {
            try { await writable.write(chunk); } catch (error) { storageFailed = true; throw error; }
          }
        }), { chunked: true, chunkSize: 4 * 1024 * 1024 });
      } else target = new MB.BufferTarget();
      output = new MB.Output({ format: outputFormat(job.format), target });
      if (hw === 'copy') await copyJoin(job, output, copyPlan);
      else if (job.mode === 'join') {
        progress(0, 'Recodificando clips', true);
        await exportJoin(job, output, hw);
      }
      else await exportSelection(job, output, hw);
      progress(.99, 'Finalizando archivo', true);
      // At this point a codec retry cannot help a write/finalization failure.
      storageFailed = true;
      await output.finalize();
      if (writable) await writable.close();
      const buffer = job.handle ? null : target.buffer;
      self.postMessage({ type: 'done', buffer }, buffer ? [buffer] : []);
      return;
    } catch (error) {
      try { await output?.cancel(); } catch {}
      try { await writable?.abort(); } catch {}
      if (job.copyOnly && !storageFailed) {
        throw new Error(`Falló la copia directa. Prueba el modo Compatible. (${error.message})`);
      }
      if (hw === 'no-preference' || storageFailed || job.format === 'wav') throw error;
      progress(0, 'Reintentando con selección automática del navegador', true);
    }
  }
}
self.onmessage = ({ data }) => {
  if (data.type === 'audioResult') {
    if (data.error) audioReply?.reject(new Error(data.error)); else audioReply?.resolve(data);
    audioReply = null;
  } else if (data.type === 'start') {
    run(data.job).catch(error => self.postMessage({ type: 'error', message: error.message }));
  }
};
