import type { AiGenerateRequest } from '@shared/ai'
import { assertLocalEndpoint } from './localEndpoint'
import { NdjsonDecoder } from './ndjson'

/**
 * Lo que el servicio de IA necesita de un runtime de modelos locales. Hoy solo hay uno (Ollama),
 * pero tener el contrato separado permite probar el servicio con un runtime falso y, si algún día
 * se usa llama.cpp (llama-server), escribir solo otra implementación de esta interfaz.
 */
export interface LocalModelRuntime {
  readonly endpoint: string
  /** Modelos descargados. Lanza RuntimeUnreachableError si el runtime no responde. */
  listModels(signal?: AbortSignal): Promise<string[]>
  /** Genera la respuesta en streaming; `onToken` recibe cada trozo nuevo. Devuelve el texto completo. */
  chat(
    model: string,
    request: AiGenerateRequest,
    onToken: (chunk: string) => void,
    signal: AbortSignal
  ): Promise<string>
}

/** El runtime no está arrancado (o no está instalado). La interfaz lo explica con instrucciones. */
export class RuntimeUnreachableError extends Error {
  constructor(endpoint: string, cause?: unknown) {
    super(`No se pudo conectar con Ollama en ${endpoint}. ¿Está instalado y abierto?`, { cause })
    this.name = 'RuntimeUnreachableError'
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

interface OllamaChunk {
  message?: { content?: string }
  done?: boolean
  error?: string
}

/** Cliente mínimo de la API HTTP de Ollama (https://github.com/ollama/ollama/blob/main/docs/api.md). */
export class OllamaClient implements LocalModelRuntime {
  readonly endpoint: string

  constructor(
    endpoint: string,
    private readonly fetchImpl: FetchLike = fetch
  ) {
    this.endpoint = assertLocalEndpoint(endpoint)
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const response = await this.request('/api/tags', { method: 'GET', signal })
    const body = (await response.json()) as { models?: { name?: unknown }[] }
    return (body.models ?? []).map((model) => model.name).filter((name): name is string => typeof name === 'string')
  }

  async chat(
    model: string,
    request: AiGenerateRequest,
    onToken: (chunk: string) => void,
    signal: AbortSignal
  ): Promise<string> {
    const response = await this.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildChatBody(model, request)),
      signal
    })
    if (!response.body) throw new Error('Ollama respondió sin contenido.')

    const decoder = new NdjsonDecoder()
    const textDecoder = new TextDecoder()
    let text = ''
    const handle = (chunks: unknown[]) => {
      for (const chunk of chunks as OllamaChunk[]) {
        if (chunk.error) throw new Error(chunk.error)
        const piece = chunk.message?.content ?? ''
        if (piece) {
          text += piece
          onToken(piece)
        }
      }
    }

    // El cuerpo es un ReadableStream de bytes: lo leemos según llega para poder enseñar el texto en vivo.
    const reader = response.body.getReader()
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      handle(decoder.push(textDecoder.decode(value, { stream: true })))
    }
    handle(decoder.flush())
    return text
  }

  /** fetch con los errores traducidos: "no responde" se distingue de "respondió con un error". */
  private async request(path: string, init: RequestInit): Promise<Response> {
    let response: Response
    try {
      response = await this.fetchImpl(`${this.endpoint}${path}`, init)
    } catch (error) {
      if (init.signal?.aborted) throw error
      throw new RuntimeUnreachableError(this.endpoint, error)
    }
    if (!response.ok) throw new Error(await errorFromResponse(response))
    return response
  }
}

/** Cuerpo de /api/chat. Separado para poder comprobar en los tests qué se envía exactamente. */
export function buildChatBody(model: string, request: AiGenerateRequest): Record<string, unknown> {
  return {
    model,
    messages: request.messages,
    stream: true,
    // `format` con un JSON Schema activa la "salida estructurada": Ollama restringe la gramática
    // de la generación para que el resultado sea JSON con esa forma.
    ...(request.jsonSchema ? { format: request.jsonSchema } : {}),
    options: { temperature: request.temperature ?? 0.4 },
    // Mantiene el modelo cargado en memoria unos minutos: la segunda petición no espera a cargarlo.
    keep_alive: '10m'
  }
}

async function errorFromResponse(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body.error === 'string') return `Ollama: ${body.error}`
  } catch {
    /* cuerpo vacío o no JSON */
  }
  return `Ollama respondió con el error ${response.status}.`
}
