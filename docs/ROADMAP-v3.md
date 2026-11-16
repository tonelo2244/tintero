# Tintero · Roadmap v3

Tintero Texto a la par con un procesador de texto profesional, pestaña por pestaña.

|                  |                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Versión          | 0.2.0 en `package.json`, formato de archivo versión 3                                         |
| Fecha            | 16 de noviembre de 2026                                                                       |
| Punto de partida | Roadmap v2 terminado: fases 7–11 en `main` (último PR, #22)                                   |
| Tamaño           | ~30.000 líneas de TypeScript/TSX en 259 archivos · ~360 tests en 48 archivos                  |
| Alcance          | Solo **Tintero Texto** (`.tdoc`). Diapositivas y Hojas se tocan cuando se reutiliza algo suyo |
| Uso              | Personal y local, en tu Mac. Sin firma de macOS, sin nube, sin cuentas                        |

## Resumen

El objetivo que has puesto es "dejar Texto igual que Word, con todas las pestañas y funciones operativas": Inicio, Insertar, Dibujar, Diseño, Disposición, Referencias, Correspondencia, Revisar y Vista. Hoy Texto tiene **tres pestañas** (Inicio, Insertar y Asistente) más la contextual de Tabla, y cubre bien lo que se usa a diario: formato de carácter, párrafo, ocho estilos, tablas, imágenes, comentarios, encabezado y pie, paginación propia, buscar y reemplazar, .docx de ida y vuelta y la IA local.

Antes del plan, dos cosas dichas sin rodeos:

1. **Paridad funcional, no paridad total.** Word lleva más de 40 años acumulando funciones y un motor de maquetación propio. "Igual que Word" en el sentido de "cualquier cosa que hago en Word la puedo hacer en Tintero" es alcanzable para el 95 % de lo que usa una persona. "Igual que Word" en el sentido de "cada botón y cada píxel" no lo es, y además no compensa: hay funciones (macros VBA, coautoría en la nube, tabla de autoridades, modelos 3D) que no usarías nunca. Este roadmap marca cada función como **Hacer**, **Más tarde** o **Descartar**, y explica por qué.
2. **Diseño propio.** La cinta se organiza en las mismas pestañas porque es la organización que conoces, pero con nombres de grupos, iconos (`lucide-react`, como ahora) y colores de Tintero. Nada de iconos, nombres de producto ni capturas de Microsoft.

El orden está pensado igual que el v2: primero los **cimientos** que desbloquean todo lo demás (una cinta con registro de comandos y un modelo de página configurable), después **lo que más se nota al escribir** (estilos de verdad, navegación, disposición) y al final lo que se usa menos o depende de lo anterior (referencias, revisión, correspondencia, dibujo).

| Fase                                   | Contenido                                                                                       | Valor    | Esfuerzo    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- | -------- | ----------- |
| 12 · Cimientos de la cinta y la página | Las 9 pestañas, registro de comandos, tamaño/orientación/márgenes, saltos de página, regla      | Muy alto | 2–3 semanas |
| 13 · Inicio completo y estilos reales  | Estilos con nombre editables, copiar formato, mayúsculas, espaciado, bordes, listas multinivel  | Muy alto | 3–4 semanas |
| 14 · Vista y navegación                | Panel de navegación, modos de vista, zoom por página, dividir ventana, leer en voz alta         | Alto     | 1–2 semanas |
| 15 · Disposición y secciones           | Secciones, columnas, párrafos partidos entre hojas, tablas largas, encabezados por sección      | Alto     | 4–6 semanas |
| 16 · Insertar: objetos y vínculos      | Vínculos, marcadores, símbolos, ecuaciones, cuadros de texto, formas, ajuste de texto, gráficos | Alto     | 3–5 semanas |
| 17 · Referencias                       | Tabla de contenido, notas al pie y al final, leyendas, citas y bibliografía                     | Alto     | 3–4 semanas |
| 18 · Revisar                           | Control de cambios, comparar versiones, gramática/sinónimos/traducir con IA local, proteger     | Alto     | 4–6 semanas |
| 19 · Diseño                            | Temas de documento, conjuntos de estilos, marca de agua, color y bordes de página               | Medio    | 1–2 semanas |
| 20 · Correspondencia                   | Combinar con una hoja de Tintero, .xlsx o .csv; sobres y etiquetas                              | Medio    | 2–3 semanas |
| 21 · Dibujar                           | Tinta a mano alzada sobre la hoja, rotulador, borrador, tinta a forma                           | Bajo     | 1–2 semanas |

Total orientativo: **6–9 meses** a ritmo de tardes y fines de semana. Por eso la sección 5 propone un camino corto con lo que más rinde.

## 1. Qué tiene Texto hoy

Comprobado en el código de `src/renderer/src/apps/writer/`, no en el README.

| Área              | Qué hay                                                                                                                                                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pestaña Inicio    | Pegar, cortar, copiar; fuente y tamaño, aumentar/disminuir, borrar formato; negrita, cursiva, subrayado, tachado, subíndice, superíndice, resaltado y color; viñetas, numeración, sangría, marcas de párrafo, alineación, interlineado; galería de 8 estilos fijos; buscar y reemplazar |
| Pestaña Insertar  | Tabla (selector de cuadrícula), imagen, línea horizontal, fecha, cita, bloque de código, comentario, encabezado y pie                                                                                                                                                                   |
| Pestaña Tabla     | Contextual: insertar y borrar filas/columnas, combinar y dividir celdas, fila de encabezado, columnas redimensionables                                                                                                                                                                  |
| Pestaña Asistente | Corregir, reescribir, resumir (map-reduce para documentos largos), preguntar a tus documentos (RAG local con citas), crear presentación                                                                                                                                                 |
| Página            | Paginación propia (`Pagination.ts` + `pageLayout.ts`), **A4 fija con márgenes de 2,5 cm**; encabezado y pie de texto plano con `{página}` y `{páginas}` al imprimir                                                                                                                     |
| Barra de estado   | Palabras, caracteres, zoom                                                                                                                                                                                                                                                              |
| Ortografía        | Corrector del sistema (Chromium) con sugerencias en el clic derecho                                                                                                                                                                                                                     |
| Archivos          | `.tdoc` (formato v3), exportar a PDF y .docx, importar .docx con formato directo, encabezado, pie y comentarios                                                                                                                                                                         |

Lo que falta no es poco, pero la base es buena: el editor es Tiptap 3 (ProseMirror), la lógica pura vive en `model/` con tests y la cinta (`ui/Ribbon.tsx`) ya tiene grupos, filas, desplegables y botones grandes. Eso significa que casi todo lo que viene es **añadir**, no reescribir.

### Dos limitaciones que condicionan el orden

- **La página es una constante.** `PAGE` en `model/pageLayout.ts` es A4 con 2,5 cm. Márgenes, orientación, tamaño, columnas, secciones, marca de agua y bordes de página dependen de que eso pase a ser un dato del documento. Por eso va en la fase 12.
- **Los estilos son botones, no datos.** `PARAGRAPH_STYLES` aplica un nodo o un atributo, pero el documento no guarda qué es "Título 1" (fuente, tamaño, color, espaciado). Sin un modelo de estilos no hay "modificar estilo", ni temas (Diseño), ni tabla de contenido fiable (Referencias), ni buena ida y vuelta con `styles.xml` de .docx. Por eso va en la fase 13.

## 2. Comparación pestaña por pestaña

Leyenda: **Hecho** · **Parcial** (existe pero incompleto) · **Falta** (con la fase que lo trae) · **Descartar** (con el motivo). La columna Valor es para **tu uso personal**, no para un usuario corporativo.

### Inicio

| Función de la cinta                                   | Tintero hoy | Plan      | Valor    | Nota                                                                                    |
| ----------------------------------------------------- | ----------- | --------- | -------- | --------------------------------------------------------------------------------------- |
| Pegar, cortar, copiar                                 | Hecho       |           |          | Falta "Pegado especial" (solo texto, mantener formato): fase 13                         |
| Copiar formato (brocha)                               | Falta       | Fase 13   | Alto     | Guardar marcas y atributos de párrafo y aplicarlos al siguiente clic                    |
| Fuente, tamaño, aumentar/disminuir, borrar formato    | Hecho       |           |          |                                                                                         |
| Cambiar mayúsculas y minúsculas                       | Falta       | Fase 13   | Medio    | Tipo oración, minúsculas, MAYÚSCULAS, Tipo Título; función pura con tests               |
| Negrita, cursiva, subrayado, tachado, sub/superíndice | Hecho       |           |          | Subrayado doble/punteado: más tarde                                                     |
| Efectos de texto (sombra, contorno)                   | Falta       | Más tarde | Bajo     | Es el antiguo WordArt; casi nunca se usa en documentos serios                           |
| Resaltado y color de fuente                           | Hecho       |           |          |                                                                                         |
| Viñetas y numeración                                  | Parcial     | Fase 13   | Alto     | Faltan biblioteca de viñetas, formato de número (1., a), i.), I.) y continuar/reiniciar |
| Lista multinivel                                      | Falta       | Fase 13   | Alto     | Vinculada a los estilos de título (1, 1.1, 1.1.1)                                       |
| Sangría y alineación                                  | Hecho       |           |          | Sangría de primera línea y francesa: fase 12, con la regla                              |
| Ordenar párrafos                                      | Falta       | Fase 13   | Bajo     | Barato: ordenar los párrafos seleccionados, como en la fase 9 de Hojas                  |
| Mostrar marcas de párrafo                             | Hecho       |           |          |                                                                                         |
| Interlineado                                          | Parcial     | Fase 13   | Alto     | Falta espaciado antes y después del párrafo (es lo que más cambia el aspecto)           |
| Sombreado y bordes de párrafo                         | Falta       | Fase 13   | Medio    | Atributos de párrafo nuevos; .docx los tiene (`w:shd`, `w:pBdr`)                        |
| Galería de estilos                                    | Parcial     | Fase 13   | Muy alto | 8 estilos fijos; falta modificar, crear, Título 4–6 y panel de estilos                  |
| Buscar, reemplazar                                    | Hecho       |           |          | Buscar con formato y comodines: más tarde                                               |
| Seleccionar (todo, texto con formato similar)         | Falta       | Fase 13   | Bajo     |                                                                                         |
| Dictar                                                | Falta       | Fase 18   | Medio    | Con Whisper local (whisper.cpp); interesante para tu perfil de AI Engineer              |

