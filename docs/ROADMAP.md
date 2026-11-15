# Tintero · Roadmap v2

Qué está hecho, dónde estamos y qué viene después.

|         |                                                                                                 |
| ------- | ----------------------------------------------------------------------------------------------- |
| Versión | 0.1.0 en `package.json` (con las fases 0–6 terminadas; toca publicar 0.2.0)                     |
| Fecha   | 15 de noviembre de 2026                                                                         |
| Stack   | Electron 45 · electron-vite · React 19 · TypeScript 5.9 · Tiptap 3 · ExcelJS · Vitest · Ollama  |
| Tamaño  | ~17.000 líneas de TypeScript/TSX en 174 archivos · ~210 tests en 29 archivos                    |
| Apps    | Tintero Texto (`.tdoc`), Tintero Diapositivas (`.tpres`) y Tintero Hojas de cálculo (`.tsheet`) |
| Código  | Este repositorio, con CI en cada PR e instaladores publicados al subir una etiqueta `v*`        |

## Resumen

El roadmap v1 (el PDF del 14 de noviembre) tenía seis fases y **las seis están en `main`**: cimientos, Texto y Diapositivas, profesionalizar (Git, CI, autoguardado, instaladores), compatibilidad con Office, edición avanzada, Hojas de cálculo e IA local con Ollama.

Tintero ya no es un prototipo: es una suite de tres apps con importación y exportación a formatos de Office, un motor de fórmulas propio y un asistente de IA que no saca nada del equipo. Lo que falta ya no es "lo básico", sino tres cosas distintas:

1. **Poder enseñarlo y confiar en él**: icono, release 0.2.0, tests end-to-end en CI y (si compensa) firma de macOS.
2. **IA de verdad, medida**: las funciones de IA existen, pero nadie sabe cómo de bien funcionan. Falta evaluarlas, y faltan las piezas que más se piden en un puesto de AI Engineer: fórmulas en lenguaje natural, RAG y herramientas (tool calling).
3. **Profundidad de producto**: lo que la fase 5 dejó fuera en Hojas, lo que se pierde al abrir archivos de Office y lo que queda de edición avanzada.

El orden de este roadmap está pensado para tus prácticas y tu objetivo de ser AI Engineer: primero lo que hace que el repositorio se pueda enseñar, después la IA (con evaluación antes que funciones nuevas) y al final la profundidad de producto, que da menos aprendizaje por hora.

| Fase                      | Contenido                                                                                             | Estado    |
| ------------------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| 0–6 · Roadmap v1          | Cimientos, tres apps, CI, instaladores, Office, edición avanzada, IA local                            | Hecho     |
| 7 · Listo para enseñar    | Icono, release 0.2.0, e2e en CI, README de portfolio, firma macOS                                     | Hecho     |
| 8 · IA local v2           | Evaluación, fórmulas en lenguaje natural, formato al reescribir, documentos largos, RAG, herramientas | Hecho     |
| 9 · Hojas de cálculo v2   | Insertar/borrar filas, ordenar/filtrar, funciones que faltan, gráficos                                | Siguiente |
| 10 · Fidelidad con Office | Recuperar lo que se pierde con .docx, .pptx y .xlsx, con un corpus de pruebas                         | Pendiente |
| 11 · Edición avanzada v2  | Paginación real, encabezado y pie, Diapositivas: copiar/pegar, alinear, agrupar, transiciones         | Pendiente |

## 1. Qué está hecho

Todo lo de esta sección está en `main` y comprobado en el código, no solo en el README.

