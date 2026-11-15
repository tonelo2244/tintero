import { useCallback, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import type { RagSearchResult, RagSourceInput, RagStatus } from '@shared/ai'
import { parseDocument } from '@shared/document'
import { platform } from '@/core/platform'
import { errorMessage, useAiGeneration } from '@/core/ai/useAiGeneration'
import { parseWriterContent } from '../model/content'
import { answerFromDocuments, type CheckedAnswer } from '../model/ai/askDocuments'
import { contentFingerprint, documentChunks } from '../model/ai/documentChunks'

/** Cuántos documentos recientes se indexan además del abierto. Suficiente para "mis documentos". */
const MAX_RECENT_SOURCES = 30
/** El documento abierto sin guardar no tiene ruta: se indexa con este id y se sustituye cada vez. */
const UNSAVED_SOURCE_ID = 'documento-sin-guardar'

export type IndexState =
  | { phase: 'checking' }
  | { phase: 'setup'; status: Exclude<RagStatus, { state: 'ready' }> }
  | { phase: 'indexing'; done: number; total: number }
  | { phase: 'ready'; sources: number; chunks: number }
  | { phase: 'error'; message: string }

interface DocumentRef {
  documentName: string
  filePath: string | null
}

export function toSource(id: string, title: string, doc: JSONContent): RagSourceInput {
  return { id, title, fingerprint: contentFingerprint(JSON.stringify(doc)), chunks: documentChunks(doc) }
}

/** Lee un .tdoc de Texto de los recientes. null si ya no existe o no es de Texto. */
async function readWriterSource(path: string, title: string): Promise<RagSourceInput | null> {
  try {
    const file = await platform.files.read(path)
    const envelope = parseDocument(file.contents)
    if (envelope.appId !== 'writer') return null
    return toSource(path, title, parseWriterContent(envelope.content).doc)
  } catch {
    return null // borrado, movido o dañado: no es motivo para fallar la búsqueda entera
  }
}

/**
 * "Preguntar a tus documentos": prepara el índice (el documento abierto y los recientes de Texto)
 * y responde preguntas citando el fragmento de origen. La búsqueda y los vectores viven en main;
 * aquí se decide QUÉ se indexa y CÓMO se responde, que es lo que sabe la app.
 */
export function useAskDocuments(getDoc: () => JSONContent | null, document: DocumentRef) {
  const [index, setIndex] = useState<IndexState | null>(null)
  const [question, setQuestion] = useState('')
  const [sources, setSources] = useState<RagSearchResult[]>([])
  const [checked, setChecked] = useState<CheckedAnswer | null>(null)
  const { state: generation, run, reset, cancel } = useAiGeneration()
  const preparing = useRef(false)

  const prepare = useCallback(async () => {
    if (preparing.current) return
    preparing.current = true
    setIndex({ phase: 'checking' })
    try {
      const status = await platform.rag.status()
      if (status.state !== 'ready') {
        setIndex({ phase: 'setup', status })
        return
      }
      const recents = (await platform.recents.list())
        .filter((recent) => recent.appId === 'writer' && recent.path !== document.filePath)
        .slice(0, MAX_RECENT_SOURCES)
      const total = recents.length + 1
      setIndex({ phase: 'indexing', done: 0, total })

      // El abierto, desde el editor (puede tener cambios sin guardar); el resto, desde disco.
      const doc = getDoc()
      if (doc) await platform.rag.index(toSource(document.filePath ?? UNSAVED_SOURCE_ID, document.documentName, doc))
      for (const [position, recent] of recents.entries()) {
        setIndex({ phase: 'indexing', done: position + 1, total })
        const source = await readWriterSource(recent.path, recent.name)
        if (source) await platform.rag.index(source)
      }
      const final = await platform.rag.status()
      setIndex(
        final.state === 'ready'
          ? { phase: 'ready', sources: final.sources, chunks: final.chunks }
          : { phase: 'setup', status: final }
      )
    } catch (error) {
      setIndex({ phase: 'error', message: errorMessage(error) })
    } finally {
      preparing.current = false
    }
  }, [getDoc, document.filePath, document.documentName])

  const ask = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      setSources([])
      setChecked(null)
      void run(async ({ ai, signal, onToken, onProgress }) => {
        const result = await answerFromDocuments(ai, platform.rag, trimmed, {
          signal,
          onToken,
          onProgress,
          onSources: setSources
        })
        setChecked(result.answer)
        return result.answer.text
      })
    },
    [run]
  )

  // La respuesta comprobada solo se enseña cuando la generación terminó (no al cancelar).
  const answer: CheckedAnswer | null = generation.phase === 'done' ? checked : null

  const close = useCallback(() => {
    reset()
    setSources([])
    setChecked(null)
    setIndex(null)
  }, [reset])

  return { index, question, setQuestion, sources, generation, answer, prepare, ask, cancel, close }
}

export type AskDocuments = ReturnType<typeof useAskDocuments>
