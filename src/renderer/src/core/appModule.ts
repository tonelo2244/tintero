import type { ComponentType, ReactNode } from 'react'

/**
 * Contrato que cumple cada aplicación de la suite (texto, presentaciones, ...).
 * El "shell" (inicio, recientes, abrir/guardar) solo habla con esta interfaz,
 * así que añadir una app nueva = crear una carpeta en `apps/` que exporte un AppModule
 * y registrarla en `apps/index.ts`. Nada más cambia.
 */
export interface AppModule<TContent = unknown> {
  id: string
  /** Nombre completo, p. ej. "Tintero Texto". */
  name: string
  /** Nombre corto para la barra lateral, p. ej. "Texto". */
  shortName: string
  /** Color de acento de la app (cinta, botones, selección). */
  accentColor: string
  Icon: ComponentType<{ size?: number }>
  file: {
    extension: string
    label: string
  }
  /** Nombre por defecto de un documento nuevo: "Documento", "Presentación"... */
  untitledName: string
  /** Título de la galería en la pantalla de inicio ("Plantillas", "Temas"). */
  galleryTitle: string
  templates: AppTemplate<TContent>[]
  /**
   * Valida/normaliza contenido leído de disco. Lanza un Error si no es válido.
   * `fileVersion` es la versión del sobre con la que se guardó: si es antigua, la app migra
   * el contenido a su forma actual (los archivos viejos siguen abriéndose).
   */
  parseContent(raw: unknown, fileVersion: number): TContent
  Editor: ComponentType<EditorProps<TContent>>
  /**
   * Formatos externos a los que la app sabe exportar (.docx, .pptx...). Opcional: el shell
   * ofrece "Exportar" sin saber nada de cada formato; la conversión es cosa de la app.
   */
  exporters?: Exporter<TContent>[]
  /** Formatos externos que la app sabe abrir. El resultado se abre como documento nuevo sin guardar. */
  importers?: Importer<TContent>[]
}

/** Un formato de archivo de otra suite, p. ej. { extension: 'docx', label: 'Documento de Word' }. */
export interface ExternalFormat {
  extension: string
  label: string
}

export interface Exporter<TContent> {
  format: ExternalFormat
  /** Conversión pura: contenido -> bytes del archivo. Sin disco ni interfaz, para poder testearla. */
  export(content: TContent): Promise<Uint8Array>
}

export interface AppTemplate<TContent> {
  id: string
  name: string
  Preview: ComponentType
  createContent(): TContent
}

export interface ExportOption {
  id: string
  label: string
  run(): void
}

export interface Importer<TContent> {
  format: ExternalFormat
  import(bytes: Uint8Array): Promise<ImportResult<TContent>>
}

export interface ImportResult<TContent> {
  content: TContent
  /** Lo que se perdió en la conversión, en frases cortas para enseñar al usuario. */
  warnings: string[]
}

/** Lo que el shell ofrece a cada editor. */
export interface EditorSession {
  documentName: string
  isDirty: boolean
  save(): void
  saveAs(): void
  /** Formatos a los que se puede exportar este documento (PDF y los de la app). */
  exportOptions: ExportOption[]
  goHome(): void
}

export interface EditorProps<TContent> {
  initialContent: TContent
  session: EditorSession
  /** El editor avisa de cada cambio; el shell guarda la última versión y marca "sin guardar". */
  onChange(content: TContent): void
}

/** Pequeña ayuda para que cada app declare su módulo con tipos estrictos. */
export function defineApp<TContent>(module: AppModule<TContent>): AppModule<TContent> {
  return module
}

export type AnyAppModule = AppModule<any> // eslint-disable-line @typescript-eslint/no-explicit-any

export interface AppRegistry {
  all: readonly AnyAppModule[]
  get(id: string): AnyAppModule | undefined
  /** App e importador capaces de abrir un archivo externo por su extensión (p. ej. "docx"). */
  findImporter(extension: string): { app: AnyAppModule; importer: Importer<unknown> } | undefined
}

export function createAppRegistry(modules: AnyAppModule[]): AppRegistry {
  const byId = new Map(modules.map((module) => [module.id, module]))
  if (byId.size !== modules.length) throw new Error('Hay dos apps registradas con el mismo id.')

  const importers = new Map<string, { app: AnyAppModule; importer: Importer<unknown> }>()
  for (const app of modules) {
    for (const importer of app.importers ?? []) {
      const extension = importer.format.extension.toLowerCase()
      if (importers.has(extension)) throw new Error(`Hay dos apps que importan archivos .${extension}.`)
      importers.set(extension, { app, importer })
    }
  }

  return {
    all: modules,
    get: (id) => byId.get(id),
    findImporter: (extension) => importers.get(extension.toLowerCase())
  }
}

/** "/docs/Informe.DOCX" -> "docx". Cadena vacía si no tiene extensión. */
export function extensionOf(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

export type { ReactNode }