| Fase v1                | PRs      | Qué quedó                                                                                                                                                                                                                           |
| ---------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2 · Profesionalizar    | #1–#5    | Repo en GitHub, CI (lint, formato, typecheck, tests, build), ESLint + Prettier + husky, aviso al cerrar con cambios, autoguardado en `userData/recovery` con recuperación, instaladores .dmg/.exe/.AppImage publicados por etiqueta |
| 3 · Compatibilidad     | #6–#10   | Exportar a PDF directo; .docx de ida y vuelta (docx + mammoth); .pptx de ida y vuelta (pptxgenjs + lector XML propio); contrato de exportadores/importadores en `AppModule`                                                         |
| 4 · Edición avanzada   | #11, #12 | Tablas en Texto (con celdas combinadas y .docx), buscar y reemplazar, formato por palabra en Diapositivas (con migración del formato a la versión 2); abrir un archivo ajeno decide por extensión y avisa claro                     |
| 5 · Hojas de cálculo   | #13      | Tercera app: motor de fórmulas propio (tokenizer → parser → AST → evaluador, 29 funciones, grafo de dependencias con recálculo incremental), cuadrícula virtualizada de 10.000 × 702, varias hojas, formato, .xlsx y .csv           |
| 6 · IA local           | #14      | Cliente de Ollama en main (streaming, salida estructurada, cancelación, solo loopback), asistente de redacción, crear presentación desde un documento con esquema validado + reintento, corrector ortográfico en el clic derecho    |
| 7 · Listo para enseñar | #17, #18 | Icono propio, release 0.2.0 con CHANGELOG, e2e con Playwright + Electron en CI (con Ollama simulado), README de portfolio con capturas y diagrama                                                                                   |
| 8 · IA local v2        | este PR  | Banco de evals (`npm run eval`), fórmulas en lenguaje natural, explicar fórmula, analizar tabla, formato al reescribir, map-reduce, RAG local con citas, tool calling en Diapositivas y Hojas, runtime llama.cpp                    |

## 2. Dónde estamos

La arquitectura ha aguantado lo que prometía: Hojas se añadió sin tocar `main/` ni el shell, y la IA entró sin que `main` sepa nada de documentos. Esa es la mejor noticia del proyecto y lo que más merece la pena contar en una entrevista.

Lo que no está tan bien:

- **La IA no está medida.** Hay tests de que el código funciona con un Ollama simulado, pero no hay ningún número que diga si "Corregir" corrige o si "Crear presentación" produce algo usable con `gemma4:e4b`. Y todavía no se ha probado con un modelo real en el Mac.
- **No hay tests end-to-end en CI.** Los e2e con Electron + Playwright se han hecho a mano en cada fase. Si mañana se rompe abrir un .xlsx desde la interfaz, CI no se entera.
- **El instalador no da confianza**: icono de Electron por defecto, sin firma y con el paso de `xattr -cr` en macOS.
- **La versión sigue siendo 0.1.0** aunque el producto ha cambiado por completo.

### Limitaciones conocidas

| Limitación                                                                                                   | Impacto                                                    | Dónde se resuelve              |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------ |
| Instaladores sin icono ni firma; macOS pide "Abrir igualmente" o `xattr -cr`                                 | Mala primera impresión; nadie que no seas tú lo instalaría | Fase 7                         |
| Sin e2e en CI                                                                                                | Las regresiones de interfaz solo se ven a mano             | Resuelto (fase 7)              |
| El banco de evals existe, pero todavía no se ha ejecutado con un modelo real                                 | Aún no hay cifras de calidad ni latencia                   | `npm run eval` en el Mac       |
| Fórmulas en lenguaje natural sin hacer (estaban bloqueadas por el parser de la fase 5)                       | Falta la función de IA más vistosa de Hojas                | Resuelto (fase 8)              |
| El asistente trabaja en texto plano: al reemplazar se pierde la negrita, colores, etc.                       | Molesto en documentos con formato                          | Resuelto (fase 8)              |
| Documentos de más de 12.000 caracteres se recortan para el modelo                                            | Resumir un documento largo resume solo el principio        | Resuelto (fase 8)              |
| Hojas: sin insertar/borrar filas o columnas, ordenar, filtrar, buscar, celdas combinadas ni gráficos         | Es lo primero que echa en falta cualquiera que use Excel   | Resuelto (fase 9)              |
| Hojas: 29 funciones; BUSCARX, SI.CONJUNTO, fechas o `A:A` dan `#¿NOMBRE?`                                    | Hojas reales de Excel se abren con errores                 | Resuelto (fase 9)              |
| Hojas: cortar y pegar no actualiza las fórmulas que apuntaban a lo movido                                    | Resultados incorrectos sin aviso                           | Resuelto (fase 9)              |
| Importar .docx pierde fuente, tamaño, color y alineación; no hay encabezados, pies ni comentarios            | Un documento recibido se ve distinto                       | Fase 10 (hecha)                |
| Importar .pptx pierde fondo y colores del tema, tablas, gráficos y giros                                     | Una presentación recibida pierde su aspecto                | Fase 10 (hecha salvo gráficos) |
| Importar .xlsx pierde celdas combinadas, formato condicional, fuentes, alto de filas y paneles inmovilizados | Ídem en hojas                                              | Fase 9 y 10 (hechas)           |
| Paginación aproximada en Texto, sin encabezado, pie ni número de página                                      | Lo que ves no coincide del todo con lo que imprimes        | Fase 11                        |
| Diapositivas sin copiar/pegar elementos, alinear, agrupar ni transiciones; alineación y viñetas por cuadro   | Edición más lenta que en Keynote o PowerPoint              | Fase 11                        |

