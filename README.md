# Tintero

Suite ofimática **100 % local** (sin nube, sin cuentas) con tres aplicaciones:

- **Tintero Texto**: procesador de textos con cinta _Inicio_ (fuente, tamaño, negrita, cursiva, subrayado, tachado, subíndice/superíndice, color de fuente y resaltado, viñetas, numeración, sangría, alineación, interlineado, galería de estilos Normal / Título 1-3 / Título / Subtítulo / Cita), pestaña _Insertar_ (tabla, imagen, línea, fecha, cita, código), pestaña contextual _Tabla_ (filas, columnas, combinar y dividir celdas, fila de encabezado), buscar y reemplazar (Cmd/Ctrl+F), barra de estado con páginas, palabras y zoom.
- **Tintero Diapositivas**: editor de presentaciones con miniaturas reordenables, diseños de diapositiva (título, título y contenido, sección…), cuadros de texto con formato por palabra, imágenes, formas, notas del orador, 5 temas, deshacer/rehacer y modo presentación a pantalla completa (F5).
- **Tintero Hojas de cálculo**: cuadrícula de 10.000 filas × 702 columnas (A–ZZ), barra de fórmulas, motor de fórmulas propio con 29 funciones en español o inglés (SUMA, PROMEDIO, SI, BUSCARV, SUMAR.SI…), recálculo automático, referencias entre hojas, modo señalar (clic en una celda mientras escribes una fórmula), formato de número (número, moneda, porcentaje, fecha), negrita/cursiva/subrayado, colores, bordes, alineación, ancho de columna, varias hojas, copiar/pegar con referencias relativas, rellenar (Ctrl+D/R), autosuma y suma/promedio/recuento de la selección en la barra de estado.

Las tres comparten una pantalla de inicio con plantillas/temas, **Recientes** y **Anclado**, y guardan en tu disco (`.tdoc`, `.tpres` y `.tsheet`).

## Requisitos y arranque

- Node.js 22 (la versión está en `.nvmrc`: `nvm use`)

```bash
npm install
npm run dev        # abre la app en modo desarrollo (recarga en caliente)
npm test           # tests unitarios (Vitest)
npm run typecheck  # comprobación de tipos
npm run build      # compila a ./out
npm run lint       # ESLint
npm run format     # Prettier (formatea todo)
```

Al hacer `git commit`, un hook de pre-commit (husky + lint-staged) pasa ESLint y Prettier sobre los archivos que vas a commitear. Cada PR ejecuta en GitHub Actions lint, formato, typecheck, tests y build.

## Instaladores

```bash
npm run dist:linux   # dist/Tintero-<versión>-x86_64.AppImage
npm run dist:win     # dist/Tintero-Setup-<versión>.exe   (hay que ejecutarlo en Windows)
npm run dist:mac     # dist/Tintero-<versión>-<arch>.dmg  (hay que ejecutarlo en macOS)
```

Cada instalador se construye en su sistema operativo, así que lo normal es dejárselo a GitHub Actions: al subir una etiqueta (`git tag v0.2.0 && git push origin v0.2.0`) el workflow _Instaladores_ construye los tres y los publica en una Release. También se puede lanzar a mano desde la pestaña _Actions_.

Los instaladores asocian `.tdoc`, `.tpres` y `.tsheet` con Tintero (doble clic para abrir) y la app usa una sola instancia: si ya está abierta, el archivo se abre en ella.

**Sin firma de código.** Firmar cuesta dinero (Apple Developer, certificado de Windows), así que de momento:

- **macOS**: la app lleva firma _ad-hoc_ (sin certificado de Apple). La primera vez, intenta abrirla y después ve a _Ajustes del Sistema → Privacidad y seguridad → Abrir igualmente_. Si aun así dice que "está dañada", ejecuta `xattr -cr /Applications/Tintero.app`.
- **Windows**: SmartScreen avisará; _Más información → Ejecutar de todas formas_.
- **Linux**: `chmod +x Tintero-*.AppImage`. El AppImage no registra la asociación de archivos por sí solo; para eso hace falta integrarlo en el escritorio (p. ej. con AppImageLauncher).

Atajos: `Cmd/Ctrl+N` nuevo, `Cmd/Ctrl+O` abrir, `Cmd/Ctrl+S` guardar, `Cmd/Ctrl+Shift+S` guardar como, `Cmd/Ctrl+P` imprimir, `Cmd/Ctrl+Shift+E` exportar a PDF, `F5` presentar.

## Compatibilidad con Office

| App          | Exportar         | Importar    |
| ------------ | ---------------- | ----------- |
| Texto        | PDF, .docx       | .docx       |
| Diapositivas | PDF, .pptx       | .pptx       |
| Hojas        | PDF, .xlsx, .csv | .xlsx, .csv |

**Exportar** (icono de descarga de la barra superior, o `Cmd/Ctrl+Shift+E` para PDF) crea una **copia**: sigues editando tu `.tdoc`/`.tpres` y el siguiente `Cmd/Ctrl+S` no sobrescribe el archivo exportado.

