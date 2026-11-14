# Tintero

Suite ofimática **100 % local** (sin nube, sin cuentas) con dos aplicaciones:

- **Tintero Texto**: procesador de textos con cinta _Inicio_ (fuente, tamaño, negrita, cursiva, subrayado, tachado, subíndice/superíndice, color de fuente y resaltado, viñetas, numeración, sangría, alineación, interlineado, galería de estilos Normal / Título 1-3 / Título / Subtítulo / Cita), pestaña _Insertar_ (imagen, línea, fecha, cita, código), barra de estado con páginas, palabras y zoom.
- **Tintero Diapositivas**: editor de presentaciones con miniaturas reordenables, diseños de diapositiva (título, título y contenido, sección…), cuadros de texto, imágenes, formas, notas del orador, 5 temas, deshacer/rehacer y modo presentación a pantalla completa (F5).

Ambas comparten una pantalla de inicio con plantillas/temas, **Recientes** y **Anclado**, y guardan en tu disco (`.tdoc` y `.tpres`).

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

Los instaladores asocian `.tdoc` y `.tpres` con Tintero (doble clic para abrir) y la app usa una sola instancia: si ya está abierta, el archivo se abre en ella.

**Sin firma de código.** Firmar cuesta dinero (Apple Developer, certificado de Windows), así que de momento:

- **macOS**: la app lleva firma _ad-hoc_ (sin certificado de Apple). La primera vez, intenta abrirla y después ve a _Ajustes del Sistema → Privacidad y seguridad → Abrir igualmente_. Si aun así dice que "está dañada", ejecuta `xattr -cr /Applications/Tintero.app`.
- **Windows**: SmartScreen avisará; _Más información → Ejecutar de todas formas_.
- **Linux**: `chmod +x Tintero-*.AppImage`. El AppImage no registra la asociación de archivos por sí solo; para eso hace falta integrarlo en el escritorio (p. ej. con AppImageLauncher).

Atajos: `Cmd/Ctrl+N` nuevo, `Cmd/Ctrl+O` abrir, `Cmd/Ctrl+S` guardar, `Cmd/Ctrl+Shift+S` guardar como, `Cmd/Ctrl+P` imprimir, `Cmd/Ctrl+Shift+E` exportar a PDF, `F5` presentar.

## Compatibilidad con Office

El botón **Exportar** de la barra superior (icono de descarga) ofrece los formatos de cada app. Exportar crea una **copia**: sigues editando tu `.tdoc`/`.tpres`, y el siguiente `Cmd/Ctrl+S` no sobrescribe el archivo exportado.

| App          | Exportar   | Importar  |
| ------------ | ---------- | --------- |
| Texto        | PDF, .docx | .docx     |
| Diapositivas | PDF        | pendiente |

**Importar** (Abrir… y elegir un `.docx`) abre una **copia sin guardar**: al guardar se crea un `.tdoc` nuevo y el original no se toca. Al terminar, un aviso dice exactamente qué no se ha podido conservar en ese archivo.

**Qué se pierde al importar un .docx:** se conserva la estructura (títulos, Título/Subtítulo/Cita, listas, negrita, cursiva, subrayado, tachado, sub/superíndice, enlaces, imágenes y notas al pie), pero no el formato aplicado a mano: fuente, tamaño, color, resaltado y alineación. Las tablas se convierten en párrafos (Tintero Texto aún no tiene tablas). Tampoco se importan encabezados, pies de página, comentarios ni cuadros de texto. Es una decisión de la librería que usamos (mammoth), que prioriza la estructura sobre el aspecto.

**Qué se pierde al exportar a .docx:** el resaltado se guarda como sombreado (Word solo tiene 16 colores de resaltado, el sombreado admite cualquiera); las imágenes que no son PNG, JPEG, GIF o BMP (p. ej. SVG o WebP) se omiten; la paginación la decide Word, así que los saltos de página pueden caer en otro sitio.

## Stack y por qué

| Pieza           | Elección                       | Motivo                                                                                                                                                                         |
| --------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Escritorio      | **Electron**                   | Acceso a disco y diálogos nativos con JavaScript/TypeScript puro. Tauri da binarios más pequeños pero exige Rust para la parte nativa: más fricción ahora mismo para aprender. |
| Build           | **electron-vite** (Vite)       | Una sola configuración para proceso principal, preload e interfaz; recarga instantánea.                                                                                        |
| UI              | **React + TypeScript**         | Estándar de la industria; tipos estrictos en todo el proyecto.                                                                                                                 |
| Editor de texto | **Tiptap** (sobre ProseMirror) | Escribir un editor de texto enriquecido desde cero es un pozo sin fondo. ProseMirror es lo que usan productos serios (NYT, Atlassian…).                                        |
| Presentaciones  | Modelo propio + reducer puro   | No hay una librería que encaje; el modelo es simple (cajas posicionadas) y así queda 100 % testeable.                                                                          |
| Iconos          | lucide-react                   | Iconos libres, sin marcas registradas.                                                                                                                                         |
| Tests           | Vitest                         | Misma configuración que Vite.                                                                                                                                                  |

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
        └── slides/    model/ (tipos, reducer puro, geometría, temas) · editor/ (React)
```

Ideas clave:

1. **Cada app es un módulo** que cumple la interfaz `AppModule` (`core/appModule.ts`): id, nombre, extensión de archivo, plantillas, `parseContent` y su componente `Editor`. El inicio, los recientes, abrir/guardar y los atajos funcionan para cualquier app registrada.
2. **El proceso principal es agnóstico**: solo lee y escribe archivos. Añadir una app no toca `main/`.
3. **Lógica separada de la presentación**: el reducer de presentaciones, la geometría (mover/redimensionar/imantar), el historial y el formato de archivo son funciones puras con tests. Los componentes React solo pintan y despachan acciones.
4. **Formato de archivo versionado**: `{ format, version, appId, savedAt, content }`. Si algún día cambia la estructura, se puede migrar.
5. **Seguridad Electron por defecto**: `contextIsolation`, `sandbox`, sin `nodeIntegration`, CSP estricta y la interfaz solo ve la API mínima del preload.

### Añadir una app nueva (p. ej. hojas de cálculo)

1. Crea `src/renderer/src/apps/sheets/` con un `index.ts` que exporte `defineApp({...})`.
2. Añádela a la lista de `src/renderer/src/apps/index.ts`.

Nada más: aparecerá en la barra lateral del inicio con sus plantillas y recientes.

## Limitaciones conocidas (y siguiente paso natural)

- **Paginación visual aproximada** en Texto: el documento es una hoja continua con marcas de salto cada A4. La paginación real es un proyecto en sí misma.
- El formato de texto en Diapositivas se aplica al **cuadro completo**, no a palabras sueltas (se podría reutilizar Tiptap dentro de cada cuadro).
- Compatibilidad con Office parcial: ver la tabla de [Compatibilidad con Office](#compatibilidad-con-office).
- El autoguardado es una copia de seguridad (cada 30 s en `userData/recovery`), no guarda sobre tu archivo: para eso sigue haciendo falta Guardar.
- Instaladores sin firmar y con el icono por defecto de Electron (falta un `build/icon.png` de 1024×1024).