### Insertar

| Función                           | Tintero hoy | Plan       | Valor    | Nota                                                                                         |
| --------------------------------- | ----------- | ---------- | -------- | -------------------------------------------------------------------------------------------- |
| Portada                           | Hecho       | Fase 16    | Bajo     | Una plantilla de bloque; reutiliza la galería de plantillas del inicio                       |
| Página en blanco, salto de página | Falta       | Fase 12    | Muy alto | Hoy no se puede forzar un salto de página. Es lo primero que hay que añadir                  |
| Tabla                             | Hecho       |            |          | "Convertir texto en tabla" y estilos de tabla: fase 16                                       |
| Imagen                            | Hecho       | Fase 16    | Alto     | Solo en línea: falta tamaño exacto, recortar, girar, ajuste de texto y texto alternativo     |
| Formas                            | Hecho       | Fase 16    | Medio    | Reutilizar las formas SVG de Diapositivas                                                    |
| Iconos, modelos 3D, SmartArt      | Falta       | Descartar  |          | Los iconos de Office tienen licencia; 3D y SmartArt casi no se usan en documentos            |
| Gráfico                           | Hecho       | Fase 16    | Medio    | Reutilizar los gráficos SVG de Hojas (`sheets/editor/charts`) con una tabla de datos         |
| Captura de pantalla               | Falta       | Más tarde  | Bajo     | `desktopCapturer` de Electron; pide permisos de grabación en macOS                           |
| Vínculo                           | Hecho       | Fase 16    | Alto     | La extensión `link` ya está en StarterKit, pero no hay botón ni diálogo                      |
| Marcador y referencia cruzada     | Parcial     | Fase 16/17 | Medio    | Marcador en la 16; "ver página N" necesita la paginación de la 15                            |
| Comentario                        | Hecho       |            |          | Responder y resolver: fase 18                                                                |
| Encabezado, pie, número de página | Parcial     | Fase 15    | Alto     | Hoy texto plano en un panel lateral; falta editarlo sobre la hoja, con formato y por sección |
| Cuadro de texto                   | Hecho       | Fase 16    | Medio    | Objeto flotante; comparte la capa de objetos con formas e imágenes                           |
| Elementos rápidos, campos         | Hecho       | Fase 16    | Medio    | La fecha se inserta como texto fijo; faltan campos que se actualizan (fecha, autor, página)  |
| WordArt                           | Falta       | Descartar  |          | Efectos de texto (fase 13 o más tarde) cubren lo razonable                                   |
| Letra capital                     | Hecho       | Fase 16    | Bajo     | CSS `initial-letter` / `float`; .docx `w:framePr`                                            |
| Línea de firma, objeto incrustado | Falta       | Descartar  |          | Firma digital y OLE no tienen sentido en una app local sin certificados                      |
| Ecuación                          | Hecho       | Fase 16    | Medio    | Escribir en LaTeX y pintar con KaTeX/MathML. **Dependencia nueva: decisión tuya**            |
| Símbolo                           | Hecho       | Fase 16    | Medio    | Selector con los más usados (©, €, →, ±, letras griegas) y búsqueda por nombre               |

