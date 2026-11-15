import { join } from 'node:path'
import { app, BrowserWindow, Menu, shell } from 'electron'
import { AiService } from './ai/aiService'
import { AiSettingsStore } from './ai/aiSettingsStore'
import { createRuntime } from './ai/createRuntime'
import { registerAiHandlers } from './ai/registerAiHandlers'
import { RagService } from './ai/rag/ragService'
import { RagStore } from './ai/rag/ragStore'
import { registerIpcHandlers } from './ipcHandlers'
import { buildAppMenu } from './menu'
import { documentPathsFromArgv, OpenRequestQueue } from './openRequests'
import { RecentsStore } from './recentsStore'
import { RecoveryStore } from './recoveryStore'
import { attachSpellcheck } from './spellcheck'
import { attachCloseGuard } from './windowCloseHandling'

// Antes de 'ready': define el nombre de la app y, con él, la carpeta de datos (userData).
app.setName('Tintero')

// En desarrollo usamos otra carpeta de datos. Así `npm run dev` no comparte recientes,
// recuperación ni el bloqueo de instancia única con un Tintero instalado y abierto
// (si lo compartiera, la versión de desarrollo le cedería el paso y se cerraría sin abrir nada).
if (!app.isPackaged) app.setPath('userData', join(app.getPath('appData'), 'Tintero (desarrollo)'))

// Los tests e2e arrancan cada prueba con una carpeta de datos vacía y desechable:
// sin recientes ni copias de recuperación de otra ejecución, y sin tocar tu Tintero.
if (process.env.TINTERO_USER_DATA_DIR) app.setPath('userData', process.env.TINTERO_USER_DATA_DIR)

// Una sola instancia: si la app ya está abierta y haces doble clic en un .tdoc,
// el sistema lanza un segundo proceso; este le pasa el archivo al primero y se cierra.
if (!app.requestSingleInstanceLock()) app.quit()

const openRequests = new OpenRequestQueue()
documentPathsFromArgv(process.argv, app.isPackaged).forEach((path) => openRequests.request(path))

function focusMainWindow(): void {
  const [window] = BrowserWindow.getAllWindows()
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.focus()
}

app.on('second-instance', (_event, argv) => {
  documentPathsFromArgv(argv, app.isPackaged).forEach((path) => openRequests.request(path))
  focusMainWindow()
})

// macOS no usa argv para esto: avisa con 'open-file' (puede llegar incluso antes de 'ready').
app.on('open-file', (event, path) => {
  event.preventDefault()
  openRequests.request(path)
  focusMainWindow()
})

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
  attachSpellcheck(window)

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
  registerIpcHandlers({ recents, recovery, openRequests })
  // IA local: Ollama por defecto; TINTERO_AI_RUNTIME=llamacpp usa llama-server. La URL se puede
  // cambiar (TINTERO_AI_URL o TINTERO_OLLAMA_URL), pero assertLocalEndpoint solo acepta este equipo.
  const runtime = createRuntime(
    process.env.TINTERO_AI_RUNTIME ?? 'ollama',
    process.env.TINTERO_AI_URL ?? process.env.TINTERO_OLLAMA_URL
  )
  registerAiHandlers(
    new AiService(runtime, new AiSettingsStore(join(userData, 'ai-settings.json'))),
    new RagService(runtime, new RagStore(join(userData, 'rag-index.json')))
  )
  Menu.setApplicationMenu(buildAppMenu())
  createMainWindow(recovery)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow(recovery)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
