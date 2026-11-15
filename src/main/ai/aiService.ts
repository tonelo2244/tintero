import type { AiGenerateRequest, AiGenerateResult, AiStatus } from '@shared/ai'
import type { AiSettings } from './aiSettingsStore'
import { RuntimeUnreachableError, type LocalModelRuntime } from './ollamaClient'

/**
 * Modelos recomendados, en orden de preferencia, si el usuario no ha elegido ninguno.
 * Criterio: buen español, que siga instrucciones y JSON, y que quepa holgado en un portátil
 * con 16 GB (unos 3-6 GB cuantizado). Ver la sección "IA local" del README.
 */
export const RECOMMENDED_MODELS = ['gemma4:e4b', 'qwen3.5:9b', 'qwen3.5:4b', 'gemma3:4b', 'qwen3:8b']

/** Cuánto esperamos a que Ollama conteste a "¿estás ahí?" antes de darlo por apagado. */
const STATUS_TIMEOUT_MS = 2500

interface SettingsStore {
  get(): Promise<AiSettings>
  update(changes: Partial<AiSettings>): Promise<AiSettings>
}

/** "gemma3" y "gemma3:latest" son el mismo modelo para Ollama. */
const normalize = (name: string) => (name.includes(':') ? name : `${name}:latest`)

/** El modelo a usar: el elegido si sigue instalado; si no, el primero recomendado; si no, cualquiera. */
export function chooseModel(installed: string[], preferred: string | null): string | null {
  const byName = new Map(installed.map((name) => [normalize(name), name]))
  for (const candidate of [preferred, ...RECOMMENDED_MODELS]) {
    const match = candidate ? byName.get(normalize(candidate)) : undefined
    if (match) return match
  }
  return installed[0] ?? null
}

/**
 * Orquesta las peticiones a la IA: qué modelo usar, qué generaciones están en marcha y cómo
 * cancelarlas. No sabe nada de Electron (los IPC están en registerAiHandlers), así se prueba con
 * un runtime falso.
 */
export class AiService {
  private readonly running = new Map<string, AbortController>()

  constructor(
    private readonly runtime: LocalModelRuntime,
    private readonly settings: SettingsStore
  ) {}

  async status(): Promise<AiStatus> {
    const endpoint = this.runtime.endpoint
    let models: string[]
    try {
      models = await this.runtime.listModels(AbortSignal.timeout(STATUS_TIMEOUT_MS))
    } catch {
      return { state: 'unreachable', endpoint }
    }
    const model = chooseModel(models, (await this.settings.get()).model)
    if (!model) return { state: 'no-models', endpoint, suggestedModel: RECOMMENDED_MODELS[0] }
    return { state: 'ready', endpoint, models, model }
  }

  async setModel(model: string): Promise<AiStatus> {
    await this.settings.update({ model })
    return this.status()
  }

  async generate(
    requestId: string,
    request: AiGenerateRequest,
    onToken: (chunk: string) => void
  ): Promise<AiGenerateResult> {
    if (this.running.has(requestId)) throw new Error(`Ya hay una generación con el id ${requestId}.`)
    const controller = new AbortController()
    this.running.set(requestId, controller)
    let partial = ''
    try {
      const status = await this.status()
      if (status.state === 'unreachable') throw new RuntimeUnreachableError(status.endpoint)
      if (status.state === 'no-models') {
        throw new Error(`Ollama no tiene ningún modelo. Descarga uno con: ollama pull ${status.suggestedModel}`)
      }
      const text = await this.runtime.chat(
        status.model,
        request,
        (chunk) => {
          partial += chunk
          onToken(chunk)
        },
        controller.signal
      )
      return { text, cancelled: false }
    } catch (error) {
      // Cancelar no es un error: devolvemos lo que llegó para que la interfaz decida.
      if (controller.signal.aborted) return { text: partial, cancelled: true }
      throw error
    } finally {
      this.running.delete(requestId)
    }
  }

  cancel(requestId: string): void {
    this.running.get(requestId)?.abort()
  }

  /** Al cerrar la ventana: que no queden generaciones consumiendo CPU/GPU para nadie. */
  cancelAll(): void {
    for (const controller of this.running.values()) controller.abort()
  }
}