### Dibujar

| Función                            | Tintero hoy | Plan      | Valor    | Nota                                                                                        |
| ---------------------------------- | ----------- | --------- | -------- | ------------------------------------------------------------------------------------------- |
| Lápices, rotuladores, borrador     | Falta       | Fase 21   | Bajo     | Capa SVG por hoja con trazos de Pointer Events. Con ratón o trackpad se usa poco            |
| Lienzo de dibujo                   | Falta       | Fase 21   | Bajo     | Un bloque del documento con su propia capa de tinta: más fácil de anclar que la tinta libre |
| Tinta a forma, tinta a matemáticas | Falta       | Descartar | Muy bajo | Necesita reconocimiento de trazos; mucho trabajo para un uso anecdótico sin lápiz           |
| Reproducir tinta                   | Falta       | Descartar |          |                                                                                             |

**Honestamente:** Dibujar es la pestaña que menos aporta en un Mac sin lápiz. Va la última y en versión mínima. Si quieres, se puede saltar y la cinta no tendría esa pestaña.

### Diseño

| Función                                 | Tintero hoy | Plan    | Valor | Nota                                                                                   |
| --------------------------------------- | ----------- | ------- | ----- | -------------------------------------------------------------------------------------- |
| Temas (colores + fuentes del documento) | Falta       | Fase 19 | Medio | Un tema cambia los valores de los estilos. Depende del modelo de estilos de la fase 13 |
| Conjuntos de estilos                    | Falta       | Fase 19 | Medio | Juegos de estilos predefinidos (Clásico, Moderno, Informe…) con nombres propios        |
| Colores y fuentes del tema              | Falta       | Fase 19 | Medio | Reutilizar la idea de temas de Diapositivas (`slides/model/themes.ts`)                 |
| Espaciado de párrafo predefinido        | Falta       | Fase 19 | Medio | Compacto, normal, abierto: cambia el estilo Normal                                     |
| Marca de agua                           | Falta       | Fase 19 | Medio | Texto o imagen detrás de cada hoja; pantalla y `@page`                                 |
| Color de página                         | Falta       | Fase 19 | Bajo  |                                                                                        |
| Bordes de página                        | Falta       | Fase 19 | Bajo  |                                                                                        |

### Disposición

| Función                                                                          | Tintero hoy | Plan       | Valor    | Nota                                                                                     |
| -------------------------------------------------------------------------------- | ----------- | ---------- | -------- | ---------------------------------------------------------------------------------------- |
| Márgenes                                                                         | Falta       | Fase 12    | Muy alto | Hoy fijos a 2,5 cm. Predefinidos (normal, estrecho, moderado, ancho) y personalizados    |
| Orientación                                                                      | Falta       | Fase 12    | Alto     | Vertical u horizontal para todo el documento; por sección en la 15                       |
| Tamaño de papel                                                                  | Falta       | Fase 12    | Alto     | A4, A5, Carta, Legal y personalizado                                                     |
| Columnas                                                                         | Falta       | Fase 15    | Medio    | Difícil con paginación propia: ver la fase 15                                            |
| Saltos (página, columna, sección)                                                | Falta       | Fase 12/15 | Muy alto | Salto de página en la 12; de columna y sección en la 15                                  |
| Números de línea                                                                 | Falta       | Más tarde  | Bajo     | Útil en textos legales o académicos                                                      |
| Guiones (división de palabras)                                                   | Falta       | Fase 15    | Medio    | `hyphens: auto` con `lang="es"` ya funciona en Chromium: casi gratis                     |
| Sangría y espaciado con valores exactos                                          | Parcial     | Fase 13    | Alto     | Hoy la sangría va en pasos de 1,27 cm y no hay espaciado antes/después                   |
| Posición, ajuste de texto, traer adelante, enviar atrás, alinear, agrupar, girar | Falta       | Fase 16    | Medio    | Lo mismo que se hizo en Diapositivas en la fase 11; reutilizar `slides/model/arrange.ts` |
| Panel de selección                                                               | Falta       | Más tarde  | Bajo     |                                                                                          |

