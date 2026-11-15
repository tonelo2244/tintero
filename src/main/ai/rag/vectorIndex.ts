import type { RagSearchResult } from '@shared/ai'

/**
 * Índice vectorial en memoria: guarda los vectores de cada trozo y busca los más parecidos a una
 * pregunta por similitud coseno, recorriéndolos todos (búsqueda exacta, "fuerza bruta").
 *
 * ¿Por qué no una base de datos vectorial? Con unos cientos de documentos hay unos miles de trozos:
 * recorrerlos es cuestión de milisegundos y no añade ninguna dependencia. Si algún día crece a
 * cientos de miles, el siguiente paso es SQLite + sqlite-vec (o un índice aproximado tipo HNSW),
 * sin cambiar la interfaz de esta clase.
 */
export interface IndexedChunk {
  id: string
  text: string
  location: string
  vector: number[]
}

export interface IndexedSource {
  id: string
  title: string
  fingerprint: string
  chunks: IndexedChunk[]
}

interface Entry {
  source: IndexedSource
  chunk: IndexedChunk
  /** Vector normalizado (longitud 1): el coseno se reduce a un producto escalar. */
  unit: Float64Array
}

export class VectorIndex {
  private readonly sources = new Map<string, IndexedSource>()
  private entries: Entry[] = []

  constructor(initial: IndexedSource[] = []) {
    for (const source of initial) this.sources.set(source.id, source)
    this.rebuild()
  }

  get(sourceId: string): IndexedSource | undefined {
    return this.sources.get(sourceId)
  }

  all(): IndexedSource[] {
    return [...this.sources.values()]
  }

  get chunkCount(): number {
    return this.entries.length
  }

  upsert(source: IndexedSource): void {
    this.sources.set(source.id, source)
    this.rebuild()
  }

  remove(sourceId: string): boolean {
    const removed = this.sources.delete(sourceId)
    if (removed) this.rebuild()
    return removed
  }

  clear(): void {
    this.sources.clear()
    this.entries = []
  }

  search(query: number[], limit: number, minScore = 0): RagSearchResult[] {
    const unit = normalize(query)
    const scored = this.entries
      .filter((entry) => entry.unit.length === unit.length)
      .map((entry) => ({ entry, score: dot(entry.unit, unit) }))
      .filter((candidate) => candidate.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
    return scored.map(({ entry, score }) => ({
      sourceId: entry.source.id,
      title: entry.source.title,
      chunkId: entry.chunk.id,
      text: entry.chunk.text,
      location: entry.chunk.location,
      score
    }))
  }

  private rebuild(): void {
    this.entries = [...this.sources.values()].flatMap((source) =>
      source.chunks.map((chunk) => ({ source, chunk, unit: normalize(chunk.vector) }))
    )
  }
}

export function normalize(vector: number[]): Float64Array {
  const length = Math.hypot(...vector) || 1
  return Float64Array.from(vector, (value) => value / length)
}

function dot(a: Float64Array, b: Float64Array): number {
  let sum = 0
  for (let index = 0; index < a.length; index++) sum += a[index] * b[index]
  return sum
}
