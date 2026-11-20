# Sync Studio · Simple Video Editor

Editor web de audio y video, en español, con una interfaz inspirada en iOS. Procesa los archivos en el navegador, sin cuentas, subidas ni servicios externos.

## Inicio rápido

Requiere Node.js 22 o posterior. No necesita instalar dependencias.

```sh
npm run dev
```

Abre http://localhost:5173. En PowerShell, si la política de ejecución bloquea `npm`, utiliza `npm.cmd run dev`.

```sh
npm run check    # Verifica sintaxis y referencias a recursos
npm run build    # Genera dist/
npm run preview  # Sirve dist/ localmente
```

## Cómo usarlo

1. Selecciona o arrastra un video con audio de referencia y una grabación externa.
2. Elige la duración del análisis y pulsa **Sincronizar**.
3. Comprueba la confianza y escucha el resultado. Ajusta el desfase en milisegundos si hace falta.
4. Ajusta los volúmenes y el intervalo con la línea de tiempo o los campos numéricos.
5. Exporta la selección como MP4, WebM o WAV, según las capacidades del navegador.

El WAV del menú «Audio completo y FFmpeg» contiene el audio externo sincronizado. El WAV de la barra de exportación contiene la mezcla y el recorte seleccionados.

## Estructura

```text
index.html                 Estructura semántica de la aplicación
src/styles/base.css        Estilos y variables del editor original
src/styles/ios.css         Materiales, composición adaptable y accesibilidad
src/js/app.js              Estado compartido, archivos y grafo de audio
src/js/analysis.js         FFT y correlación para sincronizar
src/js/playback.js         Desfase y reproducción sincronizada
src/js/audio-export.js     WAV completo y comando FFmpeg
src/js/video-export.js     Previsualización, mezcla y exportación WebCodecs
src/js/export-worker.js    Exportación en segundo plano y unión con audio
src/js/timeline.js         Fotogramas, ondas, zoom y selección
src/js/theme.js            Preferencias visuales e inicialización final
public/vendor/             Mediabunny incluido en el HTML original
scripts/                   Servidor local, compilación y verificación
docs/                      Arquitectura y decisiones de diseño
.github/workflows/         Verificación y artefacto de compilación
```

Los scripts clásicos se cargan con `defer` en orden explícito y comparten el estado léxico del editor. No se requiere un framework ni un empaquetador. Consulta [la arquitectura](docs/ARCHITECTURE.md) antes de cambiar el orden de carga.

## Compatibilidad y límites

Usa un navegador moderno desde localhost o HTTPS. La exportación de video depende de WebCodecs y de los codificadores disponibles; la aplicación detecta los formatos compatibles y ofrece WAV como alternativa. Que un archivo aparezca en el selector no garantiza que el navegador pueda decodificarlo. Safari/iOS pueden ofrecer menos formatos que Chromium.

La exportación utiliza un worker, solicita aceleración por hardware con alternativa automática y mezcla el audio por bloques. Los clips compatibles pueden unirse sin recodificación; los demás se renderizan conservando su audio. Cuando el navegador ofrece el selector de guardado, se escribe directamente al disco; la alternativa de descarga conserva el resultado en RAM. Consulta la [investigación y los límites de aceleración](docs/HARDWARE-EXPORT.md).

El análisis necesita una referencia sonora común. Una confianza baja requiere revisión manual. El análisis inicial todavía usa el hilo principal y decodifica archivos completos en memoria: grabaciones grandes pueden consumir mucha RAM o bloquear temporalmente la interfaz. No existe almacenamiento persistente de proyectos.

## Diseño y recursos

Consulta [las fuentes oficiales de Apple y las decisiones de adaptación web](docs/DESIGN.md). Los iconos son SVG del proyecto con convenciones visuales similares a iOS, **no archivos oficiales SF Symbols**. No se incluye la fuente San Francisco; se utiliza la tipografía del sistema cuando está disponible.

## Compilación y alojamiento

GitHub Actions valida el proyecto y publica el directorio compilado como artefacto `sync-studio` en cada ejecución correcta. También puedes generarlo con `npm run build` y servir el contenido de `dist/` en un alojamiento estático con HTTPS.


## Contribuir y licencias

Consulta [CONTRIBUTING.md](CONTRIBUTING.md) y [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). El propietario debe elegir la licencia del código propio antes de distribuirlo como software de código abierto. Se conserva el HTML original como referencia; `scripts/migrate.py` es una herramienta histórica y no debe ejecutarse sobre cambios posteriores.
