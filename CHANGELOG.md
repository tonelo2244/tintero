# Changelog

Todos los cambios importantes de Tintero se anotan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa
[versionado semántico](https://semver.org/lang/es/). Mientras la versión empiece por `0.`, el
formato de archivo y la interfaz todavía pueden cambiar entre versiones menores.

## [Sin publicar]

### Añadido

- **Banco de evaluación de la IA** (`npm run eval`): casos por función, comprobaciones
  deterministas y juez LLM con rúbrica, informe con aciertos, JSON válido a la primera,
  reintentos y latencia p50/p95, y comparación con un informe anterior.
- **Hojas**: fórmulas en lenguaje natural validadas por el motor de fórmulas, explicar una
  fórmula y analizar una tabla (el código calcula, el modelo redacta).
- **Texto**: preguntar a tus documentos con RAG local (embeddings de Ollama, citas de documento y
  párrafo); resumir documentos largos por partes.
- **Diapositivas y Hojas**: pedir cambios en lenguaje natural con herramientas (tool calling);
  se revisan antes de aplicar y se deshacen en un paso.
- Segundo runtime local: llama.cpp (`llama-server`), sobre todo para comparar en las evals.
- **Hojas v2** (fase 9): insertar y borrar filas o columnas reescribiendo las fórmulas de todo el
  libro; cortar y pegar que actualiza las fórmulas; 19 funciones nuevas (SI.CONJUNTO,
  SUMAR.SI.CONJUNTO, CONTAR.SI.CONJUNTO, PROMEDIO.SI(.CONJUNTO), BUSCARX, INDICE, COINCIDIR, HOY,
  AHORA, FECHA, AÑO, MES, DIA, TEXTO, REDONDEAR.MAS/MENOS, CONTAR.BLANCO, SI.ND) y columnas o
  filas enteras (`A:A`, `2:5`); ordenar por varias columnas; autofiltro; buscar y reemplazar;
  inmovilizar paneles; alto de fila; ajustar texto; celdas combinadas (también en .xlsx); formato
  condicional; gráficos de columnas, líneas y circular; imprimir ajustando al ancho.
- **Fidelidad con Office** (fase 10):
  - **.docx**: se conservan fuente, tamaño, color, resaltado y alineación aplicados a mano;
    encabezado, pie (con número de página) y comentarios se importan y se exportan.
  - **Texto**: comentarios con panel lateral (Insertar → Comentario / Ver comentarios).
  - **.pptx**: tema «Importado» con los colores, fuentes y fondo del archivo; fondos propios por
    diapositiva; tablas y giros, que también se exportan.
  - **Diapositivas**: insertar y editar tablas; girar elementos.
  - **.xlsx**: fuentes y tamaños, alto de filas, paneles inmovilizados, ajuste de texto y
    formato condicional se leen y se escriben. **Hojas**: selector de fuente y tamaño.
  - Corpus de archivos de Office en `fixtures/office/` con tests por importador.
- **Edición avanzada v2** (fase 11):
  - **Diapositivas**: selección múltiple (Mayús/Ctrl + clic, Ctrl+A) y arrastre de varios;
    copiar, cortar, pegar y duplicar elementos (Ctrl+C/X/V/D); alinear y distribuir; agrupar y
    desagrupar (Ctrl+G / Ctrl+Mayús+G); alineación y viñeta por párrafo; transiciones
    Desvanecer y Empujar. Todo ello se importa y exporta en .pptx (los grupos se exportan sueltos).
  - **Texto**: hojas A4 reales en pantalla (cada bloque baja a la hoja siguiente si no cabe) con
    encabezado y pie, número de página y total (Insertar → Encabezado y pie de página). Imprimir
    y exportar a PDF cortan en los mismos sitios y llevan el encabezado y el pie.
- **Texto, cimientos de la cinta y la página** (fase 12):
  - Pestaña **Disposición**: márgenes (Normal, Estrecho, Moderado, Ancho o personalizados),
    orientación vertical u horizontal y tamaño de papel (A4, A5, Carta, Legal o personalizado).
    La pantalla, la impresión, el PDF y el .docx (`w:sectPr`) usan la misma configuración.
  - **Salto de página** (Insertar o Disposición → Salto de página, o Ctrl/Cmd+Intro); se
    importa y exporta en .docx.
  - **Regla** sobre la hoja: arrastrar los márgenes o la sangría izquierda y la de primera línea
    (también francesa); con el foco, las flechas mueven cada marca 0,25 cm.
  - Registro de comandos (`model/commands.ts`): la cinta, los atajos y el menú nativo ejecutan
    los mismos comandos. Cada pestaña de la cinta vive en su archivo (`editor/ribbon/`).
  - .docx: se importan la sangría izquierda, la de primera línea y la francesa.
- **Texto, estilos de verdad** (fase 13):
  - Los **estilos son datos del documento** con «basado en»: modificar Título 1 cambia todos los
    títulos 1. Galería con clic derecho (Modificar, Actualizar para que coincida con la selección,
    Nuevo estilo, Eliminar), **panel de estilos** y Títulos 4 a 6. Estilos de carácter (Énfasis,
    Énfasis intenso, Texto destacado y propios).
  - **Lista multinivel** vinculada a los títulos (1, 1.1, 1.1.1), **biblioteca de viñetas**,
    formatos de número (1., 1), a., a), A., i., I., 1.1.) y reiniciar o continuar la numeración.
  - Párrafo: **espaciado antes y después**, sangría derecha y valores exactos en Disposición,
    **sombreado y bordes**, **tabulaciones** (izquierda, centro, derecha, decimal, con relleno de
    puntos) y la tecla Tab inserta un tabulador en medio del texto.
  - **Copiar formato** (un clic: una vez; doble clic: hasta Esc), **cambiar mayúsculas y
    minúsculas**, **ordenar párrafos**, pegar solo texto y Seleccionar (todo, el párrafo).
  - .docx de ida y vuelta: `styles.xml` (integrados por nombre y los propios que se usan), `w:shd`,
    `w:pBdr`, `w:tabs`, `w:rStyle`, viñetas y formatos de número. Corpus Word y LibreOffice.
