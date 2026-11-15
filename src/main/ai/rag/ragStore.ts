import { promises as fs } from 'node:fs'
import { writeFileAtomic } from '../../fileService'
import type { IndexedSource } from './vectorIndex'

/**
 * El índice en disco: userData/rag-index.json. Guarda con qué modelo se calcularon los vectores,
 * porque vectores de modelos distintos no se pueden comparar: si cambia el modelo, se reindexa todo.
 */
export interface StoredIndex {
  version: 1
  embeddingModel: string | null
  sources: IndexedSource[]
}

const EMPTY: StoredIndex = { version: 1, embeddingModel: null, sources: [] }

export class RagStore {
  constructor(private readonly storePath: string) {}

  async load(): Promise<StoredIndex> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.storePath, 'utf8')) as Partial<StoredIndex>
      if (parsed.version !== 1 || !Array.isArray(parsed.sources)) return { ...EMPTY }
      return { version: 1, embeddingModel: parsed.embeddingModel ?? null, sources: parsed.sources }
    } catch {
      return { ...EMPTY }
    }
  }

  async save(index: StoredIndex): Promise<void> {
    // Sin sangría: con vectores de 768 números, el archivo ocupa la mitad.
    await writeFileAtomic(this.storePath, JSON.stringify(index))
  }
}
