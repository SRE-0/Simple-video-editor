# Arquitectura

Aplicación estática sin backend y sin dependencias de instalación. `index.html` define los controles; los scripts se cargan con `defer` en el orden de sus etiquetas. Todos se ejecutan después de analizar el DOM y comparten bindings léxicos globales. No deben convertirse individualmente a `type="module"` sin introducir importaciones explícitas y un modelo de estado.

1. Mediabunny conserva la biblioteca embebida original y expone `window.Mediabunny`.
2. `app.js` define el estado de medios, carga de archivos, AudioContext y bloqueo de controles.
3. `analysis.js` prepara mono a 8 kHz y calcula la correlación cruzada ponderada. Sus handlers se ejecutan después de la inicialización completa.
4. `playback.js` programa el audio externo según el desfase y corrige deriva.
5. `audio-export.js` prepara y copia el comando FFmpeg. La generación WAV se coordina con el resto de exportaciones en `video-export.js`.
6. `video-export.js` detecta codificadores, mezcla audio por bloques y coordina el selector de guardado y el worker. `export-worker.js` procesa video, audio y WAV, conserva el audio al unir clips y copia paquetes compatibles sin recodificarlos. El worker carga su propia instancia del Mediabunny local; no participa de los bindings de la página.
7. `timeline.js` dibuja la línea de tiempo y gestiona el puntero.
8. `theme.js` aplica el tema, actualiza los colores del canvas y bloquea inicialmente las herramientas.

Los medios originales decodificados permanecen en memoria y usan object URLs locales. La exportación escribe mediante `StreamTarget` cuando existe File System Access; de lo contrario usa un buffer y una descarga. El servidor de desarrollo escucha solo en localhost y permite servir HTML, CSS, JS y SVG. El build copia únicamente los recursos de ejecución a `dist/`. Consulta [las decisiones de aceleración y validación](HARDWARE-EXPORT.md).

## Validación

`npm run check` comprueba sintaxis JavaScript y rutas referenciadas. No sustituye la comprobación funcional en navegador. La CI ejecuta esta validación y la compilación; no incluye pruebas de dispositivo ni asegura compatibilidad con todos los códecs.

Para revisar manualmente: importar ambos archivos, sincronizar, comprobar confianza y desfase, reproducir/pausar/buscar, cambiar volúmenes, recortar, exportar y comprobar el archivo exportado. Revisar también tema automático/claro/oscuro, navegación por teclado y tamaños de pantalla pequeños.
