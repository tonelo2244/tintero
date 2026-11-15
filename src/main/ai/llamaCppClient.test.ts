import { describe, expect, it } from 'vitest'
import { createRuntime } from './createRuntime'
import { buildCompletionBody, LlamaCppClient } from './llamaCppClient'
import { OllamaClient, RuntimeUnreachableError } from './ollamaClient'
import { SseDecoder } from './sse'

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

const event = (delta: Record<string, unknown>) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`

describe('SseDecoder', () => {
  it('reconstruye eventos partidos y entiende CRLF', () => {
    const decoder = new SseDecoder()
    const full = event({ content: 'Hola' }) + 'data: [DONE]\r\n\r\n'
    expect(decoder.push(full.slice(0, 12))).toEqual([])
    expect(decoder.push(full.slice(12))).toEqual([
      JSON.stringify({ choices: [{ delta: { content: 'Hola' } }] }),
      '[DONE]'
    ])
    expect(decoder.flush()).toEqual([])
  })
})

describe('LlamaCppClient', () => {
  it('lista el modelo servido y emite el texto en streaming', async () => {
    const requests: { url: string; body?: unknown }[] = []
    const client = new LlamaCppClient('http://127.0.0.1:8080', async (url, init) => {
      requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url.endsWith('/v1/models')) return Response.json({ data: [{ id: 'gemma-4-e4b.gguf' }] })
      const full = event({ content: 'Hola' }) + event({ content: ' mundo' }) + 'data: [DONE]\n\n'
      return streamingResponse([full.slice(0, 20), full.slice(20)])
    })
    expect(await client.listModels()).toEqual(['gemma-4-e4b.gguf'])
    const tokens: string[] = []
    const result = await client.chat('x', { messages: [] }, (chunk) => tokens.push(chunk), new AbortController().signal)
    expect(result).toEqual({ text: 'Hola mundo', toolCalls: [] })
    expect(tokens).toEqual(['Hola', ' mundo'])
    expect(requests[1]).toMatchObject({ url: 'http://127.0.0.1:8080/v1/chat/completions', body: { stream: true } })
  })

  it('junta las llamadas a herramientas que llegan troceadas', async () => {
    const client = new LlamaCppClient('http://127.0.0.1:8080', async () =>
      streamingResponse([
        event({ tool_calls: [{ index: 0, function: { name: 'set_theme', arguments: '{"the' } }] }),
        event({ tool_calls: [{ index: 0, function: { arguments: 'me":"bosque"}' } }] }),
        event({ tool_calls: [{ index: 1, function: { name: 'add_slide', arguments: '{}' } }] }),
        'data: [DONE]\n\n'
      ])
    )
    const result = await client.chat('x', { messages: [] }, () => {}, new AbortController().signal)
    expect(result.toolCalls).toEqual([
      { name: 'set_theme', arguments: { theme: 'bosque' } },
      { name: 'add_slide', arguments: {} }
    ])
  })

  it('pide JSON con esquema y herramientas en formato OpenAI', () => {
    const schema = { type: 'object' }
    const body = buildCompletionBody('m', {
      messages: [],
      jsonSchema: schema,
      tools: [{ name: 'add_slide', description: 'Añade', parameters: schema }]
    })
    expect(body).toMatchObject({
      response_format: { type: 'json_schema', json_schema: { schema } },
      tools: [{ type: 'function', function: { name: 'add_slide' } }]
    })
  })

  it('devuelve los embeddings en el orden de los textos', async () => {
    const client = new LlamaCppClient('http://127.0.0.1:8080', async () =>
      Response.json({
        data: [
          { index: 1, embedding: [0, 1] },
          { index: 0, embedding: [1, 0] }
        ]
      })
    )
    expect(await client.embed('m', ['a', 'b'])).toEqual([
      [1, 0],
      [0, 1]
    ])
  })

  it('traduce "no responde" y los errores del servidor', async () => {
    const down = new LlamaCppClient('http://127.0.0.1:8080', async () => {
      throw new TypeError('fetch failed')
    })
    await expect(down.listModels()).rejects.toThrow(RuntimeUnreachableError)
    await expect(down.listModels()).rejects.toThrow(/llama-server/)
    const failing = new LlamaCppClient('http://127.0.0.1:8080', async () =>
      Response.json({ error: { message: 'context too long' } }, { status: 400 })
    )
    await expect(failing.embed('m', ['a'])).rejects.toThrow('llama-server: context too long')
  })

  it('tampoco acepta direcciones fuera de este equipo', () => {
    expect(() => new LlamaCppClient('http://10.0.0.5:8080')).toThrow(/no es una dirección local/)
  })
})

describe('createRuntime', () => {
  it('elige el runtime por nombre', () => {
    expect(createRuntime('ollama')).toBeInstanceOf(OllamaClient)
    expect(createRuntime('llamacpp').endpoint).toBe('http://127.0.0.1:8080')
    expect(() => createRuntime('vllm')).toThrow(/ollama o llamacpp/)
  })
})
