/**
 * Contrato de la IA local entre el proceso principal y la interfaz.
 *
 * Es deliberadamente genérico: main sabe "hablar con un modelo", no qué es reescribir un párrafo
 * o generar diapositivas. Los prompts y la validación de cada función viven en la app que la usa,
 * igual que main sabe escribir bytes pero no qué hay dentro de un .docx.
 */

export type AiRole = 'system' | 'user' | 'assistant'

export interface AiMessage {
  role: AiRole
  content: string
}

/** JSON Schema (el subconjunto que entienden los runtimes locales para "salida estructurada"). */
export type JsonSchema = Record<string, unknown>

export interface AiGenerateRequest {
  messages: AiMessage[]
  /**
   * Si se indica, el runtime restringe la salida a JSON que cumple este esquema.
   * Aun así la app debe validar el resultado: el esquema guía al modelo, no garantiza el contenido.
   */
  jsonSchema?: JsonSchema
  /** 0 = determinista; más alto = más variado. Cada función elige el suyo. */
  temperature?: number
}

/** Estado del runtime local, para que la interfaz explique qué falta en vez de fallar a ciegas. */
export type AiStatus =
  /** Ollama no responde en este equipo (no instalado o no arrancado). */
  | { state: 'unreachable'; endpoint: string }
  /** Ollama responde pero no tiene ningún modelo descargado. */
  | { state: 'no-models'; endpoint: string; suggestedModel: string }
  | { state: 'ready'; endpoint: string; models: string[]; model: string }

export interface AiGenerateResult {
  text: string
  /** true si el usuario lo canceló: `text` es lo que llegó hasta ese momento. */
  cancelled: boolean
}

/** Una generación en curso: se puede cancelar y avisa de cada trozo de texto según llega. */
export interface AiGeneration {
  result: Promise<AiGenerateResult>
  cancel(): void
}

export interface AiApi {
  status(): Promise<AiStatus>
  /** Elige el modelo a usar (uno de los que devuelve `status`). Se recuerda entre sesiones. */
  setModel(model: string): Promise<AiStatus>
  /** `onToken` recibe cada trozo de texto nuevo (streaming), no el acumulado. */
  generate(request: AiGenerateRequest, onToken?: (chunk: string) => void): AiGeneration
}

export const AiChannel = {
  Status: 'ai:status',
  SetModel: 'ai:set-model',
  Generate: 'ai:generate',
  Cancel: 'ai:cancel',
  Token: 'ai:token'
} as const