### Referencias

| Función                                             | Tintero hoy | Plan      | Valor    | Nota                                                                                             |
| --------------------------------------------------- | ----------- | --------- | -------- | ------------------------------------------------------------------------------------------------ |
| Tabla de contenido                                  | Falta       | Fase 17   | Muy alto | Se genera de los títulos, con números de página que ya calcula la paginación; botón "Actualizar" |
| Notas al pie                                        | Falta       | Fase 17   | Alto     | Las notas al final son fáciles; al pie de **cada hoja** dependen de la paginación de la 15       |
| Notas al final                                      | Falta       | Fase 17   | Alto     |                                                                                                  |
| Citas y bibliografía                                | Falta       | Fase 17   | Medio    | Fuentes guardadas en el documento; estilos APA e ISO 690 hechos a mano (sin CSL completo)        |
| Insertar título (leyenda) e índice de ilustraciones | Falta       | Fase 17   | Medio    | "Figura 1", "Tabla 2" numeradas automáticamente                                                  |
| Referencia cruzada                                  | Falta       | Fase 17   | Medio    | A títulos, leyendas y marcadores                                                                 |
| Índice alfabético                                   | Falta       | Más tarde | Bajo     | Marcar entradas y generar el índice con páginas                                                  |
| Tabla de autoridades                                | Falta       | Descartar |          | Solo se usa en documentos jurídicos de EE. UU.                                                   |
| Búsqueda inteligente / investigador                 | Falta       | Descartar |          | Servicios en la nube; lo cubre "Preguntar a tus documentos"                                      |

### Correspondencia

| Función                                                          | Tintero hoy | Plan      | Valor | Nota                                                                                |
| ---------------------------------------------------------------- | ----------- | --------- | ----- | ----------------------------------------------------------------------------------- |
| Seleccionar destinatarios                                        | Falta       | Fase 20   | Medio | Origen: una hoja `.tsheet`, un `.xlsx` o un `.csv`. Reutiliza los lectores de Hojas |
| Insertar campo combinado, bloque de direcciones, línea de saludo | Falta       | Fase 20   | Medio | Un nodo en línea `«Nombre»` que guarda el nombre de la columna                      |
| Vista previa de resultados                                       | Falta       | Fase 20   | Medio | Recorrer registros sin generar nada                                                 |
| Finalizar y combinar                                             | Falta       | Fase 20   | Medio | Un `.tdoc` por registro, un único documento o un PDF                                |
| Reglas (Si…Entonces…, Saltar registro)                           | Falta       | Más tarde | Bajo  | Puede reutilizar el evaluador de fórmulas de Hojas                                  |
| Sobres y etiquetas                                               | Falta       | Fase 20   | Bajo  | Plantillas de tamaño de página (necesitan la fase 12)                               |
| Enviar por correo                                                | Falta       | Descartar |       | Necesita cuenta de correo; fuera de una app local                                   |

### Revisar

| Función                                        | Tintero hoy | Plan      | Valor    | Nota                                                                                                         |
| ---------------------------------------------- | ----------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| Ortografía                                     | Parcial     | Fase 18   | Alto     | Hoy solo en el clic derecho; falta un panel que recorra los errores                                          |
| Gramática y estilo                             | Parcial     | Fase 18   | Alto     | "Corregir" del Asistente lo hace por selección; falta un panel con sugerencias una a una, con evals          |
| Sinónimos                                      | Falta       | Fase 18   | Medio    | Con la IA local (y una lista pequeña sin conexión de reserva)                                                |
| Contar palabras                                | Parcial     | Fase 14   | Bajo     | Barra de estado; falta el diálogo con páginas, párrafos y líneas                                             |
| Leer en voz alta                               | Falta       | Fase 14   | Medio    | `speechSynthesis` del sistema: voces españolas de macOS, sin dependencias                                    |
| Traducir                                       | Falta       | Fase 18   | Medio    | Con la IA local, conservando el formato (reutiliza `inlineMarks.ts` de la fase 8)                            |
| Comentarios: nuevo, borrar, anterior/siguiente | Parcial     | Fase 18   | Alto     | Faltan responder, resolver y navegar entre comentarios                                                       |
| Control de cambios                             | Falta       | Fase 18   | Muy alto | Marcas de insertado y borrado con autor y fecha, aceptar/rechazar, ida y vuelta con .docx (`w:ins`, `w:del`) |
| Comparar dos versiones                         | Falta       | Fase 18   | Alto     | Diff de bloques y palabras; el resultado son cambios controlados                                             |
| Proteger documento, restringir edición         | Falta       | Más tarde | Bajo     | Solo lectura sí; contraseñas no tienen sentido para uso personal local                                       |
| Comprobar accesibilidad                        | Falta       | Fase 18   | Medio    | Imágenes sin texto alternativo, saltos de nivel en títulos, tablas sin encabezado                            |

### Vista

