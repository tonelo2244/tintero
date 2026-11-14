import { BrowserWindow, dialog, ipcMain, type WebContents } from 'electron'
import {
  IpcChannel,
  type FileFilter,
  type OpenedFile,
  type RecentFile,
  type RecoverySnapshot,
  type UnsavedDocument
} from '@shared/ipc'
import { ensureExtension, readTextFile, writeFileAtomic } from './fileService'
import { PDF_OPTIONS } from './pdfExport'
import type { OpenRequestQueue } from './openRequests'
import type { RecentsStore } from './recentsStore'
import type { RecoveryStore } from './recoveryStore'
import { closeGuardFor } from './windowCloseHandling'

/**
 * Traduce mensajes IPC a llamadas a los servicios. Aquí no hay lógica de negocio:
 * el proceso principal no sabe qué es un "documento de texto" o una "presentación",
 * solo lee y escribe archivos. Así, añadir una app nueva no obliga a tocar este archivo.
 */
export interface MainServices {
  recents: RecentsStore
  recovery: RecoveryStore
  openRequests: OpenRequestQueue
}

/** Diálogo "Guardar" nativo; devuelve la ruta con la extensión correcta o null si se canceló. */
async function askSavePath(sender: WebContents, suggestedName: string, filters: FileFilter[]): Promise<string | null> {
  const window = BrowserWindow.fromWebContents(sender)
  const options = { defaultPath: suggestedName, filters }
  const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null
  return ensureExtension(
    result.filePath,
    filters.flatMap((filter) => filter.extensions)
  )
}

export function registerIpcHandlers({ recents, recovery, openRequests }: MainServices): void {
  ipcMain.handle(IpcChannel.FilesOpenDialog, async (event, filters: FileFilter[]): Promise<OpenedFile | null> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = { properties: ['openFile' as const], filters }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    const path = result.filePaths[0]
    return { path, contents: await readTextFile(path) }
  })

  ipcMain.handle(IpcChannel.FilesRead, async (_event, path: string): Promise<OpenedFile> => {
    return { path, contents: await readTextFile(path) }
  })

  ipcMain.handle(
    IpcChannel.FilesSave,
    async (event, path: string | null, contents: string, suggestedName: string, filters: FileFilter[]) => {
      const targetPath = path ?? (await askSavePath(event.sender, suggestedName, filters))
      if (!targetPath) return null
      await writeFileAtomic(targetPath, contents)
      return targetPath
    }
  )

  // Exportaciones: main no sabe qué hay dentro de un .docx, solo escribe los bytes que le dan.
  ipcMain.handle(
    IpcChannel.FilesSaveBinary,
    async (event, contents: Uint8Array, suggestedName: string, filters: FileFilter[]) => {
      const targetPath = await askSavePath(event.sender, suggestedName, filters)
      if (!targetPath) return null
      await writeFileAtomic(targetPath, contents)
      return targetPath
    }
  )

  // La interfaz llama a esto al arrancar: a partir de ahí, las peticiones le llegan directamente.
  ipcMain.handle(IpcChannel.FilesTakePendingOpen, (event) => {
    const sender = event.sender
    const deliver = (path: string) => sender.send(IpcChannel.FilesOpenRequested, path)
    sender.once('destroyed', () => openRequests.disconnect(deliver))
    return openRequests.connect(deliver)
  })

  ipcMain.handle(IpcChannel.RecentsList, () => recents.list())
  ipcMain.handle(IpcChannel.RecentsTouch, (_event, entry: Pick<RecentFile, 'path' | 'name' | 'appId'>) =>
    recents.touch(entry)
  )
  ipcMain.handle(IpcChannel.RecentsSetPinned, (_event, path: string, pinned: boolean) =>
    recents.setPinned(path, pinned)
  )
  ipcMain.handle(IpcChannel.RecentsRemove, (_event, path: string) => recents.remove(path))

  ipcMain.on(IpcChannel.WindowSetTitle, (event, title: string) => {
    BrowserWindow.fromWebContents(event.sender)?.setTitle(title)
  })

  ipcMain.handle(IpcChannel.RecoverySave, (_event, snapshot: RecoverySnapshot) => recovery.save(snapshot))
  ipcMain.handle(IpcChannel.RecoveryDiscard, (_event, id: string) => recovery.discard(id))
  ipcMain.handle(IpcChannel.RecoveryList, () => recovery.listRecoverable())

  ipcMain.on(IpcChannel.WindowSetUnsavedChanges, (event, document: UnsavedDocument | null) => {
    closeGuardFor(event.sender)?.setDirtyDocument(document)
    // En macOS pinta el punto en el botón de cerrar, como cualquier app nativa.
    BrowserWindow.fromWebContents(event.sender)?.setDocumentEdited(document !== null)
  })

  ipcMain.on(IpcChannel.WindowConfirmClose, (event) => {
    closeGuardFor(event.sender)?.confirmSaved()
  })

  ipcMain.handle(IpcChannel.WindowPrint, (event) => {
    return new Promise<void>((resolve) => {
      event.sender.print({ printBackground: true }, () => resolve())
    })
  })

  // Mismo resultado que "Imprimir > Guardar como PDF", pero sin pasar por el diálogo del sistema.
  // Chromium pinta la página con los estilos @media print que ya usa la impresión.
  ipcMain.handle(IpcChannel.WindowExportPdf, async (event, suggestedName: string): Promise<string | null> => {
    const targetPath = await askSavePath(event.sender, suggestedName, [{ name: 'PDF', extensions: ['pdf'] }])
    if (!targetPath) return null
    const pdf = await event.sender.printToPDF(PDF_OPTIONS)
    await writeFileAtomic(targetPath, pdf)
    return targetPath
  })
}
