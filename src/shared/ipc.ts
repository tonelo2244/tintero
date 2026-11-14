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

/** Copia de seguridad de un documento abierto (autoguardado). */
export interface RecoverySnapshot {
  /** Id de la sesión del documento: cada documento abierto tiene el suyo. */
  id: string
  appId: string
  name: string
  /** Archivo original, o null si el documento nunca se guardó. */
  path: string | null
  savedAt: string
  /** Documento serializado (mismo formato que un .tdoc/.tpres). */
  contents: string
}

/** Lo que el renderer cuenta al proceso principal sobre el documento con cambios pendientes. */
export interface UnsavedDocument {
  name: string
  recoveryId: string
}

/** Acciones lanzadas desde el menú nativo hacia la interfaz. */
export type MenuCommand = 'new' | 'open' | 'save' | 'save-as' | 'home' | 'print' | 'export-pdf'

export interface TinteroApi {
  files: {
    /** Diálogo "Abrir": devuelve la ruta elegida o null. La lectura va aparte (texto o binario). */
    chooseFile(filters: FileFilter[]): Promise<string | null>
    read(path: string): Promise<OpenedFile>
    /** Lee un archivo binario (.docx, .pptx...). */
    readBinary(path: string): Promise<Uint8Array>
    /** Guarda en `path`; si es null pide ruta al usuario. Devuelve la ruta final o null si se canceló. */
    save(path: string | null, contents: string, suggestedName: string, filters: FileFilter[]): Promise<string | null>
    /**
     * Pide ruta con el diálogo y guarda bytes (exportaciones a .docx, .pptx...).
     * Devuelve la ruta final o null si se canceló.
     */
    saveBinary(contents: Uint8Array, suggestedName: string, filters: FileFilter[]): Promise<string | null>
    /** Archivos que el sistema pidió abrir antes de que la interfaz estuviera lista (doble clic). */
    takePendingOpenRequests(): Promise<string[]>
    /** Archivos que el sistema pide abrir con la app ya en marcha. */
    onOpenRequested(handler: (path: string) => void): () => void
  }
  recents: {
    list(): Promise<RecentFile[]>
    touch(entry: Pick<RecentFile, 'path' | 'name' | 'appId'>): Promise<RecentFile[]>
    setPinned(path: string, pinned: boolean): Promise<RecentFile[]>
    remove(path: string): Promise<RecentFile[]>
  }
  recovery: {
    save(snapshot: RecoverySnapshot): Promise<void>
    discard(id: string): Promise<void>
    /** Copias que vale la pena ofrecer al arrancar (más nuevas que su archivo). */
    listRecoverable(): Promise<RecoverySnapshot[]>
  }
  window: {
    setTitle(title: string): void
    print(): Promise<void>
    /**
     * Genera un PDF de lo que se vería al imprimir y pide dónde guardarlo.
     * Devuelve la ruta final o null si el usuario canceló.
     */
    exportPdf(suggestedName: string): Promise<string | null>
    /** Documento con cambios sin guardar, o null si está todo guardado. */
    setUnsavedChanges(document: UnsavedDocument | null): void
    /** Tras guardar a petición de `onSaveBeforeClose`: ya se puede cerrar la ventana. */
    confirmClose(): void
  }
  onMenuCommand(handler: (command: MenuCommand) => void): () => void
  /** El usuario eligió "Guardar" al cerrar la ventana. */
  onSaveBeforeClose(handler: () => void): () => void
}

export const IpcChannel = {
  FilesChooseFile: 'files:choose-file',
  FilesRead: 'files:read',
  FilesReadBinary: 'files:read-binary',
  FilesSave: 'files:save',
  FilesSaveBinary: 'files:save-binary',
  FilesTakePendingOpen: 'files:take-pending-open',
  FilesOpenRequested: 'files:open-requested',
  RecentsList: 'recents:list',
  RecentsTouch: 'recents:touch',
  RecentsSetPinned: 'recents:set-pinned',
  RecentsRemove: 'recents:remove',
  RecoverySave: 'recovery:save',
  RecoveryDiscard: 'recovery:discard',
  RecoveryList: 'recovery:list',
  WindowSetTitle: 'window:set-title',
  WindowPrint: 'window:print',
  WindowExportPdf: 'window:export-pdf',
  WindowSetUnsavedChanges: 'window:set-unsaved-changes',
  WindowSaveBeforeClose: 'window:save-before-close',
  WindowConfirmClose: 'window:confirm-close',
  MenuCommand: 'menu:command'
} as const