- **Texto, vista y navegación** (fase 14):
  - **Panel de navegación** (Vista o Ctrl/Cmd+Alt+N): árbol de títulos que se pliega, clic para
    saltar, **arrastrar un título mueve su sección entera** (un solo paso de deshacer) y pestaña
    **Páginas** con miniaturas de cada hoja.
  - **Vistas**: Diseño de impresión, **Borrador** (sin hojas), **Esquema** (pestaña propia: subir y
    bajar de nivel, mover secciones con Alt+Mayús+flechas, plegar, mostrar hasta un nivel) y
    **Modo lectura** (sin cinta, columna cómoda, colores claro, sepia u oscuro; Esc para salir).
    También desde la barra de estado.
  - **Zoom**: 50–200 %, 100 %, **Una página** y **Ancho de página**; el zoom libre baja al 25 %.
  - **Dividir**: una segunda vista del mismo documento con su propio cursor; lo que se escribe en
    una aparece en la otra y Deshacer es común.
  - Nueva pestaña **Revisar**: **Contar palabras** (páginas, palabras, caracteres con y sin
    espacios, párrafos y líneas; de la selección si la hay; también al pulsar el recuento de la
    barra de estado o con Ctrl/Cmd+Mayús+G), **Leer en voz alta** con las voces del sistema,
    resaltando la frase, con pausa, frase anterior y siguiente, velocidad y voz, y los comentarios.
  - La **Regla** pasa de Disposición a Vista > Mostrar, como en Word.

### Corregido

- Texto: el salto de página (Ctrl/Cmd+Intro) se quedaba seleccionado en algunos documentos y lo
  primero que escribías lo borraba.
- Texto: la barra de estado decía «Página 1» con el cursor en la primera línea de la página 2, y no
  se actualizaba cuando la paginación bajaba el párrafo del cursor a la hoja siguiente.
- Hojas: «Ajustar texto» no partía las líneas en pantalla (una regla CSS posterior lo anulaba).

### Cambiado

- Formato de archivo versión 5 (estilos del documento y formato de párrafo de la fase 13). Un
  documento sin estilos guardados usa los de partida, que reproducen el aspecto de siempre.
- Texto: el aspecto de párrafos y títulos sale de los estilos del documento, no de una hoja CSS fija.
- Formato de archivo versión 4 (configuración de página y saltos de página en Texto). Un documento
  sin configuración es A4 con 2,5 cm, como antes.
- Formato de archivo versión 3 (por los grupos de Diapositivas). Los archivos anteriores se abren
  igual; un Tintero anterior avisa de que el archivo es de una versión más nueva.
- Diapositivas: orden, grupos, alineación y giro pasan a un único menú **Organizar** en Inicio.
- El asistente de Texto conserva negrita, cursiva, subrayado, colores y demás formato al
  reescribir.
- Se quita el recorte de 12.000 caracteres al resumir o crear una presentación desde un
  documento largo.

## [0.2.0] - 2026-11-15

La primera versión pensada para que la use alguien más que su autor: tres apps, compatibilidad
con Office, IA local e instaladores con icono propio.

### Añadido

- **Tintero Hojas de cálculo**: cuadrícula de 10.000 × 702 celdas, motor de fórmulas propio con
  29 funciones en español o inglés, recálculo incremental con grafo de dependencias, varias
  hojas, formato de celdas, copiar/pegar con referencias relativas, CSV y .xlsx (#13).
- **IA local con Ollama**: asistente de redacción en Texto (corregir, mejorar, más formal, más
  breve, resumir), crear una presentación desde un documento y corrector ortográfico en el
  clic derecho. Nada sale del equipo (#14).
- **Compatibilidad con Office**: exportar a PDF (#6), exportar y abrir .docx y .pptx (#7–#10).
- **Texto**: tablas con ida y vuelta a .docx, buscar y reemplazar (#11).
- **Diapositivas**: formato por palabra dentro de un cuadro de texto (#11).
- Autoguardado cada 30 s y recuperación al arrancar (#4); aviso al cerrar con cambios sin
  guardar (#3).
- Instaladores para Windows, macOS y Linux que se publican solos al subir una etiqueta `v*`, y
  que asocian `.tdoc`, `.tpres` y `.tsheet` con Tintero (#5).
- CI con lint, formato, typecheck, tests y build en cada PR; ESLint, Prettier y hook de
  pre-commit (#1, #2).
- Icono propio de la app.
- Pruebas e2e con Playwright que arrancan la app en CI, incluida la IA contra un Ollama simulado.
- Hoja de ruta en [docs/ROADMAP.md](docs/ROADMAP.md) (#15).

### Cambiado

- Abrir un archivo que no es de Tintero decide la app por la extensión y avisa con claridad si
  no sabe abrirlo (#12).
- `npm run dev` usa su propia carpeta de datos para no chocar con un Tintero instalado (#16).

### Corregido

- La app arranca en Mac con chip Apple gracias a la firma _ad-hoc_ (#5).

## [0.1.0] - 2026-11-14

### Añadido

- Primera versión: Tintero Texto y Tintero Diapositivas, pantalla de inicio con plantillas,
  recientes y anclados, y formato de archivo JSON versionado.

[Sin publicar]: https://github.com/tonelo2244/tintero/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/tonelo2244/tintero/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/tonelo2244/tintero/releases/tag/v0.1.0
