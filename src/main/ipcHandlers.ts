import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannel, type FileFilter, type OpenedFile, type RecentFile } from '@shared/ipc'
import { ensureExtension, readTextFile, writeFileAtomic } from './fileService'
import type { RecentsStore } from './recentsStore'

/**
 * Traduce mensajes IPC a llamadas a los servicios. Aquí no hay lógica de negocio:
 * el proceso principal no sabe qué es un "documento de texto" o una "presentación",
 * solo lee y escribe archivos. Así, añadir una app nueva no obliga a tocar este archivo.
 */
export function registerIpcHandlers(recents: RecentsStore): void {
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
      let targetPath = path
      if (!targetPath) {
        const window = BrowserWindow.fromWebContents(event.sender)
        const options = { defaultPath: suggestedName, filters }
        const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
        if (result.canceled || !result.filePath) return null
        targetPath = ensureExtension(
          result.filePath,
          filters.flatMap((filter) => filter.extensions)
        )
      }
      await writeFileAtomic(targetPath, contents)
      return targetPath
    }
  )

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

  ipcMain.handle(IpcChannel.WindowPrint, (event) => {
    return new Promise<void>((resolve) => {
      event.sender.print({ printBackground: true }, () => resolve())
    })
  })
}
