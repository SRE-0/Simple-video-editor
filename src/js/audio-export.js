/* Exportación de medios: video-export.js y export-worker.js. */
function updateCmd() {
  if (!videoFile || !audioFile) return;
  const flag = offset >= 0 ? `-itsoffset ${offset.toFixed(3)}` : `-ss ${(-offset).toFixed(3)}`;
  $('#cmd').textContent = `ffmpeg -i "${videoFile.name}" ${flag} -i "${audioFile.name}" -map 0:v -map 1:a -c:v copy -c:a aac -shortest "salida.mp4"`;
}
$('#btnCopy').onclick = async () => {
  try { await navigator.clipboard.writeText($('#cmd').textContent); status('Comando copiado.'); }
  catch { status('No se pudo acceder al portapapeles. Selecciona y copia el comando manualmente.', true); }
};
