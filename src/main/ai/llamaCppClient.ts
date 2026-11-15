import type { AiGenerateRequest, AiToolCall } from '@shared/ai'
import { assertLocalEndpoint } from './localEndpoint'
import { RuntimeUnreachableError, toToolCall, type ChatResult, type LocalModelRuntime } from './ollamaClient'
import { SseDecoder } from './sse'

/** Puerto por defecto de llama-server (llama.cpp). */
export const DEFAULT_LLAMACPP_ENDPOINT = 'http://127.0.0.1:8080'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

interface CompletionChunk {
  choices?: {
    delta?: {
      content?: string | null
      tool_calls?: { index?: number; function?: { name?: string; arguments?: string } }[]
    }
  }[]
  error?: { message?: string }
}

/**
 * Segundo runtime: llama-server de llama.cpp, con su API compatible con OpenAI (/v1/...).
 * Sirve sobre todo para comparar en el banco de evals el mismo modelo (o el mismo GGUF) con
 * Ollama: si un runtime da mejores resultados o menos latencia, lo vemos con números.
 *
 * Diferencias con Ollama que se notan aquí:
 *  - llama-server sirve UN modelo, el que se cargó al arrancarlo; el nombre del modelo se ignora.
 *  - El streaming es SSE, y las llamadas a herramientas llegan troceadas (los argumentos son un
 *    texto JSON que se va completando): hay que juntarlas por `index` antes de interpretarlas.
 *  - Los embeddings solo funcionan si el servidor se arrancó con --embeddings y un modelo de embeddings.
 */
export class LlamaCppClient implements LocalModelRuntime {
  readonly endpoint: string

  constructor(
    endpoint: string,
    private readonly fetchImpl: FetchLike = fetch
  ) {
    this.endpoint = assertLocalEndpoint(endpoint)
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const response = await this.request('/v1/models', { method: 'GET', signal })
    const body = (await response.json()) as { data?: { id?: unknown }[] }
    return (body.data ?? []).map((model) => model.id).filter((id): id is string => typeof id === 'string')
  }

  async chat(
    model: string,
    request: AiGenerateRequest,
    onToken: (chunk: string) => void,
    signal: AbortSignal
  ): Promise<ChatResult> {
    const response = await this.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildCompletionBody(model, request)),
      signal
    })
    if (!response.body) throw new Error('llama-server respondió sin contenido.')

    const decoder = new SseDecoder()
    const textDecoder = new TextDecoder()
    let text = ''
    const pendingCalls = new Map<number, { name: string; arguments: string }>()
    const handle = (events: string[]) => {
      for (const data of events) {
        if (data.trim() === '[DONE]') continue
        const chunk = parseChunk(data)
        if (chunk.error) throw new Error(`llama-server: ${chunk.error.message ?? 'error desconocido'}`)
        const delta = chunk.choices?.[0]?.delta
        if (delta?.content) {
          text += delta.content
          onToken(delta.content)
        }
        for (const call of delta?.tool_calls ?? []) {
          const index = call.index ?? 0
          const pending = pendingCalls.get(index) ?? { name: '', arguments: '' }
          pending.name += call.function?.name ?? ''
          pending.arguments += call.function?.arguments ?? ''
          pendingCalls.set(index, pending)
        }
      }
    }

    const reader = response.body.getReader()
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      handle(decoder.push(textDecoder.decode(value, { stream: true })))
    }
    handle(decoder.flush())

    const toolCalls = [...pendingCalls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, call]) => toToolCall(call))
      .filter((call): call is AiToolCall => call !== null)
    return { text, toolCalls }
  }

  async embed(model: string, inputs: string[], signal?: AbortSignal): Promise<number[][]> {
    const response = await this.request('/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: inputs }),
      signal
    })
    const body = (await response.json()) as { data?: { index?: number; embedding?: unknown }[] }
    const data = body.data ?? []
    if (data.length !== inputs.length || data.some((item) => !Array.isArray(item.embedding))) {
      throw new Error('llama-server no devolvió un vector por texto. ¿Lo arrancaste con --embeddings?')
    }
    return [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((item) => item.embedding as number[])
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    let response: Response
    try {
      response = await this.fetchImpl(`${this.endpoint}${path}`, init)
    } catch (error) {
      if (init.signal?.aborted) throw error
      throw new RuntimeUnreachableError(this.endpoint, error, 'llama-server')
    }
    if (!response.ok) {
      let message = `llama-server respondió con el error ${response.status}.`
      try {
        const body = (await response.json()) as { error?: { message?: unknown } }
        if (typeof body.error?.message === 'string') message = `llama-server: ${body.error.message}`
      } catch {
        /* cuerpo vacío o no JSON */
      }
      throw new Error(message)
    }
    return response
  }
}

/** Cuerpo de /v1/chat/completions (formato OpenAI). Separado para comprobarlo en los tests. */
export function buildCompletionBody(model: string, request: AiGenerateRequest): Record<string, unknown> {
  return {
    model,
    messages: request.messages,
    stream: true,
    temperature: request.temperature ?? 0.4,
    // Equivalente al `format` de Ollama: llama.cpp convierte el esquema en una gramática.
    ...(request.jsonSchema
      ? { response_format: { type: 'json_schema', json_schema: { name: 'respuesta', schema: request.jsonSchema } } }
      : {}),
    ...(request.tools?.length
      ? {
          tools: request.tools.map((tool) => ({
            type: 'function',
            function: { name: tool.name, description: tool.description, parameters: tool.parameters }
          }))
        }
      : {})
  }
}

function parseChunk(data: string): CompletionChunk {
  try {
    return JSON.parse(data) as CompletionChunk
  } catch {
    throw new Error(`Respuesta de llama-server con formato inesperado: ${data.slice(0, 80)}`)
  }
}
