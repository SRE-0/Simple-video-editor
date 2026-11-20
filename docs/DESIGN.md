# Adaptación de las guías de Apple

Fuentes oficiales consultadas:

- [Materials](https://developer.apple.com/design/human-interface-guidelines/materials): materiales para establecer jerarquía entre contenido y controles.
- [Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/liquid-glass): lenguaje de materiales de Apple.
- [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility): preferencias del usuario y acceso a controles.
- [SF Symbols](https://developer.apple.com/sf-symbols/): biblioteca oficial e integración con la tipografía del sistema.

## Aplicación en la web

Se reservan la transparencia y el desenfoque más intenso para navegación y barra de exportación. El video conserva un escenario oscuro y estable. La jerarquía usa un título grande, pasos numerados, grupos de ajustes, controles segmentados y botones redondeados. La barra flotante respeta las áreas seguras del dispositivo.

`backdrop-filter` y gradientes aproximan el material: no implementan el renderizador nativo de Liquid Glass. Hay alternativas opacas si falta soporte o el usuario solicita reducir transparencia, modo claro/oscuro, foco visible, regiones de estado y reducción de movimiento. Los campos de inicio, fin y desfase permiten editar sin depender del canvas. Los controles bloqueados usan `inert`, además del estado visual.

## Iconografía

El HTML original ya incluía SVG de cámara, onda, reproducción, recorte y apariencia. Se conservan como recursos vectoriales editables con grosor y escala coherentes con las convenciones de iOS. No son SF Symbols oficiales. Los símbolos de Apple no se sirven automáticamente como iconos web ni se incluye una copia de sus fuentes. Para una aplicación nativa futura, el catálogo equivalente incluye `video`, `waveform`, `play`, `pause`, `scissors`, `sun.max` y `moon`. La integración de recursos oficiales requiere obtenerlos de Apple y comprobar sus condiciones de uso para el destino previsto.

### Menú de unión

Modo y formato son listas cortas de opciones mutuamente excluyentes, por lo que siguen siendo elementos HTML `<select>` nativos: mantienen el teclado, los lectores de pantalla y el selector adaptado al sistema operativo. El control cerrado usa una superficie oscura con bordes suaves, esquinas compactas y chevrón. En navegadores que soportan `appearance: base-select`, el picker abierto usa un material translúcido, opciones espaciadas y una marca de selección; los demás conservan el picker nativo. Esta es una mejora progresiva, no un reemplazo personalizado de la semántica del control.

La referencia de Apple recomienda el pop-up para pocas opciones excluyentes, mostrar un valor inicial útil y dejar claro qué controla. Los materiales separan controles de su fondo, sin imitar literalmente el renderizador Liquid Glass. Para un desplegable web propio, el patrón WAI-ARIA select-only combobox exige gestionar teclado, foco, estados y anuncios accesibles; por eso conviene preferir `<select>` cuando no hace falta una interacción más rica.

Referencias adicionales: [Apple Pop-up buttons](https://developer.apple.com/design/human-interface-guidelines/pop-up-buttons), [WAI-ARIA Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/), y [MDN Customizable select elements](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Customizable_select).
