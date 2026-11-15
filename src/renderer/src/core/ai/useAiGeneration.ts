import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiGenerateRequest } from '@shared/ai'
import { platform } from '@/core/platform'

export type AiGenerationState =
  | { phase: 'idle' }
  | { phase: 'running'; text: string }
  | { phase: 'done'; text: string }
  | { phase: 'cancelled'; text: string }
  | { phase: 'error'; message: string }

/**
 * Generación de texto libre en streaming para la interfaz: guarda el texto según llega y permite
 * cancelar. Solo hay una generación a la vez; empezar otra cancela la anterior.
 */
export function useAiGeneration() {
  const [state, setState] = useState<AiGenerationState>({ phase: 'idle' })
  const cancelRef = useRef<(() => void) | null>(null)
  /** Para ignorar respuestas de una generación que ya se sustituyó por otra. */
  const runId = useRef(0)

  const cancel = useCallback(() => cancelRef.current?.(), [])

  const start = useCallback(async (request: AiGenerateRequest) => {
    cancelRef.current?.()
    const id = ++runId.current
    let text = ''
    setState({ phase: 'running', text })
    const generation = platform.ai.generate(request, (chunk) => {
      if (id !== runId.current) return
      text += chunk
      setState({ phase: 'running', text })
    })
    cancelRef.current = generation.cancel
    try {
      const result = await generation.result
      if (id !== runId.current) return
      setState(result.cancelled ? { phase: 'cancelled', text: result.text } : { phase: 'done', text: result.text })
    } catch (error) {
      if (id !== runId.current) return
      setState({ phase: 'error', message: errorMessage(error) })
    } finally {
      if (id === runId.current) cancelRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    cancelRef.current?.()
    runId.current++
    setState({ phase: 'idle' })
  }, [])

  // Si el componente desaparece (cerrar el documento), no dejamos al modelo trabajando.
  useEffect(() => () => cancelRef.current?.(), [])

  return { state, start, cancel, reset }
}

/** Electron envuelve los errores de main: "Error invoking remote method 'ai:generate': Error: ...". */
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}
