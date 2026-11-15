import { describe, expect, it } from 'vitest'
import type { AiApi, AiGenerateRequest } from '@shared/ai'
import { AiCancelledError, AiInvalidOutputError, generateStructured, parseJsonResponse } from './structured'

/** IA falsa que contesta las respuestas dadas, en orden, y guarda lo que se le pidió. */
function scriptedAi(replies: string[]) {
  const requests: AiGenerateRequest[] = []
  const ai: AiApi = {
    status: async () => ({ state: 'unreachable', endpoint: '' }),
    setModel: async () => ({ state: 'unreachable', endpoint: '' }),
    generate: (request) => {
      requests.push(structuredClone(request))
      const text = replies.shift() ?? ''
      return { result: Promise.resolve({ text, toolCalls: [], cancelled: false }), cancel: () => {} }
    }
  }
  return { ai, requests }
}

const parseTitle = (value: unknown) => {
  const title = (value as { title?: unknown })?.title
  if (typeof title !== 'string' || !title) throw new Error('falta "title"')
  return title
}

const request = { messages: [{ role: 'user' as const, content: 'Dame un título' }], jsonSchema: {} }

describe('parseJsonResponse', () => {
  it('quita vallas de Markdown y texto alrededor del objeto', () => {
    expect(parseJsonResponse('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(parseJsonResponse('Aquí tienes: {"a":1} ¡listo!')).toEqual({ a: 1 })
    expect(() => parseJsonResponse('no hay json')).toThrow('no es JSON válido')
  })
})

describe('generateStructured', () => {
  it('devuelve el valor validado', async () => {
    const { ai } = scriptedAi(['{"title":"Informe"}'])
    expect(await generateStructured(ai, request, parseTitle)).toBe('Informe')
  })

  it('reintenta enseñándole al modelo su respuesta y el error', async () => {
    const { ai, requests } = scriptedAi(['{"titulo":"x"}', '{"title":"Informe"}'])
    expect(await generateStructured(ai, request, parseTitle)).toBe('Informe')
    const retry = requests[1].messages
    expect(retry.at(-2)).toEqual({ role: 'assistant', content: '{"titulo":"x"}' })
    expect(retry.at(-1)?.content).toContain('falta "title"')
  })

  it('se rinde tras los intentos permitidos', async () => {
    const { ai } = scriptedAi(['nada', 'tampoco'])
    await expect(generateStructured(ai, request, parseTitle)).rejects.toBeInstanceOf(AiInvalidOutputError)
  })

  it('no reintenta si el usuario canceló', async () => {
    const controller = new AbortController()
    controller.abort()
    const { ai, requests } = scriptedAi(['{"title":"x"}'])
    await expect(generateStructured(ai, request, parseTitle, { signal: controller.signal })).rejects.toBeInstanceOf(
      AiCancelledError
    )
    expect(requests).toHaveLength(0)
  })
})
