import { useEffect, useRef, useState } from 'react'
import type { RecoverySnapshot } from '@shared/ipc'
import { installedApps } from '@/apps'
import { platform } from '@/core/platform'
import { Launcher } from '@/shell/Launcher'
import { NoticeBar } from '@/shell/NoticeBar'
import { RecoveryBar } from '@/shell/RecoveryBar'
import { useAutosave } from '@/shell/useAutosave'
import { useDocumentSession } from '@/shell/useDocumentSession'

const LAST_APP_KEY = 'tintero:last-app'

function readLastAppId(): string {
  try {
    const saved = localStorage.getItem(LAST_APP_KEY)
    if (saved && installedApps.get(saved)) return saved
  } catch {
    /* almacenamiento no disponible: usamos la primera app */
  }
  return installedApps.all[0].id
}

export function App() {
  const session = useDocumentSession(installedApps)
  const [launcherAppId, setLauncherAppId] = useState(readLastAppId)
  const launcherApp = installedApps.get(launcherAppId) ?? installedApps.all[0]
  const [recoverable, setRecoverable] = useState<RecoverySnapshot[]>([])

  useAutosave(session.takeRecoverySnapshot)

  // Al arrancar: ¿quedó algún documento sin guardar de la última vez?
  useEffect(() => {
    platform.recovery
      .listRecoverable()
      .then(setRecoverable)
      .catch(() => setRecoverable([]))
  }, [])

  // Archivos abiertos desde el sistema (doble clic en un .tdoc/.tpres). Nos suscribimos una
  // sola vez y leemos la función actual desde una ref, para no reconectar en cada render.
  const openPathRef = useRef(session.openPath)
  useEffect(() => {
    openPathRef.current = session.openPath
  }, [session.openPath])

  useEffect(() => {
    const unsubscribe = platform.files.onOpenRequested((path) => void openPathRef.current(path))
    void platform.files.takePendingOpenRequests().then((paths) => {
      // Una sola ventana: si llegan varios a la vez, abrimos el último.
      const last = paths.at(-1)
      if (last) void openPathRef.current(last)
    })
    return unsubscribe
  }, [])

  const removeFromRecoverable = (snapshot: RecoverySnapshot) =>
    setRecoverable((list) => list.filter((item) => item.id !== snapshot.id))

  const selectLauncherApp = (id: string) => {
    setLauncherAppId(id)
    try {
      localStorage.setItem(LAST_APP_KEY, id)
    } catch {
      /* no es crítico */
    }
  }

  const { document, isDirty } = session

  useEffect(() => {
    const title = document ? `${document.name}${isDirty ? ' (sin guardar)' : ''} — ${document.app.name}` : 'Tintero'
    platform.window.setTitle(title)
    // El proceso principal necesita saberlo ANTES de que el usuario cierre la ventana.
    platform.window.setUnsavedChanges(
      document && isDirty ? { name: document.name, recoveryId: document.recoveryId } : null
    )
  }, [document, isDirty])

  useEffect(() => {
    return platform.onSaveBeforeClose(async () => {
      if (await session.save()) platform.window.confirmClose()
    })
  }, [session])

  // Atajos del menú nativo (Cmd/Ctrl+S, etc.). Se re-suscribe cuando cambia la sesión
  // para que los callbacks siempre vean el documento actual.
  useEffect(() => {
    return platform.onMenuCommand((command) => {
      switch (command) {
        case 'save':
          if (document) void session.save()
          break
        case 'save-as':
          if (document) void session.saveAs()
          break
        case 'open':
          void session.openWithDialog()
          break
        case 'home':
          session.close()
          break
        case 'new': {
          const app = document?.app ?? launcherApp
          session.createFromTemplate(app, app.templates[0])
          break
        }
        case 'print':
          if (document) void platform.window.print()
          break
        case 'export-pdf':
          void session.exportPdf()
          break
      }
    })
  }, [document, launcherApp, session])

  return (
    <div className="app-root">
      <RecoveryBar
        snapshots={recoverable}
        onRecover={(snapshot) => {
          if (session.openRecovered(snapshot)) removeFromRecoverable(snapshot)
        }}
        onDiscard={(snapshot) => {
          removeFromRecoverable(snapshot)
          void platform.recovery.discard(snapshot.id).catch(() => {})
        }}
      />
      {session.notice && <NoticeBar message={session.notice} onDismiss={session.dismissNotice} />}
      {document ? (
        <document.app.Editor
          key={document.key}
          initialContent={document.initialContent}
          onChange={session.handleContentChange}
          session={{
            documentName: document.name,
            filePath: document.path,
            isDirty,
            save: () => void session.save(),
            saveAs: () => void session.saveAs(),
            exportOptions: session.exportOptions,
            goHome: () => {
              if (session.close()) selectLauncherApp(document.app.id)
            },
            openNewDocument: (...args) => void session.createFromContent(...args)
          }}
        />
      ) : (
        <Launcher
          apps={installedApps.all}
          activeApp={launcherApp}
          onSelectApp={selectLauncherApp}
          onCreate={session.createFromTemplate}
          onOpenDialog={() => void session.openWithDialog()}
          onOpenRecent={session.openRecent}
        />
      )}
    </div>
  )
}
