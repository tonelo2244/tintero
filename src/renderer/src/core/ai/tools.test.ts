import { describe, expect, it } from 'vitest'
import type { AiApi, AiGenerateRequest, AiToolCall } from '@shared/ai'
import { args, interpretSequentially, proposeToolCalls } from './tools'

type Action = { add: number }
const reducer = (state: number, action: Action) => state + action.add

/** Interpreta add(n): n debe ser un entero positivo. */
const interpret = (calls: AiToolCall[]) =>
  interpretSequentially<number, Action>(calls, 0, reducer, (call) => {
    if (call.name !== 'add') throw new Error('herramienta desconocida')
    const n = args.integer(call.arguments, 'n')!
    if (n < 0) throw new Error('"n" debe ser positivo')
    return { label: `Sumar ${n}`, actions: [{ add: n }] }
  })

function scriptedAi(replies: AiToolCall[][]) {
  const requests: AiGenerateRequest[] = []
  const ai: AiApi = {
    status: async () => ({ state: 'unreachable', endpoint: '' }),
    setModel: async () => ({ state: 'unreachable', endpoint: '' }),
    generate(request) {
      requests.push(structuredClone(request))
      const toolCalls = replies.shift() ?? []
      return { result: Promise.resolve({ text: '', toolCalls, cancelled: false }), cancel: () => {} }
    }
  }
  return { ai, requests }
}

const request = { messages: [{ role: 'user' as const, content: 'suma' }], tools: [] }

describe('interpretSequentially', () => {
  it('convierte llamadas válidas en pasos y descarta las inválidas con motivo', () => {
    const result = interpret([
      { name: 'add', arguments: { n: 2 } },
      { name: 'add', arguments: { n: -1 } },
      { name: 'borrar', arguments: {} },
      { name: 'add', arguments: { n: 0 } }
    ])
    expect(result.steps.map((step) => step.label)).toEqual(['Sumar 2'])
    expect(result.problems).toEqual([
      'add: "n" debe ser positivo',
      'borrar: herramienta desconocida',
      'add: no cambia nada'
    ])
  })
})

describe('proposeToolCalls', () => {
  it('a la primera, si todo es válido', async () => {
    const { ai, requests } = scriptedAi([[{ name: 'add', arguments: { n: 3 } }]])
    const proposal = await proposeToolCalls(ai, request, interpret)
    expect(proposal.steps).toHaveLength(1)
    expect(requests).toHaveLength(1)
  })

  it('reintenta enseñando los problemas y se queda con la versión corregida', async () => {
    const { ai, requests } = scriptedAi([
      [{ name: 'add', arguments: { n: 'tres' } }],
      [{ name: 'add', arguments: { n: 3 } }]
    ])
    const proposal = await proposeToolCalls(ai, request, interpret)
    expect(proposal).toMatchObject({ problems: [], steps: [{ label: 'Sumar 3' }] })
    expect(requests[1].messages.at(-1)!.content).toContain('add: "n" debe ser un número entero')
  })

  it('si no usa herramientas, se lo pide otra vez', async () => {
    const { ai, requests } = scriptedAi([[], []])
    const proposal = await proposeToolCalls(ai, request, interpret)
    expect(proposal.steps).toEqual([])
    expect(requests[1].messages.at(-1)!.content).toContain('No has usado ninguna herramienta')
  })
})