| Función                                           | Tintero hoy | Plan      | Valor    | Nota                                                                               |
| ------------------------------------------------- | ----------- | --------- | -------- | ---------------------------------------------------------------------------------- |
| Diseño de impresión                               | Hecho       |           |          | Es la vista actual, con hojas reales desde la fase 11                              |
| Modo lectura (enfoque)                            | Falta       | Fase 14   | Medio    | Sin cinta, columna cómoda, tema oscuro opcional                                    |
| Diseño web / borrador                             | Falta       | Fase 14   | Medio    | Quitar la paginación (la extensión ya está separada del esquema, es trivial)       |
| Esquema                                           | Falta       | Fase 14   | Medio    | Mostrar solo títulos, plegar y mover secciones enteras                             |
| Regla                                             | Falta       | Fase 12   | Alto     | Márgenes y sangrías arrastrables; tabulaciones en la fase 13                       |
| Líneas de cuadrícula                              | Falta       | Más tarde | Bajo     |                                                                                    |
| Panel de navegación                               | Falta       | Fase 14   | Muy alto | Títulos del documento en un panel lateral; clic para saltar, arrastrar para mover  |
| Zoom: una página, varias páginas, ancho de página | Parcial     | Fase 14   | Medio    | Hoy hay zoom libre en la barra de estado                                           |
| Nueva ventana, organizar, dividir                 | Falta       | Fase 14   | Bajo     | Dividir la vista del mismo documento: dos `EditorView` sobre el mismo estado       |
| Macros                                            | Falta       | Descartar |          | VBA no tiene sentido aquí. El equivalente moderno es el tool calling del Asistente |

### Lo que se descarta del todo, y por qué

| Función de Word                                          | Motivo                                                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Compartir, coautoría en tiempo real, guardado en la nube | Tintero es local por diseño. Sería otro producto (servidor, cuentas, CRDT)                          |
| Macros VBA y complementos de la tienda                   | Riesgo de seguridad y mucho trabajo; el Asistente con herramientas cubre la automatización          |
| Iconos, imágenes de archivo, plantillas en línea         | Licencias de terceros y conexión a servicios externos                                               |
| SmartArt, modelos 3D, vídeo en línea                     | Muy poco uso en documentos; mucho trabajo de render                                                 |
| Línea de firma digital, objetos OLE incrustados          | Necesitan certificados o Windows; no aplican                                                        |
| Tabla de autoridades                                     | Nicho jurídico de EE. UU.                                                                           |
| Paridad píxel a píxel con Word                           | Word tiene su propio motor de maquetación y métricas de fuentes; Chromium nunca coincidirá al 100 % |

## 3. Las fases

Cada fase sigue las reglas que ya funcionan en el proyecto: **una rama y un PR por fase** con commits por funcionalidad; lógica pura en `model/` con tests y la interfaz en `editor/`; cada función nueva del documento con su **ida y vuelta en .docx** y un archivo en `fixtures/office/`; y un e2e por fase. Si una fase cambia el formato `.tdoc`, sube `FILE_FORMAT_VERSION` con campos opcionales para que los archivos antiguos se sigan leyendo.

Y una regla de interfaz: **ningún botón muerto**. Una pestaña aparece cuando tiene al menos un grupo que funciona, y cada fase la va llenando. Un botón deshabilitado que dice "próximamente" es peor que no tenerlo: el usuario lo pulsa, no pasa nada y deja de confiar en la cinta.

### Fase 12 · Cimientos de la cinta y de la página

Objetivo: que añadir un botón sea barato y que la página deje de ser una constante. Todo lo demás se apoya en esto.

| Tarea                               | Cómo (enfoque propuesto)                                                                                                                                                                                                                                                                                                                                                                         | Prioridad |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| Registro de comandos                | Un `model/commands.ts` con `{ id, label, shortcut?, run(editor), isActive?, isEnabled? }`. La cinta, el menú nativo, los atajos y el Asistente (tool calling) usan **los mismos comandos**. Hoy cada botón lleva su `onClick` en `WriterRibbon.tsx` (347 líneas, y crecerá a varios miles). Con el registro, la cinta solo pinta ids. Es la decisión de arquitectura más importante del roadmap. | Alta      |
| Una pestaña por archivo             | `editor/ribbon/HomeTab.tsx`, `InsertTab.tsx`, `LayoutTab.tsx`… y la lista de pestañas como datos. Las pestañas contextuales (Tabla, y más tarde Imagen y Encabezado) siguen el mismo patrón que la Tabla actual.                                                                                                                                                                                 | Alta      |
| Configuración de página             | `WriterContent.pageSetup?: { size, orientation, margins }` (opcional; sin él, A4 con 2,5 cm como hoy). `pageLayout.ts` recibe la configuración en vez de leer `PAGE`, y `printPageCss` escribe `@page { size; margin }` con los mismos valores. Formato v4.                                                                                                                                      | Alta      |
| Pestaña Disposición (primera parte) | Márgenes (predefinidos y personalizados), orientación, tamaño de papel. Exportar e importar `w:sectPr` (`w:pgSz`, `w:pgMar`) en .docx.                                                                                                                                                                                                                                                           | Alta      |
| Salto de página                     | Nodo de bloque `pageBreak` que la paginación respeta (`paginate` ya devuelve en qué bloque empieza cada hoja; basta con forzarlo). Atajo Cmd+Enter. .docx `w:br w:type="page"`.                                                                                                                                                                                                                  | Alta      |
| Regla horizontal                    | Muestra los márgenes y la sangría del párrafo actual; arrastrar cambia los atributos. Sangría de primera línea y francesa como atributos nuevos de `ParagraphFormat`.                                                                                                                                                                                                                            | Media     |

Esfuerzo: 2–3 semanas. Lo que aprendes: diseño de un registro de comandos (el patrón _Command_, el mismo que usan VS Code y los editores serios), y cómo cambiar un modelo de datos sin romper archivos guardados.

### Fase 13 · Inicio completo y estilos reales

Objetivo: que Inicio haga todo lo que hace la de Word y que los estilos sean datos del documento.

