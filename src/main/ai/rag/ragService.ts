import type { RagSearchResult, RagSourceInput, RagStatus } from '@shared/ai'
import type { LocalModelRuntime } from '../ollamaClient'
import type { StoredIndex } from './ragStore'
import { VectorIndex } from './vectorIndex'

/**
 * Modelos de embeddings, en orden de preferencia. Son pequeños (300-600 MB) y rápidos.
 * Un modelo de embeddings convierte un texto en un vector: textos con significado parecido dan
 * vectores cercanos, aunque no compartan palabras ("coste" y "precio").
 */
export const EMBEDDING_MODELS = ['embeddinggemma', 'nomic-embed-text', 'mxbai-embed-large', 'bge-m3', 'all-minilm']

export function isEmbeddingModel(name: string): boolean {
  const base = name.split(':')[0].toLowerCase()
  return EMBEDDING_MODELS.includes(base) || base.includes('embed')
}

/**
 * Algunos modelos de embeddings esperan un prefijo distinto para la pregunta y para los documentos
 * (están entrenados así: "búsqueda asimétrica"). Sin él, la búsqueda funciona peor.
 */
export function embeddingPrefixes(model: string): { query: string; document: string } {
  const base = model.split(':')[0].toLowerCase()
  if (base === 'embeddinggemma') return { query: 'task: search result | query: ', document: 'title: none | text: ' }
  if (base === 'nomic-embed-text') return { query: 'search_query: ', document: 'search_document: ' }
  return { query: '', document: '' }
}

/** Cuántos textos se mandan a la vez a /api/embed: más es más rápido, pero con un límite de memoria. */
const BATCH_SIZE = 16
/** Por debajo de esta similitud, un trozo no tiene nada que ver con la pregunta. */
const MIN_SCORE = 0.25

interface Store {
  load(): Promise<StoredIndex>
  save(index: StoredIndex): Promise<void>
}

/**
 * RAG local: indexar trozos de texto y buscar los más parecidos a una pregunta. Genérico a
 * propósito: no sabe qué es un documento de Texto; recibe trozos y devuelve trozos.
 */
export class RagService {
  private vectors: VectorIndex | null = null
  private model: string | null = null

  constructor(
    private readonly runtime: LocalModelRuntime,
    private readonly store: Store
  ) {}

  async status(): Promise<RagStatus> {
    let installed: string[]
    try {
      installed = await this.runtime.listModels(AbortSignal.timeout(2500))
    } catch {
      return { state: 'unreachable', endpoint: this.runtime.endpoint }
    }
    const model = chooseEmbeddingModel(installed)
    if (!model) return { state: 'no-embedding-model', suggestedModel: EMBEDDING_MODELS[0] }
    const index = await this.load(model)
    return { state: 'ready', model, sources: index.all().length, chunks: index.chunkCount }
  }

  async index(source: RagSourceInput): Promise<boolean> {
    const { model, index } = await this.ready()
    const existing = index.get(source.id)
    if (existing && existing.fingerprint === source.fingerprint) return false

    const chunks = source.chunks.filter((chunk) => chunk.text.trim())
    const { document } = embeddingPrefixes(model)
    const vectors: number[][] = []
    for (let start = 0; start < chunks.length; start += BATCH_SIZE) {
      const batch = chunks.slice(start, start + BATCH_SIZE)
      vectors.push(
        ...(await this.runtime.embed(
          model,
          batch.map((chunk) => `${document}${chunk.text}`)
        ))
      )
    }
    index.upsert({
      id: source.id,
      title: source.title,
      fingerprint: source.fingerprint,
      chunks: chunks.map((chunk, position) => ({ ...chunk, vector: vectors[position] }))
    })
    await this.persist(model, index)
    return true
  }

  async remove(sourceId: string): Promise<void> {
    const { model, index } = await this.ready()
    if (index.remove(sourceId)) await this.persist(model, index)
  }

  async search(query: string, limit: number): Promise<RagSearchResult[]> {
    const { model, index } = await this.ready()
    if (index.chunkCount === 0 || !query.trim()) return []
    const [vector] = await this.runtime.embed(model, [`${embeddingPrefixes(model).query}${query}`])
    return index.search(vector, Math.min(Math.max(1, limit), 20), MIN_SCORE)
  }

  private async ready(): Promise<{ model: string; index: VectorIndex }> {
    const status = await this.status()
    if (status.state === 'unreachable') throw new Error(`No se pudo conectar con Ollama en ${status.endpoint}.`)
    if (status.state === 'no-embedding-model') {
      throw new Error(`Falta un modelo de embeddings. En el Terminal: ollama pull ${status.suggestedModel}`)
    }
    return { model: status.model, index: this.vectors! }
  }

  /** Carga el índice una vez. Si se calculó con otro modelo, se descarta (los vectores no son comparables). */
  private async load(model: string): Promise<VectorIndex> {
    if (this.vectors && this.model === model) return this.vectors
    const stored = await this.store.load()
    this.vectors = new VectorIndex(stored.embeddingModel === model ? stored.sources : [])
    this.model = model
    return this.vectors
  }

  private async persist(model: string, index: VectorIndex): Promise<void> {
    await this.store.save({ version: 1, embeddingModel: model, sources: index.all() })
  }
}

const base = (name: string) => name.split(':')[0].toLowerCase()

export function chooseEmbeddingModel(installed: string[]): string | null {
  for (const preferred of EMBEDDING_MODELS) {
    const match = installed.find((name) => base(name) === preferred)
    if (match) return match
  }
  return installed.find(isEmbeddingModel) ?? null
}
