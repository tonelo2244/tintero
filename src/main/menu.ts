import { BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { IpcChannel, type MenuCommand } from '@shared/ipc'

function send(command: MenuCommand): void {
  BrowserWindow.getFocusedWindow()?.webContents.send(IpcChannel.MenuCommand, command)
}

/** Menú nativo con atajos estándar (Cmd/Ctrl+S, Cmd/Ctrl+O...). */
export function buildAppMenu(): Menu {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'Archivo',
      submenu: [
        { label: 'Inicio', accelerator: 'CmdOrCtrl+Shift+H', click: () => send('home') },
        { label: 'Nuevo', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
        { label: 'Abrir…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { type: 'separator' },
        { label: 'Guardar', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Guardar como…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('save-as') },
        { type: 'separator' },
        { label: 'Exportar a PDF…', accelerator: 'CmdOrCtrl+Shift+E', click: () => send('export-pdf') },
        { label: 'Imprimir…', accelerator: 'CmdOrCtrl+P', click: () => send('print') },
        ...(isMac ? [] : [{ type: 'separator' as const }, { role: 'quit' as const, label: 'Salir' }])
      ]
    },
    { role: 'editMenu', label: 'Edición' },
    { role: 'viewMenu', label: 'Ver' },
    { role: 'windowMenu', label: 'Ventana' }
  ]

  return Menu.buildFromTemplate(template)
}
