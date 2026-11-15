import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type MenuCommand, type TinteroApi } from '@shared/ipc'

/**
 * Puente seguro entre la interfaz y Node. Solo expone funciones concretas,
 * nunca `ipcRenderer` completo (eso permitiría a cualquier script llamar a todo).
 */
const api: TinteroApi = {
  files: {
    showOpenDialog: (filters) => ipcRenderer.invoke(IpcChannel.FilesOpenDialog, filters),
    read: (path) => ipcRenderer.invoke(IpcChannel.FilesRead, path),
    save: (path, contents, suggestedName, filters) =>
      ipcRenderer.invoke(IpcChannel.FilesSave, path, contents, suggestedName, filters)
  },
  recents: {
    list: () => ipcRenderer.invoke(IpcChannel.RecentsList),
    touch: (entry) => ipcRenderer.invoke(IpcChannel.RecentsTouch, entry),
    setPinned: (path, pinned) => ipcRenderer.invoke(IpcChannel.RecentsSetPinned, path, pinned),
    remove: (path) => ipcRenderer.invoke(IpcChannel.RecentsRemove, path)
  },
  window: {
    setTitle: (title) => ipcRenderer.send(IpcChannel.WindowSetTitle, title),
    print: () => ipcRenderer.invoke(IpcChannel.WindowPrint),
    setUnsavedChanges: (documentName) => ipcRenderer.send(IpcChannel.WindowSetUnsavedChanges, documentName),
    confirmClose: () => ipcRenderer.send(IpcChannel.WindowConfirmClose)
  },
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
