import { useCallback, useMemo, useRef, useState } from 'react'
import { displayNameFromPath, parseDocument, serializeDocument } from '@shared/document'
import type { FileFilter, RecentFile, RecoverySnapshot } from '@shared/ipc'
import type { AnyAppModule, AppRegistry, AppTemplate, ExportOption, Exporter } from '@/core/appModule'
import { createId } from '@/core/ids'
import { platform } from '@/core/platform'
import type { PendingSnapshot } from './useAutosave'

export interface OpenDocument {
  /** Cambia cada vez que se abre/crea un documento: fuerza a React a montar un editor limpio. */
  key: number
  app: AnyAppModule
  path: string | null
  name: string
  initialContent: unknown
  /** Id de su copia de recuperación en disco (autoguardado). */
  recoveryId: string
}

interface ShowOptions {
  /** Al recuperar una copia se reutiliza su id, para que el autoguardado la siga actualizando. */
  recoveryId?: string
  isDirty?: boolean
}

/** Borrar una copia es "limpieza": si falla no debe interrumpir al usuario. */
function forgetRecovery(id: string): void {
  void platform.recovery.discard(id).catch(() => {})
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
  /** Sube con cada cambio: el autoguardado lo usa para no reescribir una copia idéntica. */
  const revision = useRef(0)
  const currentRecoveryId = useRef<string | null>(null)
  const nextKey = useRef(1)
  const untitledCounters = useRef(new Map<string, number>())

  const confirmDiscard = useCallback((): boolean => {
    if (!document || !isDirty) return true
    return window.confirm(`"${document.name}" tiene cambios sin guardar. ¿Quieres descartarlos?`)
  }, [document, isDirty])

  const show = useCallback((next: Omit<OpenDocument, 'key' | 'recoveryId'>, options: ShowOptions = {}) => {
    // Si llegamos aquí, el documento anterior se guardó o el usuario aceptó descartarlo.
    if (currentRecoveryId.current) forgetRecovery(currentRecoveryId.current)
    const recoveryId = options.recoveryId ?? createId('doc')
    currentRecoveryId.current = recoveryId
    latestContent.current = next.initialContent
    revision.current = 0
    setDocument({ ...next, recoveryId, key: nextKey.current++ })
    setIsDirty(options.isDirty ?? false)
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

  /** Abre un archivo por su ruta (p. ej. doble clic en el explorador de archivos). */
  const openPath = useCallback(
    async (path: string) => {
      if (!confirmDiscard()) return
      try {
        const opened = await platform.files.read(path)
        await openFromContents(opened.path, opened.contents)
      } catch (error) {
        setNotice(`No se pudo abrir el archivo. ${errorMessage(error)}`)
      }
    },
    [confirmDiscard, openFromContents]
  )

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
    /** Devuelve true si el documento quedó guardado en disco. */
    async (forceNewPath = false): Promise<boolean> => {
      if (!document) return false
      try {
        const contents = serializeDocument(document.app.id, latestContent.current)
        const path = await platform.files.save(
          forceNewPath ? null : document.path,
          contents,
          `${document.name}.${document.app.file.extension}`,
          [fileFilterFor(document.app)]
        )
        if (!path) return false // el usuario canceló el diálogo
        const name = displayNameFromPath(path)
        setDocument((current) => (current ? { ...current, path, name } : current))
        setIsDirty(false)
        forgetRecovery(document.recoveryId)
        await platform.recents.touch({ path, name, appId: document.app.id })
        return true
      } catch (error) {
        setNotice(`No se pudo guardar. ${errorMessage(error)}`)
        return false
      }
    },
    [document]
  )

  /** Exporta a PDF. No cambia la ruta del documento: un PDF es una copia, no el original. */
  const exportPdf = useCallback(async () => {
    if (!document) return
    try {
      const path = await platform.window.exportPdf(`${document.name}.pdf`)
      if (path) setNotice(`PDF guardado en ${path}`)
    } catch (error) {
      setNotice(`No se pudo exportar a PDF. ${errorMessage(error)}`)
    }
  }, [document])

  /**
   * Exporta a un formato de otra suite. Igual que el PDF, es una copia: el documento sigue
   * siendo el .tdoc/.tpres, porque la conversión pierde cosas y no queremos que el siguiente
   * Cmd+S sobrescriba un archivo con pérdidas sin que el usuario lo sepa.
   */
  const exportWith = useCallback(
    async (exporter: Exporter<unknown>) => {
      if (!document) return
      const { extension, label } = exporter.format
      try {
        const bytes = await exporter.export(latestContent.current)
        const path = await platform.files.saveBinary(bytes, `${document.name}.${extension}`, [
          { name: label, extensions: [extension] }
        ])
        if (path) setNotice(`Exportado a ${path}. Sigues editando el documento de Tintero.`)
      } catch (error) {
        setNotice(`No se pudo exportar a .${extension}. ${errorMessage(error)}`)
      }
    },
    [document]
  )

  const exportOptions = useMemo((): ExportOption[] => {
    if (!document) return []
    return [
      { id: 'pdf', label: 'PDF (.pdf)', run: () => void exportPdf() },
      ...(document.app.exporters ?? []).map((exporter) => ({
        id: exporter.format.extension,
        label: `${exporter.format.label} (.${exporter.format.extension})`,
        run: () => void exportWith(exporter)
      }))
    ]
  }, [document, exportPdf, exportWith])

  const close = useCallback((): boolean => {
    if (!confirmDiscard()) return false
    if (currentRecoveryId.current) forgetRecovery(currentRecoveryId.current)
    currentRecoveryId.current = null
    setDocument(null)
    setIsDirty(false)
    return true
  }, [confirmDiscard])

  const handleContentChange = useCallback((content: unknown) => {
    latestContent.current = content
    revision.current += 1
    setIsDirty(true)
  }, [])

  /** Abre la copia de un documento que no llegó a guardarse (cierre inesperado). */
  const openRecovered = useCallback(
    (snapshot: RecoverySnapshot): boolean => {
      if (!confirmDiscard()) return false
      try {
        const envelope = parseDocument(snapshot.contents)
        const app = registry.get(envelope.appId)
        if (!app) throw new Error(`No hay ninguna app instalada para "${envelope.appId}".`)
        show(
          { app, path: snapshot.path, name: snapshot.name, initialContent: app.parseContent(envelope.content) },
          { recoveryId: snapshot.id, isDirty: true }
        )
        return true
      } catch (error) {
        setNotice(`No se pudo recuperar "${snapshot.name}". ${errorMessage(error)}`)
        return false
      }
    },
    [confirmDiscard, registry, show]
  )

  /** Lo que el autoguardado debe escribir ahora mismo, o null si no hay nada pendiente. */
  const takeRecoverySnapshot = useCallback((): PendingSnapshot | null => {
    if (!document || !isDirty) return null
    return {
      revision: revision.current,
      snapshot: {
        id: document.recoveryId,
        appId: document.app.id,
        name: document.name,
        path: document.path,
        savedAt: new Date().toISOString(),
        contents: serializeDocument(document.app.id, latestContent.current)
      }
    }
  }, [document, isDirty])

  return {
    document,
    isDirty,
    notice,
    dismissNotice: () => setNotice(null),
    createFromTemplate,
    openWithDialog,
    openRecent,
    openPath,
    save: () => save(false),
    saveAs: () => save(true),
    exportPdf,
    exportOptions,
    close,
    handleContentChange,
    openRecovered,
    takeRecoverySnapshot
  }
}
