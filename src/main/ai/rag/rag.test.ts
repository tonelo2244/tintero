import { describe, expect, it } from 'vitest'
import type { LocalModelRuntime } from '../ollamaClient'
import { chooseEmbeddingModel, embeddingPrefixes, isEmbeddingModel, RagService } from './ragService'
import type { StoredIndex } from './ragStore'
import { VectorIndex } from './vectorIndex'

const VOCABULARY = ['precio', 'coste', 'vacaciones', 'agosto', 'servidor', 'caído', 'factura']

/** Embeddings de juguete: un 1 por cada palabra del vocabulario que aparece. Deterministas y legibles. */
function bagOfWords(text: string): number[] {
  const lower = text.toLowerCase()
  return [...VOCABULARY.map((word): number => (lower.includes(word) ? 1 : 0)), 0.01]
}

function fakeRuntime(models = ['gemma4:e4b', 'embeddinggemma:latest']) {
  const embedded: string[][] = []
  const runtime: LocalModelRuntime = {
    endpoint: 'http://127.0.0.1:11434',
    listModels: async () => models,
    chat: async () => ({ text: '', toolCalls: [] }),
    embed: async (_model, inputs) => {
      embedded.push(inputs)
      return inputs.map(bagOfWords)
    }
  }
  return { runtime, embedded }
}

function memoryStore(initial?: StoredIndex) {
  let saved: StoredIndex = initial ?? { version: 1, embeddingModel: null, sources: [] }
  return {
    load: async () => saved,
    save: async (index: StoredIndex) => {
      saved = structuredClone(index)
    },
    get saved() {
      return saved
    }
  }
}

const doc = (id: string, fingerprint: string, texts: string[]) => ({
  id,
  title: id,
  fingerprint,
  chunks: texts.map((text, index) => ({ id: `c${index}`, text, location: `párrafo ${index + 1}` }))
})

describe('VectorIndex', () => {
  it('ordena por similitud coseno y filtra lo que no se parece', () => {
    const index = new VectorIndex([
      {
        id: 'a',
        title: 'A',
        fingerprint: '1',
        chunks: [
          { id: 'x', text: 'x', location: '', vector: [1, 0] },
          { id: 'y', text: 'y', location: '', vector: [0.7, 0.7] },
          { id: 'z', text: 'z', location: '', vector: [0, 1] }
        ]
      }
    ])
    const results = index.search([1, 0.1], 5, 0.25)
    expect(results.map((result) => result.chunkId)).toEqual(['x', 'y'])
    expect(results[0].score).toBeGreaterThan(0.99)
  })
})

describe('modelos de embeddings', () => {
  it('se reconocen y se eligen por preferencia', () => {
    expect(isEmbeddingModel('nomic-embed-text:latest')).toBe(true)
    expect(isEmbeddingModel('gemma4:e4b')).toBe(false)
    expect(chooseEmbeddingModel(['gemma4:e4b', 'nomic-embed-text:latest', 'embeddinggemma:300m'])).toBe(
      'embeddinggemma:300m'
    )
    expect(chooseEmbeddingModel(['gemma4:e4b'])).toBeNull()
    expect(embeddingPrefixes('nomic-embed-text').query).toBe('search_query: ')
  })
})

describe('RagService', () => {
  it('explica qué falta si no hay modelo de embeddings', async () => {
    const { runtime } = fakeRuntime(['gemma4:e4b'])
    const rag = new RagService(runtime, memoryStore())
    expect(await rag.status()).toEqual({ state: 'no-embedding-model', suggestedModel: 'embeddinggemma' })
    await expect(rag.search('hola', 3)).rejects.toThrow(/ollama pull embeddinggemma/)
  })

  it('indexa, busca por significado y no recalcula lo que no ha cambiado', async () => {
    const { runtime, embedded } = fakeRuntime()
    const store = memoryStore()
    const rag = new RagService(runtime, store)

    expect(await rag.index(doc('plan.tdoc', 'v1', ['El precio de la factura sube.', 'Vacaciones en agosto.']))).toBe(
      true
    )
    expect(await rag.index(doc('plan.tdoc', 'v1', ['El precio de la factura sube.', 'Vacaciones en agosto.']))).toBe(
      false
    )
    expect(embedded).toHaveLength(1)
    // Los documentos llevan el prefijo que espera embeddinggemma.
    expect(embedded[0][0]).toBe('title: none | text: El precio de la factura sube.')

    const results = await rag.search('¿cuándo son las vacaciones?', 3)
    expect(results[0]).toMatchObject({ sourceId: 'plan.tdoc', location: 'párrafo 2' })
    expect(results).toHaveLength(1)
    expect(await rag.status()).toMatchObject({ state: 'ready', sources: 1, chunks: 2 })
    expect(store.saved.embeddingModel).toBe('embeddinggemma:latest')
  })

  it('descarta un índice hecho con otro modelo de embeddings', async () => {
    const { runtime } = fakeRuntime()
    const old: StoredIndex = {
      version: 1,
      embeddingModel: 'nomic-embed-text:latest',
      sources: [
        { id: 'viejo', title: 'viejo', fingerprint: '1', chunks: [{ id: 'c', text: 't', location: '', vector: [1] }] }
      ]
    }
    const rag = new RagService(runtime, memoryStore(old))
    expect(await rag.status()).toMatchObject({ state: 'ready', sources: 0 })
  })
})
