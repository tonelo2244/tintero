import type { AiApi, AiGenerateRequest, AiToolCall, AiToolDefinition } from '@shared/ai'
import { AiCancelledError } from './structured'

/**
 * "Tool calling" seguro por diseño: un agente pequeño que PROPONE y nunca ejecuta.
 *
 *   1. El modelo recibe la petición y unas herramientas (add_slide, set_formula...).
 *   2. Devuelve llamadas a herramientas, que aquí solo son datos.
 *   3. `interpret` (código de la app) convierte cada llamada en acciones del reducer, validándolas
 *      contra el estado real. Lo inválido se descarta con un motivo concreto.
 *   4. Si hubo problemas, se reintenta una vez enseñándole al modelo esos motivos.
 *   5. La interfaz enseña la lista de cambios y el usuario decide; aplicar es UN paso de deshacer.
 *
 * Las herramientas son las mismas acciones que usa el editor: el modelo no puede hacer nada
 * que el usuario no pudiera hacer a mano, y el reducer es quien garantiza que el estado sea válido.
 */
export interface ToolStep<A> {
  /** Lo que se enseña al usuario: «Añadir una diapositiva "Conclusiones" al final». */
  label: string
  actions: A[]
}

export interface Interpretation<A> {
  steps: ToolStep<A>[]
  /** Llamadas descartadas, con el motivo (para el reintento y para el usuario). */
  problems: string[]
}

export interface ToolProposal<A> extends Interpretation<A> {
  /** Lo que el modelo dijo en texto (p. ej. "no puedo hacer eso"), por si no propuso nada. */
  text: string
}

interface ProposeOptions {
  maxAttempts?: number
  signal?: AbortSignal
}

export async function proposeToolCalls<A>(
  ai: AiApi,
  request: AiGenerateRequest & { tools: AiToolDefinition[] },
  interpret: (calls: AiToolCall[]) => Interpretation<A>,
  { maxAttempts = 2, signal }: ProposeOptions = {}
): Promise<ToolProposal<A>> {
  const messages = [...request.messages]
  let last: ToolProposal<A> = { steps: [], problems: [], text: '' }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw new AiCancelledError()
    const generation = ai.generate({ ...request, messages })
    const onAbort = () => generation.cancel()
    signal?.addEventListener('abort', onAbort, { once: true })
    const result = await generation.result.finally(() => signal?.removeEventListener('abort', onAbort))
    if (result.cancelled) throw new AiCancelledError()

    const interpretation = interpret(result.toolCalls)
    last = { ...interpretation, text: result.text.trim() }
    const nothing = result.toolCalls.length === 0
    if ((interpretation.problems.length === 0 && !nothing) || attempt === maxAttempts) return last

    // Reintento con el error concreto, igual que generateStructured con el JSON.
    messages.push(
      { role: 'assistant', content: describeCalls(result.toolCalls) || result.text },
      {
        role: 'user',
        content: nothing
          ? 'No has usado ninguna herramienta. Responde llamando a las herramientas necesarias para hacer lo que pedí.'
          : `Algunas llamadas no son válidas:\n- ${interpretation.problems.join('\n- ')}\nVuelve a proponer TODAS las llamadas necesarias, corregidas.`
      }
    )
  }
  return last
}

function describeCalls(calls: AiToolCall[]): string {
  return calls.map((call) => `${call.name}(${JSON.stringify(call.arguments)})`).join('\n')
}

/** Lectores de argumentos: devuelven el valor o lanzan un Error con un mensaje útil para el modelo. */
export const args = {
  string(source: Record<string, unknown>, key: string, { optional = false } = {}): string | undefined {
    const value = source[key]
    if (value === undefined || value === null || value === '') {
      if (optional) return undefined
      throw new Error(`falta "${key}"`)
    }
    if (typeof value !== 'string') throw new Error(`"${key}" debe ser un texto`)
    return value.trim()
  },
  integer(source: Record<string, unknown>, key: string, { optional = false } = {}): number | undefined {
    const value = typeof source[key] === 'string' ? Number(source[key]) : source[key]
    if (value === undefined || value === null || value === '') {
      if (optional) return undefined
      throw new Error(`falta "${key}"`)
    }
    if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error(`"${key}" debe ser un número entero`)
    return value
  },
  boolean(source: Record<string, unknown>, key: string): boolean | undefined {
    const value = source[key]
    if (value === undefined || value === null) return undefined
    if (typeof value !== 'boolean') throw new Error(`"${key}" debe ser true o false`)
    return value
  },
  stringList(source: Record<string, unknown>, key: string, { optional = false } = {}): string[] | undefined {
    const value = source[key]
    if (value === undefined || value === null) {
      if (optional) return undefined
      throw new Error(`falta "${key}"`)
    }
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
      throw new Error(`"${key}" debe ser una lista de textos`)
    }
    return value.map((item) => item.trim()).filter(Boolean)
  }
}

/**
 * Interpreta llamada a llamada sobre un estado que va cambiando (las acciones de una llamada se
 * aplican a una copia antes de interpretar la siguiente), y descarta las que no cambian nada.
 */
export function interpretSequentially<S, A>(
  calls: AiToolCall[],
  initial: S,
  reducer: (state: S, action: A) => S,
  interpretCall: (call: AiToolCall, state: S) => ToolStep<A>
): Interpretation<A> {
  const steps: ToolStep<A>[] = []
  const problems: string[] = []
  let state = initial
  for (const call of calls) {
    try {
      const step = interpretCall(call, state)
      const next = step.actions.reduce(reducer, state)
      if (next === state) throw new Error('no cambia nada')
      state = next
      steps.push(step)
    } catch (error) {
      problems.push(`${call.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { steps, problems }
}
