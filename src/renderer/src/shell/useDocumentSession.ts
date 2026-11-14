import { useCallback, useRef, useState } from 'react'
import { displayNameFromPath, parseDocument, serializeDocument } from '@shared/document'
import type { FileFilter, RecentFile } from '@shared/ipc'
import type { AnyAppModule, AppRegistry, AppTemplate } from '@/core/appModule'
import { platform } from '@/core/platform'

export interface OpenDocument {
  /** Cambia cada vez que se abre/crea un documento: fuerza a React a montar un editor limpio. */
  key: number
  app: AnyAppModule
  path: string | null
  name: string
  initialContent: unknown
}

const fileFilterFor = (app: AnyAppModule): FileFilter => ({ name: app.file.label, extensions: [app.file.extension] })

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Lógica de "ciclo de vida del documento": crear, abrir, guardar, cerrar.
 * Vive separada de los componentes visuales para que se pueda leer (y probar) sin UI.
 */
export function useDocumentSession(registry: AppRegistry) {
  const [document, setDocument] = useState<OpenDocument | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const latestContent = useRef<unknown>(null)
  const nextKey = useRef(1)
  const untitledCounters = useRef(new Map<string, number>())

  const confirmDiscard = useCallback((): boolean => {
    if (!document || !isDirty) return true
    return window.confirm(`"${document.name}" tiene cambios sin guardar. ¿Quieres descartarlos?`)
  }, [document, isDirty])

  const show = useCallback((next: Omit<OpenDocument, 'key'>) => {
    latestContent.current = next.initialContent
    setDocument({ ...next, key: nextKey.current++ })
    setIsDirty(false)
    setNotice(null)
  }, [])

  const createFromTemplate = useCallback(
    (app: AnyAppModule, template: AppTemplate<unknown>) => {
      if (!confirmDiscard()) return
      const count = (untitledCounters.current.get(app.id) ?? 0) + 1
      untitledCounters.current.set(app.id, count)
      show({ app, path: null, name: `${app.untitledName}${count}`, initialContent: template.createContent() })
    },
    [confirmDiscard, show]
  )

  const openFromContents = useCallback(
    async (path: string, contents: string) => {
      const envelope = parseDocument(contents)
      const app = registry.get(envelope.appId)
      if (!app) throw new Error(`No hay ninguna app instalada que sepa abrir archivos de tipo "${envelope.appId}".`)
      const name = displayNameFromPath(path)
      show({ app, path, name, initialContent: app.parseContent(envelope.content) })
      await platform.recents.touch({ path, name, appId: app.id })
    },
    [registry, show]
  )

  const openWithDialog = useCallback(async () => {
    if (!confirmDiscard()) return
    try {
      const filters: FileFilter[] = [
        { name: 'Documentos de Tintero', extensions: registry.all.map((app) => app.file.extension) },
        ...registry.all.map(fileFilterFor)
      ]
      const opened = await platform.files.showOpenDialog(filters)
      if (opened) await openFromContents(opened.path, opened.contents)
    } catch (error) {
      setNotice(`No se pudo abrir el archivo. ${errorMessage(error)}`)
    }
  }, [confirmDiscard, openFromContents, registry])

  /** Devuelve false si el archivo ya no existe, para que el inicio ofrezca quitarlo de la lista. */
  const openRecent = useCallback(
    async (recent: RecentFile): Promise<boolean> => {
      if (!confirmDiscard()) return true
      try {
        const opened = await platform.files.read(recent.path)
        await openFromContents(opened.path, opened.contents)
        return true
      } catch (error) {
        setNotice(`No se pudo abrir "${recent.name}". ${errorMessage(error)}`)
        return false
      }
    },
    [confirmDiscard, openFromContents]
  )

  const save = useCallback(
    async (forceNewPath = false) => {
      if (!document) return
      try {
        const contents = serializeDocument(document.app.id, latestContent.current)
        const path = await platform.files.save(
          forceNewPath ? null : document.path,
          contents,
          `${document.name}.${document.app.file.extension}`,
          [fileFilterFor(document.app)]
        )
        if (!path) return // el usuario canceló el diálogo
        const name = displayNameFromPath(path)
        setDocument((current) => (current ? { ...current, path, name } : current))
        setIsDirty(false)
        await platform.recents.touch({ path, name, appId: document.app.id })
      } catch (error) {
        setNotice(`No se pudo guardar. ${errorMessage(error)}`)
      }
    },
    [document]
  )

  const close = useCallback((): boolean => {
    if (!confirmDiscard()) return false
    setDocument(null)
    setIsDirty(false)
    return true
  }, [confirmDiscard])

  const handleContentChange = useCallback((content: unknown) => {
    latestContent.current = content
    setIsDirty(true)
  }, [])

  return {
    document,
    isDirty,
    notice,
    dismissNotice: () => setNotice(null),
    createFromTemplate,
    openWithDialog,
    openRecent,
    save: () => save(false),
    saveAs: () => save(true),
    close,
    handleContentChange
  }
}