**Importar** (Abrir… y elegir un `.docx` o `.pptx`) abre una **copia sin guardar**: al guardar se crea un `.tdoc`/`.tpres` nuevo y el original no se toca. Un aviso dice exactamente qué no se ha podido conservar de ese archivo.

### Qué se pierde en cada conversión

- **Exportar a .docx:** el resaltado se guarda como sombreado (Word solo tiene 16 colores de resaltado); las imágenes SVG o WebP se omiten; las tablas conservan celdas combinadas, anchos de columna y fila de encabezado (que se repite en cada página); los saltos de página los decide Word.
- **Importar .docx:** se conserva la estructura (títulos, Título/Subtítulo/Cita, listas, negrita, cursiva, subrayado, tachado, sub/superíndice, enlaces, imágenes y notas al pie), pero no el formato aplicado a mano: fuente, tamaño, color, resaltado y alineación. Las tablas se conservan (con celdas combinadas y fila de encabezado). No se importan encabezados, pies, comentarios ni cuadros de texto. Es la filosofía de la librería que usamos (mammoth): estructura antes que aspecto.
- **Exportar a .pptx:** posiciones, textos, formas, imágenes y notas pasan tal cual. El fondo del tema se reconstruye con franjas de color sólido (un degradado suave queda de su color medio) y los cuadros vacíos se omiten. PowerPoint mide el texto a su manera, así que un texto muy justo puede saltar de línea en otro sitio.
- **Exportar a .xlsx:** valores, fórmulas (con su resultado calculado, para que los visores que no recalculan lo vean), varias hojas, negrita/cursiva/subrayado, colores, bordes finos, alineación, formatos de número y anchos de columna. Una referencia circular se guarda sin resultado (Excel muestra su propio aviso).
- **Importar .xlsx:** se conserva lo mismo que al exportar. Se pierden (y el aviso lo dice): celdas combinadas, formato condicional, validación de datos, gráficos, tablas dinámicas (quedan sus valores), comentarios, imágenes, macros, fuentes y tamaños de letra, colores del tema, ajuste de texto, alto de filas, paneles inmovilizados y formatos de número personalizados. Las funciones que Tintero aún no tiene (p. ej. BUSCARX) se conservan en la fórmula pero muestran `#¿NOMBRE?`, igual que las referencias a columnas enteras (`A:A`).
- **CSV:** exporta los **valores** de la hoja activa con el estándar RFC 4180 (`,` y punto decimal, UTF-8 con BOM para que Excel respete las tildes). Al importar se detecta el separador: con `;` (el CSV del Excel español) se entiende la coma decimal. Un campo que empieza por `=` se importa como texto y no como fórmula, para evitar la [inyección de CSV](https://owasp.org/www-community/attacks/CSV_Injection).
- **Importar .pptx:** se conservan posiciones, tamaños, textos con su formato por palabra (negrita, cursiva, subrayado, tachado, tamaño, fuente y color), alineación y viñetas, 7 formas, imágenes PNG/JPEG/GIF/BMP, grupos y notas, siguiendo la herencia diapositiva → diseño → patrón. Se pierden el fondo y los colores del tema (se aplica el tema Blanco), tablas, gráficos y SmartArt, giros, animaciones y transiciones. Las demás formas pasan a rectángulo y las presentaciones 4:3 se centran en 16:9.

## Stack y por qué

| Pieza            | Elección                                                  | Motivo                                                                                                                                                                                |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Escritorio       | **Electron**                                              | Acceso a disco y diálogos nativos con JavaScript/TypeScript puro. Tauri da binarios más pequeños pero exige Rust para la parte nativa: más fricción ahora mismo para aprender.        |
| Build            | **electron-vite** (Vite)                                  | Una sola configuración para proceso principal, preload e interfaz; recarga instantánea.                                                                                               |
| UI               | **React + TypeScript**                                    | Estándar de la industria; tipos estrictos en todo el proyecto.                                                                                                                        |
| Editor de texto  | **Tiptap** (sobre ProseMirror)                            | Escribir un editor de texto enriquecido desde cero es un pozo sin fondo. ProseMirror es lo que usan productos serios (NYT, Atlassian…).                                               |
| Presentaciones   | Modelo propio + reducer puro                              | No hay una librería que encaje; el modelo es simple (cajas posicionadas) y así queda 100 % testeable.                                                                                 |
| Hojas de cálculo | Motor de fórmulas propio + cuadrícula virtualizada propia | El motor (parser, evaluador, grafo de dependencias) es el corazón de la app y se aprende mucho escribiéndolo; queda puro y con tests. ExcelJS solo se usa para leer y escribir .xlsx. |
| Iconos           | lucide-react                                              | Iconos libres, sin marcas registradas.                                                                                                                                                |
| Tests            | Vitest                                                    | Misma configuración que Vite.                                                                                                                                                         |

## Arquitectura

```
src/
├── shared/            Contratos compartidos por los dos procesos
│   ├── ipc.ts         API tipada entre Node y la interfaz
│   └── document.ts    Formato de archivo (sobre versionado + contenido de cada app)
├── main/              Proceso principal (Node): NO conoce las apps
│   ├── fileService.ts Lectura/escritura atómica
│   ├── recentsStore.ts Recientes y anclados en userData/recents.json
│   ├── ipcHandlers.ts Traduce IPC → servicios
│   └── menu.ts        Menú nativo y atajos
├── preload/           Puente seguro (contextIsolation + sandbox)
└── renderer/src/
    ├── core/          Piezas genéricas: contrato AppModule, historial deshacer/rehacer, fechas
    ├── shell/         Pantalla de inicio y ciclo de vida del documento (crear/abrir/guardar)
    ├── ui/            Componentes reutilizables: EditorLayout, cinta, selector de color
    └── apps/
        ├── index.ts   ← registro de apps instaladas
        ├── writer/    model/ (datos y estilos) · editor/ (React + Tiptap) · templates
        ├── slides/    model/ (tipos, reducer puro, geometría, temas) · editor/ (React)
        └── sheets/    model/ (celdas, motor de fórmulas, recálculo, CSV, xlsx) · editor/ (cuadrícula, barra de fórmulas)
```

Ideas clave:

1. **Cada app es un módulo** que cumple la interfaz `AppModule` (`core/appModule.ts`): id, nombre, extensión de archivo, plantillas, `parseContent` y su componente `Editor`. El inicio, los recientes, abrir/guardar y los atajos funcionan para cualquier app registrada.
2. **El proceso principal es agnóstico**: solo lee y escribe archivos. Añadir una app no toca `main/`.
3. **Lógica separada de la presentación**: el reducer de presentaciones, la geometría (mover/redimensionar/imantar), el historial y el formato de archivo son funciones puras con tests. Los componentes React solo pintan y despachan acciones.
4. **Formato de archivo versionado**: `{ format, version, appId, savedAt, content }`. Si algún día cambia la estructura, se puede migrar.
5. **Seguridad Electron por defecto**: `contextIsolation`, `sandbox`, sin `nodeIntegration`, CSP estricta y la interfaz solo ve la API mínima del preload.

### Añadir una app nueva

1. Crea `src/renderer/src/apps/<app>/` con un `index.ts` que exporte `defineApp({...})`.
2. Añádela a la lista de `src/renderer/src/apps/index.ts`.
3. Si quieres que el sistema abra sus archivos con doble clic, añade su extensión a `fileAssociations` en `electron-builder.yml`.

Nada más: aparecerá en la barra lateral del inicio con sus plantillas y recientes. Hojas de cálculo se añadió exactamente así.

### Cómo funciona el motor de fórmulas

```
"=SUMA(A1:A3;2)"  →  tokenizer.ts  →  parser.ts (AST)  →  evaluate.ts + functions.ts  →  6
                                          │
                                          └→ printer.ts: "SUM(A1:A3,2)" (se guarda) / "SUMA(A1:A3;2)" (se ve)
```

- Las fórmulas se guardan en **forma canónica** (nombres en inglés y `,`), como hace Excel por dentro. La barra de fórmulas las muestra en español. Al escribir se aceptan los dos idiomas y los dos separadores; dentro de una fórmula los decimales van con punto (`=A1*1.21`).
- `calc.ts` mantiene un **grafo de dependencias**: al cambiar una celda solo se recalculan ella y lo que depende de ella, en orden topológico (algoritmo de Kahn, sin recursión). Lo que no se puede ordenar es un ciclo y muestra `#¡CIRCULAR!`.
- Copiar, rellenar y renombrar hojas trabajan sobre el árbol (no con expresiones regulares), así que respetan `$A$1`, textos entre comillas y nombres de hoja con espacios.

## Limitaciones conocidas (y siguiente paso natural)

- **Paginación visual aproximada** en Texto: el documento es una hoja continua con marcas de salto cada A4. La paginación real es un proyecto en sí misma.
- En Diapositivas la alineación y las viñetas son del cuadro completo (el formato de carácter sí es por palabra).
- En Hojas de cálculo: no se pueden insertar ni borrar filas o columnas, no hay celdas combinadas, gráficos, formato condicional, ordenar/filtrar ni buscar; las filas tienen alto fijo; el formato de una columna o de la hoja entera se aplica solo a la zona con datos; cortar y pegar mueve las celdas pero no actualiza las fórmulas que apuntaban a ellas; al imprimir no se ajusta la hoja al ancho de la página.
- Compatibilidad con Office parcial: ver la tabla de [Compatibilidad con Office](#compatibilidad-con-office).
- El autoguardado es una copia de seguridad (cada 30 s en `userData/recovery`), no guarda sobre tu archivo: para eso sigue haciendo falta Guardar.
- Instaladores sin firmar y con el icono por defecto de Electron (falta un `build/icon.png` de 1024×1024).
