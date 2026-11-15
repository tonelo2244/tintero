import { describe, expect, it } from 'vitest'
import { assertLocalEndpoint } from './localEndpoint'
import { NdjsonDecoder } from './ndjson'
import { buildChatBody, OllamaClient, RuntimeUnreachableError } from './ollamaClient'

/** Respuesta en streaming troceada como llegaría por la red (los cortes no respetan las líneas). */
function streamingResponse(pieces: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      pieces.forEach((piece) => controller.enqueue(encoder.encode(piece)))
      controller.close()
    }
  })
  return new Response(body, { status: 200 })
}

const line = (content: string, done = false) => JSON.stringify({ message: { content }, done }) + '\n'

describe('NdjsonDecoder', () => {
  it('reconstruye objetos partidos entre lecturas', () => {
    const decoder = new NdjsonDecoder()
    const full = line('Hola') + line(' mundo')
    expect(decoder.push(full.slice(0, 10))).toEqual([])
    expect(decoder.push(full.slice(10))).toHaveLength(2)
    expect(decoder.flush()).toEqual([])
  })

  it('lee la última línea aunque no acabe en salto de línea', () => {
    const decoder = new NdjsonDecoder()
    expect(decoder.push('{"a":1}\n{"b":2}')).toEqual([{ a: 1 }])
    expect(decoder.flush()).toEqual([{ b: 2 }])
  })
})

describe('assertLocalEndpoint', () => {
  it('acepta solo direcciones de este equipo', () => {
    expect(assertLocalEndpoint('http://127.0.0.1:11434/')).toBe('http://127.0.0.1:11434')
    expect(assertLocalEndpoint('http://localhost:8080')).toBe('http://localhost:8080')
    expect(() => assertLocalEndpoint('http://192.168.1.20:11434')).toThrow(/no es una dirección local/)
    expect(() => assertLocalEndpoint('https://api.ejemplo.com')).toThrow(/no es una dirección local/)
    expect(() => assertLocalEndpoint('file:///etc/passwd')).toThrow(/Protocolo/)
  })
})

describe('OllamaClient', () => {
  it('rechaza un endpoint que no es local', () => {
    expect(() => new OllamaClient('http://10.0.0.5:11434')).toThrow()
  })

  it('lista los modelos instalados', async () => {
    const client = new OllamaClient('http://127.0.0.1:11434', async (url) => {
      expect(url).toBe('http://127.0.0.1:11434/api/tags')
      return Response.json({ models: [{ name: 'gemma4:e4b' }, { name: 'qwen3.5:4b' }] })
    })
    expect(await client.listModels()).toEqual(['gemma4:e4b', 'qwen3.5:4b'])
  })

  it('distingue "no responde" de "respondió con error"', async () => {
    const down = new OllamaClient('http://127.0.0.1:11434', async () => {
      throw new TypeError('fetch failed')
    })
    await expect(down.listModels()).rejects.toBeInstanceOf(RuntimeUnreachableError)

    const missing = new OllamaClient('http://127.0.0.1:11434', async () =>
      Response.json({ error: "model 'x' not found" }, { status: 404 })
    )
    await expect(missing.chat('x', { messages: [] }, () => {}, new AbortController().signal)).rejects.toThrow(
      "Ollama: model 'x' not found"
    )
  })

  it('emite cada trozo según llega y devuelve el texto completo', async () => {
    const stream = line('Había ') + line('una ') + line('vez') + JSON.stringify({ done: true })
    const client = new OllamaClient('http://127.0.0.1:11434', async () =>
      streamingResponse([stream.slice(0, 7), stream.slice(7, 50), stream.slice(50)])
    )
    const tokens: string[] = []
    const { text } = await client.chat(
      'm',
      { messages: [] },
      (chunk) => tokens.push(chunk),
      new AbortController().signal
    )
    expect(tokens).toEqual(['Había ', 'una ', 'vez'])
    expect(text).toBe('Había una vez')
  })

  it('recoge las llamadas a herramientas, con argumentos como objeto o como texto JSON', async () => {
    const toolLine = JSON.stringify({
      message: {
        content: '',
        tool_calls: [
          { function: { name: 'add_slide', arguments: { title: 'Fin' } } },
          { function: { name: 'delete_slide', arguments: '{"slide": 2}' } }
        ]
      },
      done: false
    })
    const client = new OllamaClient('http://127.0.0.1:11434', async () =>
      streamingResponse([toolLine + '\n', JSON.stringify({ done: true })])
    )
    const result = await client.chat('m', { messages: [] }, () => {}, new AbortController().signal)
    expect(result.toolCalls).toEqual([
      { name: 'add_slide', arguments: { title: 'Fin' } },
      { name: 'delete_slide', arguments: { slide: 2 } }
    ])
  })

  it('pide los embeddings de varios textos de una vez', async () => {
    const client = new OllamaClient('http://127.0.0.1:11434', async (url, init) => {
      expect(url).toBe('http://127.0.0.1:11434/api/embed')
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'embeddinggemma', input: ['a', 'b'] })
      return Response.json({
        embeddings: [
          [1, 0],
          [0, 1]
        ]
      })
    })
    expect(await client.embed('embeddinggemma', ['a', 'b'])).toEqual([
      [1, 0],
      [0, 1]
    ])
  })

  it('propaga un error que llega a mitad del stream', async () => {
    const client = new OllamaClient('http://127.0.0.1:11434', async () =>
      streamingResponse([line('Hola'), JSON.stringify({ error: 'out of memory' }) + '\n'])
    )
    await expect(client.chat('m', { messages: [] }, () => {}, new AbortController().signal)).rejects.toThrow(
      'out of memory'
    )
  })
})

describe('buildChatBody', () => {
  it('pasa las herramientas en el formato de Ollama', () => {
    const tool = { name: 'set_theme', description: 'Cambia el tema', parameters: { type: 'object' } }
    expect(buildChatBody('m', { messages: [], tools: [tool] }).tools).toEqual([
      {
        type: 'function',
        function: { name: 'set_theme', description: 'Cambia el tema', parameters: { type: 'object' } }
      }
    ])
    expect(buildChatBody('m', { messages: [] })).not.toHaveProperty('tools')
  })

  it('activa la salida estructurada solo si hay esquema', () => {
    const schema = { type: 'object' }
    expect(buildChatBody('m', { messages: [] })).not.toHaveProperty('format')
    expect(buildChatBody('m', { messages: [], jsonSchema: schema, temperature: 0 })).toMatchObject({
      model: 'm',
      stream: true,
      format: schema,
      options: { temperature: 0 }
    })
  })
})
