# Investigación y optimización de exportaciones

Fecha: 18 de noviembre de 2026.

## Equipo y alcance

El registro local identifica un Intel Core i5-8350U y una Intel UHD Graphics 620,
con controlador 31.0.101.2141. También hay un controlador de pantalla virtual.
La ficha de Intel confirma Quick Sync Video en ese procesador. Esto acredita una
capacidad del hardware, no que una sesión concreta del navegador la esté usando.
[Especificaciones oficiales de Intel](https://www.intel.com/content/www/us/en/products/sku/124969/intel-core-i58350u-processor-6m-cache-up-to-3-60-ghz/specifications.html).

Sync Studio es una aplicación estática: el servidor solo entrega archivos. La
exportación usa Mediabunny y WebCodecs en el navegador. No hay FFmpeg instalado
en el PATH de esta sesión, ni un servicio nativo que pueda invocarlo. Se conserva
esa arquitectura y el procesamiento local de los archivos.

## Hallazgos de la documentación oficial

| Mecanismo | Aplicación al proyecto | Decisión |
| --- | --- | --- |
| Copia de paquetes comprimidos | Evita decodificar y codificar; conserva la calidad | Prioritaria cuando sea segura |
| WebCodecs con preferencia de hardware | Puede aprovechar los motores de video disponibles para el navegador | Solicitar hardware y permitir un segundo intento automático |
| Dedicated Worker | Separa la coordinación de exportación de la interfaz | Implementado para MP4, WebM y WAV |
| Escritura por streaming | Reduce la RAM que requiere el archivo de salida | Implementada con selector de archivo y bloques de 4 MiB |
| Mezcla incremental | Evita construir toda la mezcla PCM antes de exportar | Bloques de un segundo a 48 kHz |
| WebGPU | Útil para filtros, composición o efectos propios | Sin incorporación: el editor actual no necesita esos filtros |
| FFmpeg nativo/QSV/NVENC/AMF | Permite controlar explícitamente el backend y sus parámetros | Requiere una integración nativa adicional |

### Aceleración y selección del códec

WebCodecs define `prefer-hardware` como una **preferencia**, no una garantía. El
navegador puede ignorarla; el soporte depende del códec, perfil, dimensiones,
controlador y disponibilidad de recursos. El hardware tampoco es necesariamente
más rápido para clips pequeños. Una respuesta positiva de soporte no demuestra
que se esté utilizando la GPU. Por ello la interfaz describe la política aplicada
y no afirma «GPU activa». Se intenta hardware y, ante fallos de procesamiento,
se reinicia con `no-preference`, que permite al navegador elegir de nuevo.
[Especificación WebCodecs, Hardware Acceleration](https://www.w3.org/TR/webcodecs/#hardware-acceleration).

Al recodificar se usan AVC/AAC para MP4 y VP9/Opus para WebM. El modo Rápido
también ofrece MKV y MOV. La copia directa acepta los códecs que admite el
contenedor de salida sin depender de los codificadores WebCodecs.
En este equipo MP4/AVC es el primer formato que conviene evaluar; no se presupone
aceleración de VP9 ni se fuerza AV1/HEVC sin verificar soporte.
[Códecs admitidos por Mediabunny](https://mediabunny.dev/guide/supported-formats-and-codecs).

### Copia sin recodificación

En la selección con mezcla se utiliza `Conversion` en modo componible. La pista
de imagen puede copiarse mientras se genera audio nuevo. Se exige tolerancia
cero en el inicio del recorte y en el desplazamiento temporal. Cuando la copia
no respeta esos límites o el códec de destino, la biblioteca recodifica. El avance
se coordina con la mezcla por bloques para evitar acumular pistas completas.
[Conversiones, copia y composición](https://mediabunny.dev/guide/converting-media-files).

En **Unir videos**, el modo **Rápido** copia los paquetes comprimidos de las
pistas principales en el orden de los clips. Si los archivos son incompatibles,
el modo **Compatible** permite recodificarlos. La copia comprueba que el formato
de salida admita los códecs y que coincidan la configuración del decodificador,
la transformación de video y la presencia de audio. El primer paquete de video
debe ser clave. Los intervalos deben ser positivos y no solaparse dentro de
cada pista. El clip siguiente comienza después de la pista más larga del
anterior, lo que conserva las colas de audio de grabaciones como las de Zoom.
La comprobación recorre metadatos
de paquetes y admite B-frames cuando el orden de presentación dentro de cada
grupo de imágenes cumple estas condiciones.
[Lectura de paquetes en orden de decodificación](https://mediabunny.dev/guide/media-sinks).

Ciertas pistas AAC incluyen paquetes de preparación anteriores al inicio
visible del video. En ese caso se requiere el modo Compatible para normalizar
el audio durante la unión.

FFmpeg usa un demultiplexor de concatenación para presentar archivos con pistas
compatibles como una secuencia de paquetes que se puede copiar con `-c copy`.
LosslessCut comprueba la compatibilidad antes de unir, y Shutter Encoder expone
la unión en su grupo de funciones sin conversión. Sync Studio usa el mismo
enfoque de copia de paquetes mediante Mediabunny en el navegador.
[FFmpeg](https://ffmpeg.org/ffmpeg-formats.html#concat),
[LosslessCut](https://losslesscut.app/docs/troubleshooting),
[Shutter Encoder](https://www.shutterencoder.com/documentation/).

### Worker, memoria y almacenamiento

`export-worker.js` importa el Mediabunny local y administra lectura, codificadores,
multiplexado y generación de WAV. La mezcla sigue usando `OfflineAudioContext`
en el contexto de la página, pero solo entrega un segundo cada vez mediante
ArrayBuffers transferibles. Los buffers originales decodificados para análisis
y reproducción todavía permanecen en memoria. El worker no elimina ese coste.
[Buenas prácticas de WebCodecs](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs).

Cuando existe `showSaveFilePicker`, se abre directamente desde el clic, se pasa
el handle al worker y se escribe a través de `StreamTarget`. La escritura aplica
contrapresión. El archivo se confirma al cerrar correctamente el writable;
en error se intenta abortar. Los errores de escritura y finalización se muestran
sin repetir toda la codificación. Sin esta API se utiliza descarga mediante Blob,
que conserva el resultado completo en RAM.
[File System Access](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access),
[destinos de salida de Mediabunny](https://mediabunny.dev/guide/writing-media-files).

La salida MP4 utiliza `fastStart: false`: evita el buffer completo para colocar
los índices al principio. Es adecuada para el archivo local descargado; si se
va a publicar para reproducción progresiva puede convenir un remux posterior
con `ffmpeg -i entrada.mp4 -c copy -movflags +faststart salida.mp4`.
[Formatos de salida](https://mediabunny.dev/guide/output-formats).

Las fuentes se alimentan con `await add(...)` y se cierran al terminar. Las
muestras se liberan con `close()` y las entradas con `dispose()`, también en
errores. La unión de clips distintos utiliza un codificador de video continuo,
tamaño par basado en el primer clip y ajuste proporcional con bandas. Conserva
la pista principal de audio, convertida a estéreo/48 kHz cuando se renderiza.
Los tramos sin audio quedan como huecos temporales. La actualización visual de
progreso se limita aproximadamente a una cada 150 ms.
[Fuentes y contrapresión](https://mediabunny.dev/guide/media-sources).

### Alternativa nativa investigada

Intel expone codificadores `*_qsv` mediante FFmpeg. NVIDIA dispone de NVENC y
NVDEC; AMD ofrece AMF. Son rutas pertinentes para una aplicación con puente
nativo, pero una página estática no puede seleccionar directamente esos
backends. Tampoco conviene añadir `-hwaccel auto` indiscriminadamente: FFmpeg
advierte que copiar fotogramas entre memoria de GPU y CPU puede empeorar el
rendimiento.
[Intel y FFmpeg/QSV](https://www.intel.com/content/www/us/en/developer/articles/technical/onevpl-in-ffmpeg-for-great-streaming-on-intel-gpus.html),
[NVIDIA y FFmpeg](https://docs.nvidia.com/video-technologies/video-codec-sdk/13.1/ffmpeg-with-nvidia-gpu/index.html),
[AMD AMF](https://gpuopen.com/advanced-media-framework/),
[FFmpeg, aceleración](https://ffmpeg.org/ffmpeg.html#Advanced-Video-options).

Para una futura versión nativa, detectar primero `ffmpeg -encoders` y ejecutar
una codificación corta con `h264_qsv`; no basta con detectar el nombre de la GPU.
Mantener copia directa para uniones compatibles y codificación por CPU como
alternativa. No se instala software ni se modifica el controlador en este cambio.

## Verificación y límites

- Dos grabaciones de Zoom H.264/AAC se unieron por copia directa en MP4, MKV
  y MOV. Las tres salidas conservaron los 101.209 paquetes de video y los
  189.769 paquetes de audio de las entradas. FFmpeg decodificó un tramo de
  ocho segundos alrededor del empalme del MP4 sin errores.

- La copia directa produjo un MP4 H.264 con B-frames de 2,56 s y 64 fotogramas
  y un WebM VP8 de 2 s y 50 fotogramas. FFmpeg decodificó ambos sin errores.
  El worker rechazó una combinación con resoluciones distintas y otra con
  paquetes AAC anteriores al inicio del video.

- `npm.cmd run check`: sintaxis de todos los scripts, incluido el worker, y rutas.
- `npm.cmd run build`: incorpora automáticamente el worker al build estático.
- Ejecución del worker con Mediabunny real y PCM sintético: WAV de 2,125 s,
  408.044 bytes, dos canales, 48.000 Hz, `pcm-s16`, releído por la biblioteca.
- La misma ejecución usando un writable simulado recibió tres bloques de mezcla,
  cerró la escritura y produjo un WAV con igual duración y tamaño. Un error
  simulado al abrir el destino se propagó con un solo intento, sin recodificación.
  Esto comprueba el protocolo de streaming, no un permiso real del navegador.
- La automatización del navegador devolvió «browser access host is unavailable».
  No se ha verificado visualmente la interfaz ni medido FPS, uso de GPU o tiempos
  de MP4/WebM. No se afirma ninguna mejora porcentual de rendimiento.

Pendiente de comprobación en navegador real: unión compatible sin recodificar;
unión con resoluciones/rotaciones distintas; audio ausente, AAC/Opus y audio
recortado; selección con inicio fuera de fotograma clave; cancelación del selector;
disco sin espacio; alternativa de descarga sin File System Access; cierre y
reproducción de cada contenedor. Comparar tiempo total, pico de memoria y motores
«Video Encode/Decode» del Administrador de tareas con los mismos archivos.

La reproducción previa, miniaturas y correlación de sincronización conservan su
implementación. No hay tone mapping HDR explícito ni selección de pistas
secundarias. El análisis inicial aún decodifica archivos completos en RAM.
