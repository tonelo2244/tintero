import { useCallback, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useAiGeneration } from '@/core/ai/useAiGeneration'
import {
  buildWritingRequest,
  cleanModelText,
  writingAction,
  type ResultPlacement,
  type WritingAction,
  type WritingActionId
} from '../model/ai/writingActions'
import { applyResult, captureTarget, type AiTarget } from './aiTarget'

export interface WritingJob {
  action: WritingAction
  /** null si no se pudo empezar (sin selección, texto demasiado largo...). */
  target: AiTarget | null
  /** Aviso para el usuario cuando no hay target o no se pudo aplicar. */
  message: string | null
}

/**
 * Orquesta el asistente: captura el texto, lanza la generación, y aplica el resultado solo
 * cuando el usuario lo acepta. La IA nunca toca el documento por su cuenta.
 */
export function useWritingAssistant(editor: Editor | null) {
  const generation = useAiGeneration()
  const [job, setJob] = useState<WritingJob | null>(null)

  const run = useCallback(
    (id: WritingActionId) => {
      if (!editor) return
      const action = writingAction(id)
      const captured = captureTarget(editor, action)
      if (!captured.ok) {
        generation.reset()
        setJob({ action, target: null, message: captured.message })
        return
      }
      setJob({ action, target: captured.target, message: null })
      void generation.start(buildWritingRequest(action, captured.target.modelText))
    },
    [editor, generation]
  )

  const retry = useCallback(() => {
    if (job?.target) void generation.start(buildWritingRequest(job.action, job.target.modelText))
  }, [generation, job])

  const result = generation.state.phase === 'done' ? cleanModelText(generation.state.text) : ''

  const apply = useCallback(
    (placement: ResultPlacement) => {
      if (!editor || !job?.target || !result) return
      if (applyResult(editor, job.target, result, placement)) {
        generation.reset()
        setJob(null)
      } else {
        setJob({ ...job, message: 'El texto original ha cambiado mientras se generaba. Vuelve a seleccionarlo.' })
      }
    },
    [editor, generation, job, result]
  )

  const close = useCallback(() => {
    generation.reset()
    setJob(null)
    editor?.commands.focus()
  }, [editor, generation])

  return { job, generation: generation.state, result, run, retry, apply, cancel: generation.cancel, close }
}
