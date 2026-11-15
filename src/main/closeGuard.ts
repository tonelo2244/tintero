export type CloseChoice = 'save' | 'discard' | 'cancel'

export interface CloseGuardDeps {
  /** Pregunta al usuario qué hacer con los cambios (en la app real, un diálogo nativo). */
  askUser(documentName: string): Promise<CloseChoice>
  /** Pide a la interfaz que guarde; si lo consigue, llamará a `confirmSaved()`. */
  requestSave(): void
  /** Cierra la ventana de verdad. */
  close(): void
  /** El usuario se arrepintió: sirve para anular un "Salir" en curso. */
  onCancel(): void
}

/**
 * Decide si una ventana puede cerrarse. No importa nada de Electron: recibe sus
 * dependencias por parámetro, así se prueba con funciones falsas y sin abrir ventanas.
 *
 * El renderer avisa de cada cambio en el estado "sin guardar" (`setDirtyDocument`),
 * de modo que al cerrar la decisión es inmediata: el evento `close` de Electron
 * exige saber en el momento si hay que llamar a `preventDefault()`.
 */
export class WindowCloseGuard {
  private dirtyDocumentName: string | null = null
  private closeAllowed = false
  private isAsking = false

  constructor(private readonly deps: CloseGuardDeps) {}

  /** `null` = no hay cambios pendientes. */
  setDirtyDocument(name: string | null): void {
    this.dirtyDocumentName = name
  }

  get hasUnsavedChanges(): boolean {
    return this.dirtyDocumentName !== null
  }

  /** Devuelve true si la ventana puede cerrarse ya; false si hay que cancelar el cierre. */
  handleCloseAttempt(): boolean {
    if (this.closeAllowed || this.dirtyDocumentName === null) return true
    if (!this.isAsking) void this.ask(this.dirtyDocumentName)
    return false
  }

  confirmSaved(): void {
    this.forceClose()
  }

  private async ask(documentName: string): Promise<void> {
    this.isAsking = true
    try {
      const choice = await this.deps.askUser(documentName)
      if (choice === 'discard') this.forceClose()
      else if (choice === 'save') this.deps.requestSave()
      else this.deps.onCancel()
    } finally {
      this.isAsking = false
    }
  }

  private forceClose(): void {
    this.closeAllowed = true
    this.deps.close()
  }
}