## 3. Lo que queda, por fases

**Por qué este orden.** Para unas prácticas cuenta más un repositorio que se puede instalar, que tiene CI con e2e y que sabe explicar sus decisiones que una función más. Eso es la fase 7, y es corta. Después va la IA porque es tu objetivo profesional, y dentro de ella **la evaluación va primero**: es lo que separa a alguien que "ha llamado a un modelo" de alguien que sabe si su sistema funciona, y es la pregunta que te harán en una entrevista de AI Engineer. Las fases 9–11 son profundidad de producto: valiosas, pero enseñan menos por hora, así que conviene hacerlas a trozos y elegir.

### Fase 7 · Listo para enseñar

Objetivo: que cualquiera pueda instalar Tintero, confiar en él y entender el proyecto en dos minutos.

| Tarea                           | Cómo (enfoque propuesto)                                                                                                                                                                                                                                                                        | Prioridad |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Icono de la app                 | `build/icon.png` de 1024×1024 (electron-builder genera .icns y .ico). Diseño propio y sin marcas.                                                                                                                                                                                               | Alta      |
| e2e en CI                       | Llevar a un job de GitHub Actions lo que ya se hace a mano: Playwright `_electron` + `xvfb-run` en Ubuntu. Pocos tests y de caminos críticos: crear y guardar en cada app, abrir .docx/.pptx/.xlsx, exportar, y el asistente contra el Ollama simulado (un servidor Node en `127.0.0.1:11434`). | Alta      |
| Release 0.2.0                   | Subir la versión, `CHANGELOG.md` (formato Keep a Changelog) y etiqueta `v0.2.0` para que el workflow publique los instaladores.                                                                                                                                                                 | Alta      |
| README de portfolio             | Capturas o un GIF corto de cada app y de la IA, un diagrama de arquitectura y una sección "decisiones de diseño" enlazando a los PRs.                                                                                                                                                           | Alta      |
| Probar la IA con un modelo real | `ollama pull gemma4:e4b` en el Mac y repasar cada acción. Anotar lo que falle: será el primer material de evaluación de la fase 8.                                                                                                                                                              | Alta      |
| Firma y notarización en macOS   | Requiere Apple Developer Program (99 USD/año). electron-builder firma con el certificado _Developer ID Application_ y notariza con `notarytool` usando secretos de GitHub Actions. Ver la nota de abajo.                                                                                        | Baja      |
| Actualizaciones automáticas     | `electron-updater` contra las Releases de GitHub. En macOS solo funciona con la app firmada, así que va después de la firma.                                                                                                                                                                    | Baja      |

Esfuerzo estimado: 1 semana sin la firma.

> **Firma en macOS, honestamente.** Para tu portfolio no hace falta: quien revisa tu repo mira el código, el README y el CI, no instala un .dmg. Pagar los 99 USD tiene sentido cuando otras personas vayan a usar Tintero de verdad. Lo que sí merece la pena es entender el proceso (certificados, _hardened runtime_, _entitlements_, notarización), porque aparece en cualquier empresa que distribuya apps de escritorio.

