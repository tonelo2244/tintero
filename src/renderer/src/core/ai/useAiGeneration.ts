import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiApi, AiGenerateRequest } from '@shared/ai'
import { platform } from '@/core/platform'
import { AiCancelledError } from './structured'
import { generateText } from './text'

export type AiGenerationState =
  /** `progress`: en tareas de varios pasos, en cuál va ("Resumiendo la parte 2 de 5…"). */
  | { phase: 'idle' }
  | { phase: 'running'; text: string; progress?: string }
  | { phase: 'done'; text: string }
  | { phase: 'cancelled'; text: string }
  | { phase: 'error'; message: string }

/** Lo que recibe una tarea: el modelo, la señal de cancelar y cómo informar de su avance. */
export interface AiTaskContext {
  ai: AiApi
  signal: AbortSignal
  onToken(chunk: string): void
  onProgress(progress: { label: string }): void
}

/** Una tarea de IA que acaba en un texto: una sola llamada o varias encadenadas (map-reduce). */
export type AiTextTask = (context: AiTaskContext) => Promise<string>

/**
 * Generación de texto en streaming para la interfaz: guarda el texto según llega y permite
 * cancelar. Solo hay una generación a la vez; empezar otra cancela la anterior.
 */
export function useAiGeneration() {
  const [state, setState] = useState<AiGenerationState>({ phase: 'idle' })
  const controllerRef = useRef<AbortController | null>(null)
  /** Para ignorar respuestas de una generación que ya se sustituyó por otra. */
  const runId = useRef(0)

  const cancel = useCallback(() => controllerRef.current?.abort(), [])

  const run = useCallback(async (task: AiTextTask) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const id = ++runId.current
    let text = ''
    let progress: string | undefined
    const isCurrent = () => id === runId.current
    setState({ phase: 'running', text })
    try {
      const result = await task({
        ai: platform.ai,
        signal: controller.signal,
        onToken: (chunk) => {
          if (!isCurrent()) return
          text += chunk
          setState({ phase: 'running', text, progress })
        },
        onProgress: (step) => {
          if (!isCurrent()) return
          progress = step.label
          // Cada paso empieza a escribir de cero: lo que se enseña en vivo es el paso actual.
          text = ''
          setState({ phase: 'running', text, progress })
        }
      })
      if (isCurrent()) setState({ phase: 'done', text: result })
    } catch (error) {
      if (!isCurrent()) return
      if (error instanceof AiCancelledError) setState({ phase: 'cancelled', text })
      else setState({ phase: 'error', message: errorMessage(error) })
    } finally {
      if (isCurrent()) controllerRef.current = null
    }
  }, [])

  /** Una sola petición: el caso de siempre. */
  const start = useCallback(
    (request: AiGenerateRequest) => run(({ ai, signal, onToken }) => generateText(ai, request, { signal, onToken })),
    [run]
  )

  const reset = useCallback(() => {
    controllerRef.current?.abort()
    runId.current++
    setState({ phase: 'idle' })
  }, [])

  // Si el componente desaparece (cerrar el documento), no dejamos al modelo trabajando.
  useEffect(() => () => controllerRef.current?.abort(), [])

  return { state, start, run, cancel, reset }
}

/** Electron envuelve los errores de main: "Error invoking remote method 'ai:generate': Error: ...". */
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}
