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

/**
 * Una herramienta que el modelo puede pedir que se ejecute ("tool calling"). La define la app;
 * main solo se la pasa al runtime. Importante: pedirla no la ejecuta. El modelo devuelve
 * llamadas propuestas y es la app quien las valida y, si el usuario quiere, las aplica.
 */
export interface AiToolDefinition {
  name: string
  description: string
  /** JSON Schema de los argumentos. */
  parameters: JsonSchema
}

export interface AiToolCall {
  name: string
  /** Argumentos tal y como los escribió el modelo: sin validar. */
  arguments: Record<string, unknown>
}

export interface AiGenerateRequest {
  messages: AiMessage[]
  /** Herramientas disponibles. Con ellas, el resultado puede traer `toolCalls` en vez de (o además de) texto. */
  tools?: AiToolDefinition[]
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
  /** Llamadas a herramientas que propone el modelo (vacío si no se pasaron `tools` o no usó ninguna). */
  toolCalls: AiToolCall[]
  /** true si el usuario lo canceló: `text` es lo que llegó hasta ese momento. */
  cancelled: boolean
}

/** Una generación en curso: se puede cancelar y avisa de cada trozo de texto según llega. */
export interface AiGeneration {
  result: Promise<AiGenerateResult>
  cancel(): void
}

/**
 * Búsqueda semántica local (RAG). main guarda vectores y busca; QUÉ se indexa y cómo se trocea lo
 * decide cada app (Texto indexa párrafos de documentos .tdoc). Así main no sabe qué es un documento.
 */
export interface RagChunkInput {
  /** Único dentro de su fuente. */
  id: string
  text: string
  /** Dónde está, para citarlo: "Objetivos · párrafo 3". */
  location: string
}

export interface RagSourceInput {
  /** La ruta del archivo, por ejemplo. */
  id: string
  title: string
  /** Cambia cuando cambia el contenido: si coincide con lo indexado, no se vuelve a calcular nada. */
  fingerprint: string
  chunks: RagChunkInput[]
}

export interface RagSearchResult {
  sourceId: string
  title: string
  chunkId: string
  text: string
  location: string
  /** Similitud coseno con la pregunta, de -1 a 1. */
  score: number
}

export type RagStatus =
  | { state: 'unreachable'; endpoint: string }
  /** Ollama responde pero no hay un modelo de embeddings descargado. */
  | { state: 'no-embedding-model'; suggestedModel: string }
  | { state: 'ready'; model: string; sources: number; chunks: number }

export interface RagApi {
  status(): Promise<RagStatus>
  /** Indexa (o reindexa si cambió) una fuente. Devuelve false si ya estaba al día. */
  index(source: RagSourceInput): Promise<boolean>
  remove(sourceId: string): Promise<void>
  search(query: string, limit: number): Promise<RagSearchResult[]>
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
  Token: 'ai:token',
  RagStatus: 'ai:rag-status',
  RagIndex: 'ai:rag-index',
  RagRemove: 'ai:rag-remove',
  RagSearch: 'ai:rag-search'
} as const