### Fase 8 · IA local v2 · hecha

Objetivo: pasar de "tiene IA" a "tiene IA medida, fiable y útil", y cubrir las técnicas que más se piden en AI Engineering.

| Tarea                                    | Cómo (enfoque propuesto)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Prioridad |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Banco de evaluación                      | Carpeta `evals/` con casos (entrada, resultado esperado o criterios) por función: corregir, resumir, crear presentación y fórmulas. Un script `npm run eval -- --model gemma4:e4b` que ejecuta los casos contra Ollama y guarda un informe (aciertos, JSON válido a la primera, reintentos, latencia). Métricas deterministas donde se pueda (la fórmula da el resultado esperado, el JSON valida) y un juez LLM con rúbrica solo donde no. No va en CI (necesita un modelo), se ejecuta a mano antes de cambiar un prompt o de modelo. | Alta      |
| Fórmulas en lenguaje natural             | «suma la columna B si A es mayor que 10» → fórmula. El modelo devuelve `{ formula, explicacion }` con esquema; el **parser de la fase 5 valida** y, si falla, `generateStructured` reintenta con el error del parser. Antes de insertar, se evalúa y se enseña el resultado. Dar al prompt contexto de la hoja (cabeceras y unas filas, no toda la hoja). Reutiliza `core/ai/structured.ts`.                                                                                                                                            | Alta      |
| Explicar una fórmula                     | Lo inverso: «¿qué hace `=SUMAR.SI(A:A;">10";B:B)`?». Fácil una vez hecho lo anterior y muy útil para quien hereda una hoja.                                                                                                                                                                                                                                                                                                                                                                                                             | Media     |
| Conservar el formato al reescribir       | En vez de texto plano, mandar los párrafos con marcas sencillas (por ejemplo Markdown de negrita/cursiva) y reconstruir los _marks_ de Tiptap al aplicar. Lógica pura en `writer/model/ai` con tests de ida y vuelta.                                                                                                                                                                                                                                                                                                                   | Media     |
| Documentos largos                        | Trocear por secciones (títulos) y resumir en dos pasos (_map-reduce_): resumen de cada trozo y resumen de los resúmenes. Quita el recorte de 12.000 caracteres.                                                                                                                                                                                                                                                                                                                                                                         | Media     |
| Preguntar a tus documentos (RAG local)   | Embeddings con un modelo local de Ollama (`/api/embed`, por ejemplo `embeddinggemma` o `nomic-embed-text`), índice en `userData` (empezar con similitud coseno en memoria; pasar a SQLite + `sqlite-vec` si crece). Responder citando el documento y el párrafo. Vive en main como servicio genérico; qué se indexa lo decide cada app.                                                                                                                                                                                                 | Media     |
| Acciones con herramientas (tool calling) | «Pon en negrita los títulos y añade una diapositiva de conclusiones»: el modelo propone llamadas a herramientas que son **las mismas acciones del reducer** (Diapositivas, Hojas). El reducer valida, nada se aplica sin revisión y todo se puede deshacer en un paso. Es un agente pequeño y seguro por diseño.                                                                                                                                                                                                                        | Media     |
| Analizar una tabla                       | «Resume estos datos» sobre la selección de una hoja: el código calcula las estadísticas y el modelo solo las redacta (los números nunca los inventa el modelo).                                                                                                                                                                                                                                                                                                                                                                         | Baja      |
| Segundo runtime: llama.cpp               | Implementar `LocalModelRuntime` con `llama-server`. Sirve sobre todo para comparar en el banco de evaluación.                                                                                                                                                                                                                                                                                                                                                                                                                           | Baja      |

Esfuerzo estimado: 4–6 semanas; se puede hacer por piezas, pero el banco de evaluación primero.

Diseño clave: cada función nueva de IA sigue la regla de la fase 6. **main no tiene prompts**: los prompts, esquemas y validaciones viven en la app, y main solo habla con el modelo. Y **el modelo propone, el código decide**: una fórmula pasa por el parser, una presentación por las fábricas y una acción por el reducer.

