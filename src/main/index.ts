import { join } from 'node:path'
import { app, BrowserWindow, Menu, shell } from 'electron'
import { registerIpcHandlers } from './ipcHandlers'
import { buildAppMenu } from './menu'
import { RecentsStore } from './recentsStore'
import { RecoveryStore } from './recoveryStore'
import { attachCloseGuard } from './windowCloseHandling'

// Antes de 'ready': define el nombre de la app y, con él, la carpeta de datos (userData).
app.setName('Tintero')

// Si una ventana bloquea el cierre por cambios sin guardar, Electron anula el "Salir".
// Lo recordamos para retomarlo cuando el usuario haya guardado o descartado.
let isQuitting = false
app.on('before-quit', () => {
  isQuitting = true
})

function createMainWindow(recovery: RecoveryStore): BrowserWindow {
  const window = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Tintero',
    backgroundColor: '#f3f3f3',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Seguridad: la interfaz no tiene acceso directo a Node;
      // solo a la API mínima que expone el preload.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.once('ready-to-show', () => window.show())

  attachCloseGuard(window, {
    onCancel: () => {
      isQuitting = false
    },
    // "No guardar" es una decisión explícita: la copia de recuperación sobra.
    onDiscard: (document) => void recovery.discard(document.recoveryId).catch(() => {})
  })
  window.on('closed', () => {
    if (isQuitting) app.quit()
  })

  // Los enlaces externos se abren en el navegador del sistema, nunca dentro de la app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}

app.whenReady().then(() => {
  const userData = app.getPath('userData')
  const recents = new RecentsStore(join(userData, 'recents.json'))
  const recovery = new RecoveryStore(join(userData, 'recovery'))
  registerIpcHandlers(recents, recovery)
  Menu.setApplicationMenu(buildAppMenu())
  createMainWindow(recovery)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow(recovery)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
