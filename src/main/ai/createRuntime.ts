import { DEFAULT_LLAMACPP_ENDPOINT, LlamaCppClient } from './llamaCppClient'
import { DEFAULT_OLLAMA_ENDPOINT } from './localEndpoint'
import { OllamaClient, type LocalModelRuntime } from './ollamaClient'

export const RUNTIME_KINDS = ['ollama', 'llamacpp'] as const
export type RuntimeKind = (typeof RUNTIME_KINDS)[number]

/** Elige el runtime de modelos locales. Lo comparten la app (variables de entorno) y las evals (--runtime). */
export function createRuntime(kind: string, url?: string): LocalModelRuntime {
  switch (kind) {
    case 'ollama':
      return new OllamaClient(url ?? DEFAULT_OLLAMA_ENDPOINT)
    case 'llamacpp':
      return new LlamaCppClient(url ?? DEFAULT_LLAMACPP_ENDPOINT)
    default:
      throw new Error(`Runtime desconocido: ${kind}. Usa ${RUNTIME_KINDS.join(' o ')}.`)
  }
}