| Tarea                         | Cómo (enfoque propuesto)                                                                                                                                                                                                                                                                                                                                                                                   | Prioridad |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Modelo de estilos             | `WriterContent.styles`: cada estilo con id, nombre, tipo (párrafo o carácter), "basado en" y propiedades (fuente, tamaño, color, negrita, espaciado antes/después, interlineado, sangría, nivel de esquema). Se pinta como CSS generado (`.writer-content [data-style="heading-1"] {…}`), así cambiar un estilo cambia todo el documento sin tocar los nodos. Función pura `resolveStyle` con la herencia. | Alta      |
| Modificar y crear estilos     | Clic derecho en la galería: "Modificar", "Actualizar para que coincida con la selección" y "Nuevo estilo". Panel de estilos con todos. Títulos 1–6.                                                                                                                                                                                                                                                        | Alta      |
| Estilos en .docx              | Leer y escribir `word/styles.xml`. Hoy se pierde el aspecto de los títulos al abrir un documento de Word; con esto se conserva.                                                                                                                                                                                                                                                                            | Alta      |
| Espaciado antes y después     | Atributos de párrafo y menú en el grupo Párrafo, con "Quitar espacio después del párrafo".                                                                                                                                                                                                                                                                                                                 | Alta      |
| Copiar formato                | Un clic aplica una vez, doble clic se queda fijo hasta Esc. Copia marcas y atributos de párrafo.                                                                                                                                                                                                                                                                                                           | Alta      |
| Listas                        | Biblioteca de viñetas y formatos de número, continuar o reiniciar numeración, lista multinivel ligada a los títulos.                                                                                                                                                                                                                                                                                       | Alta      |
| Mayúsculas, sombreado, bordes | Cambiar mayúsculas (función pura con tests, respetando acentos y la "ñ"), sombreado y bordes de párrafo.                                                                                                                                                                                                                                                                                                   | Media     |
| Tabulaciones                  | Topes de tabulación por párrafo (izquierda, centro, derecha, decimal) en la regla. Es lo que hace falta para índices "Capítulo ...... 12".                                                                                                                                                                                                                                                                 | Media     |
| Pegado especial y Seleccionar | Pegar solo texto / mantener formato; seleccionar texto con formato similar. Ordenar párrafos.                                                                                                                                                                                                                                                                                                              | Baja      |

Esfuerzo: 3–4 semanas. Es la fase que más cambia la sensación de "esto es un procesador de texto de verdad".

### Fase 14 · Vista y navegación

Objetivo: moverse por documentos largos tan rápido como en Word. Fase corta y muy agradecida.

| Tarea                | Cómo                                                                                                                                                            | Prioridad |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Panel de navegación  | Árbol de títulos (función pura sobre el JSON del documento), clic para saltar, arrastrar para mover una sección entera, y una pestaña "Páginas" con miniaturas. | Alta      |
| Modos de vista       | Diseño de impresión (actual), Borrador (sin `Pagination`), Esquema (solo títulos, plegables) y Lectura (sin cinta, ancho cómodo).                               | Media     |
| Zoom por página      | Una página, varias páginas, ancho de página, 100 %. Reutiliza `usePageMetrics`.                                                                                 | Media     |
| Dividir ventana      | Dos vistas del mismo documento (dos `EditorView` sobre el mismo `EditorState` vía transacciones compartidas).                                                   | Baja      |
| Leer en voz alta     | `speechSynthesis` resaltando la frase que se lee.                                                                                                               | Media     |
| Recuento de palabras | Diálogo con páginas, palabras, caracteres con y sin espacios, párrafos y líneas.                                                                                | Baja      |

Esfuerzo: 1–2 semanas.

### Fase 15 · Disposición avanzada y secciones

Objetivo: documentos con partes distintas (una sección horizontal, una con dos columnas) y una paginación que no deja huecos.

Es **la fase más difícil del roadmap**, y conviene saberlo antes. Word es un motor de maquetación por páginas; ProseMirror es un editor de flujo continuo al que la fase 11 le añadió hojas. La paginación actual mueve bloques enteros. Partir un párrafo entre dos hojas, poner notas al pie al final de cada hoja o maquetar columnas exige medir **líneas**, no bloques.

| Tarea                                   | Cómo (enfoque propuesto)                                                                                                                                                                                                                       | Prioridad |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Párrafos partidos entre hojas           | Medir con `Range.getClientRects()` las líneas del bloque que cruza el límite y meter una decoración de salto **dentro** del párrafo (widget en la posición del primer carácter de la línea que no cabe). Viudas y huérfanas (mínimo 2 líneas). | Alta      |
| Tablas largas                           | Partir por filas, repitiendo la fila de encabezado si está marcada.                                                                                                                                                                            | Alta      |
| Secciones                               | Nodo `sectionBreak` con su propia configuración (orientación, márgenes, columnas, encabezado/pie). `paginate` trabaja por secciones. .docx: un `w:sectPr` por sección.                                                                         | Media     |
| Encabezado y pie editados sobre la hoja | Doble clic en el margen abre un mini editor Tiptap con formato; primera página distinta, pares e impares distintas; pestaña contextual "Encabezado y pie".                                                                                     | Media     |
| Columnas                                | CSS `columns` dentro de la sección y paginación que sabe que una hoja tiene N columnas. Salto de columna.                                                                                                                                      | Media     |
| Guiones                                 | `hyphens: auto` con `lang="es"`, como opción del documento.                                                                                                                                                                                    | Baja      |

Esfuerzo: 4–6 semanas, con riesgo de más.

