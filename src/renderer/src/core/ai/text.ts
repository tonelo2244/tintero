import type { AiApi, AiGenerateRequest } from '@shared/ai'
import { AiCancelledError } from './structured'

export interface TextOptions {
  onToken?: (chunk: string) => void
  signal?: AbortSignal
}

/**
 * Una generación de texto libre como promesa: resuelve con el texto completo o lanza
 * AiCancelledError si se cancela. Es la pieza con la que se componen tareas de varios pasos
 * (resumir por trozos y luego resumir los resúmenes) sin pelearse con callbacks.
 */
export async function generateText(ai: AiApi, request: AiGenerateRequest, { onToken, signal }: TextOptions = {}) {
  if (signal?.aborted) throw new AiCancelledError()
  const generation = ai.generate(request, onToken)
  const onAbort = () => generation.cancel()
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const { text, cancelled } = await generation.result
    if (cancelled) throw new AiCancelledError()
    return text
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}
