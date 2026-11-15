import type { AiApi, AiGeneration } from '@shared/ai'
import type { LocalModelRuntime } from '../../src/main/ai/ollamaClient'
import type { CallRecord } from './types'

/**
 * La misma interfaz `AiApi` que la app recibe de Electron (platform.ai), pero conectada
 * directamente al runtime y midiendo cada llamada. Gracias a esto el banco de evaluación ejecuta
 * EXACTAMENTE el código de la app (prompts, validación, reintentos): si evaluáramos una copia
 * de los prompts, mediríamos otra cosa.
 */
export interface MeasuredAi {
  ai: AiApi
  /** Devuelve las llamadas registradas desde la última vez y vacía la lista. */
  takeCalls(): CallRecord[]
}

export function createEvalAi(runtime: LocalModelRuntime, model: string): MeasuredAi {
  let calls: CallRecord[] = []

  const ai: AiApi = {
    status: async () => ({ state: 'ready', endpoint: runtime.endpoint, models: [model], model }),
    setModel: async () => ({ state: 'ready', endpoint: runtime.endpoint, models: [model], model }),
    generate(request, onToken): AiGeneration {
      const controller = new AbortController()
      const started = performance.now()
      let firstTokenMs: number | null = null
      const result = runtime
        .chat(
          model,
          request,
          (chunk) => {
            firstTokenMs ??= performance.now() - started
            onToken?.(chunk)
          },
          controller.signal
        )
        .then((text) => {
          calls.push({ ms: performance.now() - started, firstTokenMs, outputChars: text.length })
          return { text, cancelled: false }
        })
      return { result, cancel: () => controller.abort() }
    }
  }

  return {
    ai,
    takeCalls: () => {
      const taken = calls
      calls = []
      return taken
    }
  }
}