### Fase 9 · Hojas de cálculo v2 · hecha

Hecha entera. Lo que queda fuera a propósito: matrices dinámicas (BUSCARX devuelve la primera celda si el resultado es una fila), autoajuste del alto al ajustar texto, y exportar a .xlsx gráficos, formato condicional, filtros, altos de fila y paneles (va en la fase 10, que es donde se trabaja la fidelidad con Office).

Objetivo: que una hoja normal de Excel se pueda abrir y trabajar sin echar nada en falta.

| Tarea                                | Cómo (enfoque propuesto)                                                                                                                                                                                                                                                                                     | Prioridad |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| Insertar y borrar filas/columnas     | Nueva acción del reducer que mueve celdas y **reescribe las referencias sobre el AST** (`transform.ts` ya lo hace para copiar y renombrar hojas). Una referencia a algo borrado pasa a `#¡REF!`, como en Excel.                                                                                              | Alta      |
| Cortar y pegar actualizando fórmulas | Misma pieza: al mover un rango, las fórmulas que apuntaban a él pasan a apuntar al destino.                                                                                                                                                                                                                  | Alta      |
| Funciones que faltan                 | Por orden de uso: SI.CONJUNTO, SUMAR.SI.CONJUNTO, CONTAR.SI.CONJUNTO, PROMEDIO.SI, BUSCARX, INDICE + COINCIDIR, HOY, AHORA, FECHA, AÑO/MES/DIA, TEXTO, REDONDEAR.MAS/MENOS, CONTAR.BLANCO, SI.ND. Y referencias a columnas enteras (`A:A`). Cada una con tests y su nombre en español en `functionNames.ts`. | Alta      |
| Ordenar y filtrar                    | Ordenar un rango por una o varias columnas (estable, con el orden de Excel: números, texto, lógicos, vacíos). Filtro como vista: oculta filas sin tocar los datos.                                                                                                                                           | Alta      |
| Buscar y reemplazar                  | Buscar en valores o en fórmulas, en la hoja o en el libro.                                                                                                                                                                                                                                                   | Media     |
| Inmovilizar paneles y alto de fila   | Primera fila/columna fijas en la cuadrícula virtualizada; alto de fila variable y ajuste de texto.                                                                                                                                                                                                           | Media     |
| Celdas combinadas                    | En el modelo y en la cuadrícula, y de ida y vuelta con .xlsx.                                                                                                                                                                                                                                                | Media     |
| Gráficos                             | Barras, líneas y circular desde un rango, dibujados en SVG propio (sin librería pesada) y que se actualizan al recalcular. Exportarlos a .xlsx es lo difícil: dejarlo para la fase 10.                                                                                                                       | Media     |
| Formato condicional                  | Reglas sencillas (mayor que, entre, texto que contiene, escala de color).                                                                                                                                                                                                                                    | Baja      |
| Imprimir ajustando al ancho          | Escala para que las columnas usadas quepan en la página.                                                                                                                                                                                                                                                     | Baja      |

Esfuerzo estimado: 4–6 semanas.

### Fase 10 · Fidelidad con Office · hecha

Hecha entera. Decisiones y lo que queda fuera:

- **.docx:** en vez de un segundo lector que hubiera que emparejar párrafo a párrafo con mammoth, el lector propio deja marcas invisibles (caracteres de uso privado de Unicode) en el texto de `word/document.xml`; mammoth las copia al HTML en su sitio exacto y después se cambian por estilos. Fuera: cuadros de texto, alineación dentro de listas y encabezados distintos en la primera página o en las pares.
- **.pptx:** el tema importado es un tema más (`Presentation.importedTheme`); si todas las diapositivas comparten fondo, pasa al tema. Fuera: gráficos y SmartArt, estilos de tabla de PowerPoint, celdas combinadas en tablas y volteo.
- **.xlsx:** la fuente normal del libro (la primera de `xl/styles.xml`) no se copia a cada celda. Fuera: exportar gráficos (ExcelJS no los escribe) y filtros.
- **Corpus:** `fixtures/office/generar.py` crea cada archivo con python-docx, openpyxl y python-pptx, y una segunda versión pasada por LibreOffice. Cada importador tiene su `corpus.test.ts`.

