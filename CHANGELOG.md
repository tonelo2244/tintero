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

### Cambiado

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
