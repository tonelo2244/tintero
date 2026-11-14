/**
 * Contrato entre el proceso principal (Node) y la interfaz (renderer).
 * Es el único punto en el que ambos lados se "conocen": si añades un canal,
 * lo declaras aquí y TypeScript te obliga a implementarlo en los dos lados.
 */

export interface FileFilter {
  name: string
  extensions: string[]
}

export interface OpenedFile {
  path: string
  /** Contenido crudo del archivo (JSON serializado). */
  contents: string
}

export interface RecentFile {
  path: string
  /** Nombre visible (sin extensión). */
  name: string
  /** Id de la app que sabe abrir este archivo (p. ej. "writer"). */
  appId: string
  lastOpenedAt: string
  pinned: boolean
}

/** Acciones lanzadas desde el menú nativo hacia la interfaz. */
export type MenuCommand = 'new' | 'open' | 'save' | 'save-as' | 'home' | 'print'

export interface TinteroApi {
  files: {
    showOpenDialog(filters: FileFilter[]): Promise<OpenedFile | null>
    read(path: string): Promise<OpenedFile>
    /** Guarda en `path`; si es null pide ruta al usuario. Devuelve la ruta final o null si se canceló. */
    save(path: string | null, contents: string, suggestedName: string, filters: FileFilter[]): Promise<string | null>
  }
  recents: {
    list(): Promise<RecentFile[]>
    touch(entry: Pick<RecentFile, 'path' | 'name' | 'appId'>): Promise<RecentFile[]>
    setPinned(path: string, pinned: boolean): Promise<RecentFile[]>
    remove(path: string): Promise<RecentFile[]>
  }
  window: {
    setTitle(title: string): void
    print(): Promise<void>
    /** Nombre del documento con cambios sin guardar, o null si está todo guardado. */
    setUnsavedChanges(documentName: string | null): void
    /** Tras guardar a petición de `onSaveBeforeClose`: ya se puede cerrar la ventana. */
    confirmClose(): void
  }
  onMenuCommand(handler: (command: MenuCommand) => void): () => void
  /** El usuario eligió "Guardar" al cerrar la ventana. */
  onSaveBeforeClose(handler: () => void): () => void
}

export const IpcChannel = {
  FilesOpenDialog: 'files:open-dialog',
  FilesRead: 'files:read',
  FilesSave: 'files:save',
  RecentsList: 'recents:list',
  RecentsTouch: 'recents:touch',
  RecentsSetPinned: 'recents:set-pinned',
  RecentsRemove: 'recents:remove',
  WindowSetTitle: 'window:set-title',
  WindowPrint: 'window:print',
  WindowSetUnsavedChanges: 'window:set-unsaved-changes',
  WindowSaveBeforeClose: 'window:save-before-close',
  WindowConfirmClose: 'window:confirm-close',
  MenuCommand: 'menu:command'
} as const
