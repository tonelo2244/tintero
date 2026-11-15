import { BrowserWindow, dialog, type WebContents } from 'electron'
import { IpcChannel, type UnsavedDocument } from '@shared/ipc'
import { WindowCloseGuard, type CloseChoice } from './closeGuard'

const guardsByWebContents = new Map<number, WindowCloseGuard>()

const BUTTONS: { label: string; choice: CloseChoice }[] = [
  { label: 'Guardar', choice: 'save' },
  { label: 'No guardar', choice: 'discard' },
  { label: 'Cancelar', choice: 'cancel' }
]

/** Conecta el `WindowCloseGuard` (lógica pura) con una ventana real de Electron. */
export interface CloseCallbacks {
  onCancel(): void
  onDiscard(document: UnsavedDocument): void
}

export function attachCloseGuard(window: BrowserWindow, callbacks: CloseCallbacks): void {
  const webContentsId = window.webContents.id

  const guard = new WindowCloseGuard({
    askUser: async (documentName) => {
      const { response } = await dialog.showMessageBox(window, {
        type: 'warning',
        buttons: BUTTONS.map((button) => button.label),
        defaultId: 0,
        cancelId: 2,
        noLink: true,
        message: `¿Quieres guardar los cambios de "${documentName}"?`,
        detail: 'Si no los guardas, se perderán.'
      })
      return BUTTONS[response]?.choice ?? 'cancel'
    },
    requestSave: () => window.webContents.send(IpcChannel.WindowSaveBeforeClose),
    close: () => window.close(),
    ...callbacks
  })

  guardsByWebContents.set(webContentsId, guard)
  window.on('close', (event) => {
    if (!guard.handleCloseAttempt()) event.preventDefault()
  })
  window.on('closed', () => guardsByWebContents.delete(webContentsId))
}

export function closeGuardFor(sender: WebContents): WindowCloseGuard | undefined {
  return guardsByWebContents.get(sender.id)
}
