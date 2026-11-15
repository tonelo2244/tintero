import { describe, expect, it } from 'vitest'
import type { AiGenerateRequest } from '@shared/ai'
import type { AiSettings } from './aiSettingsStore'
import { AiService, chooseModel } from './aiService'
import { RuntimeUnreachableError, type LocalModelRuntime } from './ollamaClient'

function memorySettings(initial: AiSettings = { model: null }) {
  let value = initial
  return {
    get: async () => value,
    update: async (changes: Partial<AiSettings>) => (value = { ...value, ...changes })
  }
}

/** Runtime falso: devuelve `reply` palabra a palabra y respeta la cancelación como lo haría fetch. */
function fakeRuntime(models: string[] | 'down', reply = 'uno dos tres'): LocalModelRuntime & { lastModel?: string } {
  return {
    endpoint: 'http://127.0.0.1:11434',
    async listModels() {
      if (models === 'down') throw new RuntimeUnreachableError(this.endpoint)
      return models
    },
    async chat(model: string, _request: AiGenerateRequest, onToken: (chunk: string) => void, signal: AbortSignal) {
      this.lastModel = model
      let text = ''
      for (const word of reply.split(' ')) {
        await new Promise((resolve) => setTimeout(resolve, 5))
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        text += word
        onToken(word)
      }
      return { text, toolCalls: [] }
    },
    async embed(_model: string, inputs: string[]) {
      return inputs.map(() => [1, 0])
    }
  }
}

describe('chooseModel', () => {
  it('respeta la elección del usuario si sigue instalada', () => {
    expect(chooseModel(['gemma4:e4b', 'mistral:7b'], 'mistral:7b')).toBe('mistral:7b')
  })

  it('si no, usa el primero recomendado que esté instalado', () => {
    expect(chooseModel(['mistral:7b', 'qwen3.5:4b'], 'borrado:1b')).toBe('qwen3.5:4b')
  })

  it('trata "nombre" y "nombre:latest" como el mismo modelo', () => {
    expect(chooseModel(['llama3.2:latest'], 'llama3.2')).toBe('llama3.2:latest')
  })

  it('sin recomendados instalados, usa cualquiera; sin modelos, null', () => {
    expect(chooseModel(['mistral:7b'], null)).toBe('mistral:7b')
    expect(chooseModel([], null)).toBeNull()
  })
})

describe('AiService', () => {
  it('explica qué falta: Ollama apagado o sin modelos', async () => {
    expect((await new AiService(fakeRuntime('down'), memorySettings()).status()).state).toBe('unreachable')
    expect(await new AiService(fakeRuntime([]), memorySettings()).status()).toMatchObject({
      state: 'no-models',
      suggestedModel: 'gemma4:e4b'
    })
  })

  it('genera con el modelo elegido y recuerda la elección', async () => {
    const runtime = fakeRuntime(['gemma4:e4b', 'mistral:7b'])
    const service = new AiService(runtime, memorySettings())
    expect(await service.setModel('mistral:7b')).toMatchObject({ state: 'ready', model: 'mistral:7b' })
    const tokens: string[] = []
    const result = await service.generate('r1', { messages: [] }, (chunk) => tokens.push(chunk))
    expect(result).toEqual({ text: 'unodostres', toolCalls: [], cancelled: false })
    expect(tokens).toEqual(['uno', 'dos', 'tres'])
    expect(runtime.lastModel).toBe('mistral:7b')
  })

  it('cancelar devuelve lo generado hasta ese momento, sin error', async () => {
    const service = new AiService(fakeRuntime(['gemma4:e4b']), memorySettings())
    const pending = service.generate('r1', { messages: [] }, (chunk) => {
      if (chunk === 'uno') service.cancel('r1')
    })
    expect(await pending).toEqual({ text: 'uno', toolCalls: [], cancelled: true })
  })

  it('falla con instrucciones si no hay modelos', async () => {
    const service = new AiService(fakeRuntime([]), memorySettings())
    await expect(service.generate('r1', { messages: [] }, () => {})).rejects.toThrow(/ollama pull gemma4:e4b/)
  })
})
