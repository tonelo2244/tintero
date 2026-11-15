import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { platform } from '@/core/platform'
import { AiCancelledError, generateStructured } from '@/core/ai/structured'
import { errorMessage } from '@/core/ai/useAiGeneration'
import {
  buildOutlineRequest,
  countStreamedSlides,
  OUTLINE_LIMITS,
  parseOutline,
  type PresentationOutline
} from '@/apps/slides/model/outline'
import { documentToPlainText } from '../model/ai/plainText'

export type PresentationJob =
  | { phase: 'running'; slidesSeen: number; truncated: boolean }
  | { phase: 'done'; outline: PresentationOutline; truncated: boolean }
  | { phase: 'error'; message: string }

/**
 * "Crear presentación" desde el documento de Texto. El esquema, el prompt y la conversión a
 * diapositivas son de la app de Diapositivas (ella sabe qué es una buena diapositiva); esta app
 * solo aporta su texto y decide cuándo abrir el resultado.
 */
export function usePresentationFromDocument(editor: Editor | null) {
  const [job, setJob] = useState<PresentationJob | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  const start = useCallback(async () => {
    if (!editor) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    const fullText = documentToPlainText(editor.getJSON())
    if (!fullText.trim()) {
      setJob({ phase: 'error', message: 'El documento está vacío: escribe algo antes de crear la presentación.' })
      return
    }
    // Un documento largo se recorta: es preferible una presentación de lo principal a un modelo saturado.
    const truncated = fullText.length > OUTLINE_LIMITS.maxSourceChars
    const source = truncated ? fullText.slice(0, OUTLINE_LIMITS.maxSourceChars) : fullText

    let streamed = ''
    setJob({ phase: 'running', slidesSeen: 0, truncated })
    try {
      const outline = await generateStructured(platform.ai, buildOutlineRequest(source), parseOutline, {
        signal: controller.signal,
        onToken: (chunk) => {
          streamed += chunk
          setJob({ phase: 'running', slidesSeen: countStreamedSlides(streamed), truncated })
        }
      })
      if (!controller.signal.aborted) setJob({ phase: 'done', outline, truncated })
    } catch (error) {
      if (error instanceof AiCancelledError) setJob(null)
      else setJob({ phase: 'error', message: errorMessage(error) })
    }
  }, [editor])

  const cancel = useCallback(() => controllerRef.current?.abort(), [])

  const close = useCallback(() => {
    controllerRef.current?.abort()
    setJob(null)
  }, [])

  useEffect(() => () => controllerRef.current?.abort(), [])

  return { job, start, cancel, close }
}
