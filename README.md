# Tintero

Suite ofimática **100 % local** (sin nube, sin cuentas) con dos aplicaciones:

- **Tintero Texto**: procesador de textos con cinta _Inicio_ (fuente, tamaño, negrita, cursiva, subrayado, tachado, subíndice/superíndice, color de fuente y resaltado, viñetas, numeración, sangría, alineación, interlineado, galería de estilos Normal / Título 1-3 / Título / Subtítulo / Cita), pestaña _Insertar_ (imagen, línea, fecha, cita, código), barra de estado con páginas, palabras y zoom.
- **Tintero Diapositivas**: editor de presentaciones con miniaturas reordenables, diseños de diapositiva (título, título y contenido, sección…), cuadros de texto, imágenes, formas, notas del orador, 5 temas, deshacer/rehacer y modo presentación a pantalla completa (F5).

Ambas comparten una pantalla de inicio con plantillas/temas, **Recientes** y **Anclado**, y guardan en tu disco (`.tdoc` y `.tpres`).

## Requisitos y arranque

- Node.js 20 o superior

```bash
npm install
npm run dev        # abre la app en modo desarrollo (recarga en caliente)
npm test           # tests unitarios (Vitest)
npm run typecheck  # comprobación de tipos
npm run build      # compila a ./out
```

Atajos: `Cmd/Ctrl+N` nuevo, `Cmd/Ctrl+O` abrir, `Cmd/Ctrl+S` guardar, `Cmd/Ctrl+Shift+S` guardar como, `Cmd/Ctrl+P` imprimir (o _Guardar como PDF_ desde el diálogo de impresión), `F5` presentar.

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
- No importa/exporta `.docx`/`.pptx` todavía; sí imprime y exporta a PDF desde el diálogo de impresión.
- Sin autoguardado (al cerrar la ventana con cambios sí pregunta si quieres guardar).
- Sin empaquetado en `.app`/`.exe` (se añadiría con `electron-builder`).