Objetivo: perder menos al abrir archivos de Office, y saber exactamente cuánto se pierde.

| Tarea                                   | Cómo (enfoque propuesto)                                                                                                                                                                                                                                      | Prioridad |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Corpus de pruebas                       | Carpeta `fixtures/office/` con archivos reales de Word, PowerPoint y Excel (creados por ti o con licencia libre) y tests que importan cada uno y comprueban lo que se conserva. Con cada mejora, un archivo más. Es la red de seguridad del resto de la fase. | Alta      |
| .docx: formato aplicado a mano          | mammoth descarta fuente, tamaño, color y alineación por diseño. Opción recomendada: un lector propio del XML (`word/document.xml`) como el que ya existe para .pptx, primero en paralelo a mammoth para esos atributos.                                       | Alta      |
| .docx: encabezados, pies y comentarios  | Depende de la paginación de la fase 11 para mostrarlos; importarlos al modelo puede ir antes.                                                                                                                                                                 | Media     |
| .pptx: fondo y colores del tema         | Leer `theme1.xml` y los fondos del patrón; crear un tema "importado" en vez de aplicar Blanco.                                                                                                                                                                | Media     |
| .pptx: tablas y giros                   | Tablas como un elemento nuevo de Diapositivas; giro como propiedad de cualquier elemento.                                                                                                                                                                     | Baja      |
| .xlsx: fuentes, alto de filas y paneles | Cuando existan en el modelo (fase 9), leerlos y escribirlos con ExcelJS.                                                                                                                                                                                      | Media     |

Esfuerzo estimado: 3–5 semanas.

### Fase 11 · Edición avanzada v2

Objetivo: cerrar las limitaciones que quedan de la fase 4.

| Tarea                                                      | Cómo (enfoque propuesto)                                                                                                                                                          | Prioridad |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Diapositivas: copiar/pegar, duplicar, alinear y distribuir | Acciones nuevas en el reducer puro, con tests.                                                                                                                                    | Media     |
| Diapositivas: agrupar                                      | Un elemento grupo con hijos; mover y redimensionar en bloque. El importador de .pptx ya entiende grupos, así que conviene alinear el modelo.                                      | Media     |
| Diapositivas: alineación y viñetas por párrafo             | Pasar alineación y lista de atributos del cuadro a nodos de Tiptap. Cambia `.tpres`: subir la versión del formato y escribir la migración.                                        | Media     |
| Paginación real en Texto                                   | Medir bloques y repartirlos en hojas. Es un proyecto grande en sí mismo; antes de escribirlo, buscar si hay una extensión de paginación para Tiptap con licencia libre que sirva. | Media     |
| Encabezado, pie y número de página                         | Empezar por pie con número al imprimir/exportar a PDF; el editor visual después de la paginación.                                                                                 | Media     |
| Transiciones en modo presentación                          | Fundido y desplazamiento con CSS; exportar a .pptx la equivalente.                                                                                                                | Baja      |

Esfuerzo estimado: 4–6 semanas.

## 4. Mi recomendación para empezar

Haz la **fase 7 entera** (una semana) y en cuanto tengas Ollama con `gemma4:e4b` funcionando en el Mac, empieza la fase 8 por el **banco de evaluación** y las **fórmulas en lenguaje natural**. Juntas cuentan la mejor historia para una entrevista: «tengo un parser propio de fórmulas; el modelo propone, el parser valida y el sistema reintenta con el error; y tengo un banco de evaluación que dice que con este modelo acierta el X % de los casos y que este cambio de prompt lo subió del Y al Z %». Eso es exactamente el trabajo diario de un AI Engineer.

Las fases 9–11 no tienen prisa. Cuando te apetezca descansar de la IA, insertar/borrar filas (fase 9) es la mejor siguiente pieza: enseña transformaciones sobre árboles y es lo que más se nota al usar la app.
