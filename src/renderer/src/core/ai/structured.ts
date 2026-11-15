import type { AiApi, AiGenerateRequest, AiMessage, JsonSchema } from '@shared/ai'

/** El usuario canceló: no es un fallo, la interfaz simplemente vuelve al estado anterior. */
export class AiCancelledError extends Error {
  constructor() {
    super('Generación cancelada.')
    this.name = 'AiCancelledError'
  }
}

/** El modelo no consiguió dar una respuesta válida tras todos los intentos. */
export class AiInvalidOutputError extends Error {
  constructor(reason: string) {
    super(`El modelo no devolvió una respuesta válida (${reason}). Prueba otra vez o con otro modelo.`)
    this.name = 'AiInvalidOutputError'
  }
}

/**
 * Convierte la respuesta en un valor de la app o lanza un Error que explique qué está mal.
 * Ese mensaje se le devuelve al modelo en el reintento, así que conviene que sea concreto.
 */
export type OutputParser<T> = (value: unknown) => T

interface StructuredOptions {
  /** Intentos totales (el primero + reintentos con el error como pista). */
  maxAttempts?: number
  onToken?: (chunk: string) => void
  /** Permite cancelar desde fuera (botón "Cancelar" de la interfaz). */
  signal?: AbortSignal
}

/**
 * Salida estructurada con validación y reintento. Es el patrón básico para usar un LLM como
 * componente de software y no como chat:
 *   1. pedir JSON con un esquema (el runtime restringe la gramática),
 *   2. validarlo con código propio (el esquema no comprueba que el contenido tenga sentido),
 *   3. si falla, reintentar enseñándole al modelo su respuesta y el error concreto.
 */
export async function generateStructured<T>(
  ai: AiApi,
  request: AiGenerateRequest & { jsonSchema: JsonSchema },
  parse: OutputParser<T>,
  { maxAttempts = 2, onToken, signal }: StructuredOptions = {}
): Promise<T> {
  const messages: AiMessage[] = [...request.messages]
  let lastError = 'sin respuesta'

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw new AiCancelledError()
    const generation = ai.generate({ ...request, messages }, onToken)
    const onAbort = () => generation.cancel()
    signal?.addEventListener('abort', onAbort, { once: true })
    const { text, cancelled } = await generation.result.finally(() => signal?.removeEventListener('abort', onAbort))
    if (cancelled) throw new AiCancelledError()

    try {
      return parse(parseJsonResponse(text))
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      messages.push(
        { role: 'assistant', content: text },
        {
          role: 'user',
          content: `Esa respuesta no es válida: ${lastError}. Devuelve solo el JSON corregido, sin explicaciones.`
        }
      )
    }
  }
  throw new AiInvalidOutputError(lastError)
}

/**
 * JSON.parse tolerante con lo que suelen añadir los modelos pequeños aunque se les pida JSON:
 * vallas de Markdown (```json ... ```) o una frase antes del objeto.
 */
export function parseJsonResponse(text: string): unknown {
  const trimmed = text.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  const candidate = fenced ? fenced[1] : trimmed
  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1))
      } catch {
        /* sigue abajo */
      }
    }
    throw new Error('no es JSON válido')
  }
}