> **Una decisión que te toca a ti.** En la fase 11 descartamos `tiptap-pagination-plus` porque meter una dependencia es tu decisión. Antes de empezar esta fase merece la pena volver a mirarlo (y alternativas como el modo paginado de las versiones de pago de Tiptap). Si alguna parte bien los párrafos y respeta secciones, ahorra semanas. Si no, el enfoque propio de arriba funciona, pero es trabajo fino. Mi recomendación: un _spike_ de dos días para comparar antes de decidir.

> **Estado (noviembre de 2026): hecha con la paginación propia.** Se miró `tiptap-pagination-plus` 3.1: reparte bloques con elementos flotantes y no tiene secciones, orientación por sección ni columnas, así que no ahorraba la parte difícil. Queda pendiente, para más adelante: el encabezado y el pie son texto plano (sin formato) y comunes a todas las secciones; unas columnas largas empiezan hoja aunque haya un título justo antes; los títulos dentro de columnas no salen en el panel de navegación; y Varias páginas se desactiva si el documento tiene secciones.

### Fase 16 · Insertar: objetos y vínculos

Objetivo: completar Insertar y la parte de "Organizar" de Disposición. Mucho se reutiliza de Diapositivas y Hojas.

| Tarea                                                                                    | Cómo                                                                                                                                                                                   | Prioridad |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Vínculos y marcadores                                                                    | Diálogo para la extensión `link` existente (Cmd+K); nodo de marcador con nombre; vínculo a un marcador.                                                                                | Alta      |
| Imágenes de verdad                                                                       | Tamaño exacto con proporción, recortar, girar, texto alternativo y **ajuste de texto** (en línea, cuadrado, arriba y abajo, detrás, delante). Pestaña contextual "Imagen".             | Alta      |
| Capa de objetos flotantes                                                                | Imágenes no en línea, formas y cuadros de texto como nodos anclados a un párrafo con posición relativa. Traer adelante, enviar atrás, alinear y agrupar con `slides/model/arrange.ts`. | Media     |
| Formas y cuadros de texto                                                                | Las formas SVG de Diapositivas; cuadro de texto con su propio contenido editable.                                                                                                      | Media     |
| Símbolos y ecuaciones                                                                    | Selector de símbolos; ecuaciones escritas en LaTeX y pintadas con KaTeX (dependencia nueva: decisión tuya; alternativa sin dependencias: MathML nativo, más limitado al escribir).     | Media     |
| Campos                                                                                   | Fecha que se actualiza, número de página, número de páginas, nombre del archivo, autor. Nodo en línea con un tipo.                                                                     | Media     |
| Gráficos                                                                                 | Nodo que guarda una tabla pequeña de datos y se pinta con los componentes de `sheets/editor/charts`.                                                                                   | Media     |
| Portada, letra capital, tabla desde texto, estilos de tabla, bordes y sombreado de celda | Piezas pequeñas; completan Insertar y la pestaña Tabla.                                                                                                                                | Baja      |

Esfuerzo: 3–5 semanas.

> **Estado (noviembre de 2026): hecha.** Ecuaciones con KaTeX (elegido frente a MathML) y, al .docx, como ecuaciones nativas de Word con `docx/math`; formas, cuadros de texto y gráficos también nativos (`docx/shapes`, `docx/charts`). Las imágenes siguen siendo bloques anclados a su sitio, así que los documentos anteriores se abren igual. Queda pendiente: **agrupar** objetos; el texto rodea la caja del objeto sin girar; al importar un .docx, las imágenes llegan en línea (sin ajuste, recorte ni giro) y los gráficos, formas y ecuaciones de Word no se leen todavía; y la letra capital de un .docx importado llega como un párrafo aparte.

### Fase 17 · Referencias

Objetivo: poder escribir un trabajo de clase o una memoria de prácticas entera en Tintero. Tiene valor directo para ti este curso.

| Tarea                           | Cómo                                                                                                                                                                                           | Prioridad |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Tabla de contenido              | Nodo `toc` generado de los títulos (función pura: títulos + números de página de la paginación), con hipervínculos, puntos de relleno (tabulaciones de la fase 13) y botón "Actualizar tabla". | Alta      |
| Notas al final                  | Marca de referencia numerada en el texto; las notas al final del documento. Renumeración automática.                                                                                           | Alta      |
| Notas al pie                    | Las mismas notas, colocadas al pie de la hoja donde está la referencia. Depende de la fase 15 (reservar alto al final de cada hoja).                                                           | Alta      |
| Leyendas y referencias cruzadas | "Figura N", "Tabla N" automáticas; índice de ilustraciones; "ver la figura 3 en la página 12".                                                                                                 | Media     |
| Citas y bibliografía            | Fuentes guardadas en el documento (libro, artículo, web), estilos APA 7 e ISO 690 hechos a mano con tests, bibliografía generada. Importar desde BibTeX como extra.                            | Media     |
| .docx                           | TOC como campo (`w:fldSimple TOC`), `footnotes.xml`, `endnotes.xml`.                                                                                                                           | Media     |

Esfuerzo: 3–4 semanas.

### Fase 18 · Revisar

Objetivo: trabajar con correcciones como en Word, y aprovechar la IA local donde Word usa la nube.

