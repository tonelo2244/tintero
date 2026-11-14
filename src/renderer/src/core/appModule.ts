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
  /** Valida/normaliza contenido leído de disco. Lanza un Error si no es válido. */
  parseContent(raw: unknown): TContent
  Editor: ComponentType<EditorProps<TContent>>
}

export interface AppTemplate<TContent> {
  id: string
  name: string
  Preview: ComponentType
  createContent(): TContent
}

/** Lo que el shell ofrece a cada editor. */
export interface EditorSession {
  documentName: string
  isDirty: boolean
  save(): void
  saveAs(): void
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
}

export function createAppRegistry(modules: AnyAppModule[]): AppRegistry {
  const byId = new Map(modules.map((module) => [module.id, module]))
  if (byId.size !== modules.length) throw new Error('Hay dos apps registradas con el mismo id.')
  return { all: modules, get: (id) => byId.get(id) }
}

export type { ReactNode }
