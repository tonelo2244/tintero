import { contextBridge, ipcRenderer } from 'electron'
import { AiChannel, type AiApi } from '@shared/ai'
import { IpcChannel, type MenuCommand, type TinteroApi } from '@shared/ipc'

let nextAiRequest = 0

/**
 * IPC no puede pasar funciones (callbacks) entre procesos. Así que cada generación lleva un id:
 * main manda los trozos de texto como eventos con ese id y aquí se reparten a quien los pidió.
 */
const ai: AiApi = {
  status: () => ipcRenderer.invoke(AiChannel.Status),
  setModel: (model) => ipcRenderer.invoke(AiChannel.SetModel, model),
  generate: (request, onToken) => {
    const requestId = `ai-${Date.now()}-${nextAiRequest++}`
    const listener = (_event: Electron.IpcRendererEvent, id: string, chunk: string) => {
      if (id === requestId) onToken?.(chunk)
    }
    ipcRenderer.on(AiChannel.Token, listener)
    const result = ipcRenderer
      .invoke(AiChannel.Generate, requestId, request)
      .finally(() => ipcRenderer.removeListener(AiChannel.Token, listener))
    return { result, cancel: () => ipcRenderer.send(AiChannel.Cancel, requestId) }
  }
}

/**
 * Puente seguro entre la interfaz y Node. Solo expone funciones concretas,
 * nunca `ipcRenderer` completo (eso permitiría a cualquier script llamar a todo).
 */
const api: TinteroApi = {
  files: {
    chooseFile: (filters) => ipcRenderer.invoke(IpcChannel.FilesChooseFile, filters),
    read: (path) => ipcRenderer.invoke(IpcChannel.FilesRead, path),
    readBinary: (path) => ipcRenderer.invoke(IpcChannel.FilesReadBinary, path),
    save: (path, contents, suggestedName, filters) =>
      ipcRenderer.invoke(IpcChannel.FilesSave, path, contents, suggestedName, filters),
    saveBinary: (contents, suggestedName, filters) =>
      ipcRenderer.invoke(IpcChannel.FilesSaveBinary, contents, suggestedName, filters),
    takePendingOpenRequests: () => ipcRenderer.invoke(IpcChannel.FilesTakePendingOpen),
    onOpenRequested: (handler) => {
      const listener = (_event: Electron.IpcRendererEvent, path: string) => handler(path)
      ipcRenderer.on(IpcChannel.FilesOpenRequested, listener)
      return () => ipcRenderer.removeListener(IpcChannel.FilesOpenRequested, listener)
    }
  },
  recents: {
    list: () => ipcRenderer.invoke(IpcChannel.RecentsList),
    touch: (entry) => ipcRenderer.invoke(IpcChannel.RecentsTouch, entry),
    setPinned: (path, pinned) => ipcRenderer.invoke(IpcChannel.RecentsSetPinned, path, pinned),
    remove: (path) => ipcRenderer.invoke(IpcChannel.RecentsRemove, path)
  },
  recovery: {
    save: (snapshot) => ipcRenderer.invoke(IpcChannel.RecoverySave, snapshot),
    discard: (id) => ipcRenderer.invoke(IpcChannel.RecoveryDiscard, id),
    listRecoverable: () => ipcRenderer.invoke(IpcChannel.RecoveryList)
  },
  window: {
    setTitle: (title) => ipcRenderer.send(IpcChannel.WindowSetTitle, title),
    print: () => ipcRenderer.invoke(IpcChannel.WindowPrint),
    exportPdf: (suggestedName) => ipcRenderer.invoke(IpcChannel.WindowExportPdf, suggestedName),
    setUnsavedChanges: (document) => ipcRenderer.send(IpcChannel.WindowSetUnsavedChanges, document),
    confirmClose: () => ipcRenderer.send(IpcChannel.WindowConfirmClose)
  },
  ai,
  onMenuCommand: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, command: MenuCommand) => handler(command)
    ipcRenderer.on(IpcChannel.MenuCommand, listener)
    return () => ipcRenderer.removeListener(IpcChannel.MenuCommand, listener)
  },
  onSaveBeforeClose: (handler) => {
    const listener = () => handler()
    ipcRenderer.on(IpcChannel.WindowSaveBeforeClose, listener)
    return () => ipcRenderer.removeListener(IpcChannel.WindowSaveBeforeClose, listener)
  }
}

contextBridge.exposeInMainWorld('tintero', api)