| Tarea                           | Cómo                                                                                                                                                                                                                                                                                                                               | Prioridad |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Control de cambios              | Con el modo activo, un _plugin_ de ProseMirror intercepta las transacciones: lo que se escribe lleva la marca `insertion`, lo que se borra no se borra sino que lleva `deletion` (autor y fecha). Aceptar/rechazar uno o todos. Panel de cambios. .docx `w:ins`/`w:del` de ida y vuelta. Es un ejercicio excelente de ProseMirror. | Alta      |
| Comentarios completos           | Responder, resolver, anterior y siguiente.                                                                                                                                                                                                                                                                                         | Alta      |
| Comparar documentos             | Diff de dos `.tdoc` o `.docx` (por bloques y luego por palabras, algoritmo de Myers); el resultado es un documento con cambios controlados.                                                                                                                                                                                        | Media     |
| Panel de ortografía y gramática | Recorrer errores uno a uno. Ortografía del sistema; gramática y estilo con la IA local, **medida en el banco de evals** de la fase 8 antes de enseñarla.                                                                                                                                                                           | Media     |
| Sinónimos y traducir            | Con la IA local; traducir conservando el formato con `inlineMarks.ts`.                                                                                                                                                                                                                                                             | Media     |
| Dictado                         | Whisper local (`whisper.cpp` como runtime aparte, igual que llama.cpp en la fase 8). Opcional; muy buen proyecto de AI Engineering.                                                                                                                                                                                                | Baja      |
| Accesibilidad y proteger        | Comprobador (alt, títulos, tablas); modo solo lectura.                                                                                                                                                                                                                                                                             | Baja      |

Esfuerzo: 4–6 semanas (2–3 sin dictado ni comparar).

### Fase 19 · Diseño

Objetivo: cambiar el aspecto de todo el documento en un clic. Corta, porque se apoya en los estilos de la 13.

| Tarea                                   | Cómo                                                                                                                                    | Prioridad |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Temas de documento                      | Un tema = paleta + par de fuentes (títulos y cuerpo). Los estilos usan "color de tema 1" o "fuente de títulos" en vez de valores fijos. | Media     |
| Conjuntos de estilos y espaciado        | Juegos completos de estilos con nombre propio; espaciado de párrafo predefinido.                                                        | Media     |
| Marca de agua, color y bordes de página | En pantalla (capa de la hoja) y al imprimir (`@page` + elemento fijo).                                                                  | Baja      |

Esfuerzo: 1–2 semanas.

### Fase 20 · Correspondencia

Objetivo: cartas, diplomas o etiquetas a partir de una lista. Es la pestaña que mejor conecta Texto con Hojas.

| Tarea                   | Cómo                                                                                                        | Prioridad |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- | --------- |
| Origen de datos         | Elegir una `.tsheet`, `.xlsx` o `.csv` (lectores de Hojas). Se guarda la ruta y las columnas, no los datos. | Media     |
| Campos combinados       | Nodo en línea `«columna»`; bloque de direcciones y línea de saludo como plantillas de campos.               | Media     |
| Vista previa y combinar | Recorrer registros; generar un documento único, un `.tdoc` por registro o un PDF.                           | Media     |
| Reglas                  | "Si… entonces… si no" usando el evaluador de fórmulas de Hojas.                                             | Baja      |
| Sobres y etiquetas      | Plantillas de tamaño de página (fase 12) y rejilla de etiquetas (Avery/Apli comunes).                       | Baja      |

Esfuerzo: 2–3 semanas.

### Fase 21 · Dibujar

Objetivo: la pestaña completa en versión mínima, si la quieres.

| Tarea               | Cómo                                                                                                                        | Prioridad |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------- |
| Lienzo de dibujo    | Bloque del documento con una capa SVG; trazos con Pointer Events (presión si hay lápiz), suavizados con una curva sencilla. | Baja      |
| Herramientas        | Bolígrafo, rotulador, resaltador, borrador por trazo, grosor y color. Deshacer con el historial normal.                     | Baja      |
| Tinta sobre la hoja | La misma capa, anclada a un párrafo, por encima del texto.                                                                  | Baja      |

Esfuerzo: 1–2 semanas.

## 4. Dependencias

```
12 Cimientos ──┬─> 13 Estilos ──┬─> 19 Diseño
               │                ├─> 17 Referencias (TOC usa títulos y tabulaciones)
               │                └─> 14 Vista (navegación por niveles de esquema)
               ├─> 15 Disposición ──> 17 Notas al pie, referencias "ver página N"
               ├─> 16 Insertar (usa el registro de comandos y la capa de página)
               ├─> 18 Revisar (independiente del resto, solo necesita 12)
               ├─> 20 Correspondencia (sobres y etiquetas necesitan tamaño de página)
               └─> 21 Dibujar
```

12 va siempre primero. Después de la 13, el orden de 14–21 es flexible: la 14 y la 18 no dependen de la 15, y puedes adelantarlas si te apetece más.

## 5. Mi recomendación

**No intentes hacerlo todo seguido.** Son 6–9 meses, y tus prioridades son ser empleable, dominar TypeScript y aprender AI Engineering. Hay un camino corto que da el 80 % del valor de "parece Word" y además enseña lo que más se valora:

1. **Fase 12 entera** (el registro de comandos es la pieza que más vas a poder contar en una entrevista: es diseño de software, no "añadir botones").
2. **Fase 13** (estilos como datos y CSS generado: el mismo problema que resuelve cualquier sistema de diseño).
3. **Fase 14** (corta, se nota muchísimo).
4. **De la 17, la tabla de contenido y las notas al final**, y **de la 18, el control de cambios**. Con eso puedes escribir y corregir tu memoria de prácticas en Tintero.

Después, para y decide. Si en ese punto tu foco son las prácticas o la IA, la fase 18 tiene la parte de IA (gramática medida con evals, traducción, dictado con Whisper) que encaja con tu perfil. Si quieres seguir con producto, la 15 es el reto técnico más interesante del proyecto, pero hazla con el _spike_ previo.

Y una alternativa que te reto a considerar: en vez de copiar la cinta entera, quedarte con las pestañas que realmente usas y dedicar ese tiempo a que el **Asistente** haga en lenguaje natural lo que en Word son veinte clics ("pon todos los títulos en azul y numera las secciones"). El registro de comandos de la fase 12 es justo lo que hace falta para eso, porque cada comando se puede exponer como herramienta al modelo. Eso sí es algo que Word local no tiene.
