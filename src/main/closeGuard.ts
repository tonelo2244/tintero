import type { UnsavedDocument } from '@shared/ipc'

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
  /** El usuario eligió "No guardar": hay que olvidar también la copia de recuperación. */
  onDiscard(document: UnsavedDocument): void
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
  private dirtyDocument: UnsavedDocument | null = null
  private closeAllowed = false
  private isAsking = false

  constructor(private readonly deps: CloseGuardDeps) {}

  /** `null` = no hay cambios pendientes. */
  setDirtyDocument(document: UnsavedDocument | null): void {
    this.dirtyDocument = document
  }

  /** Devuelve true si la ventana puede cerrarse ya; false si hay que cancelar el cierre. */
  handleCloseAttempt(): boolean {
    if (this.closeAllowed || this.dirtyDocument === null) return true
    if (!this.isAsking) void this.ask(this.dirtyDocument)
    return false
  }

  confirmSaved(): void {
    this.forceClose()
  }

  private async ask(document: UnsavedDocument): Promise<void> {
    this.isAsking = true
    try {
      const choice = await this.deps.askUser(document.name)
      if (choice === 'discard') {
        this.deps.onDiscard(document)
        this.forceClose()
      } else if (choice === 'save') this.deps.requestSave()
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
