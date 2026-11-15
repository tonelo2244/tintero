import { describe, expect, it } from 'vitest'
import type { AiGenerateRequest } from '@shared/ai'
import type { LocalModelRuntime } from '../../src/main/ai/ollamaClient'
import { renderMarkdown } from './report'
import { runEvals } from './runner'
import { defineSuite } from './types'
import { check } from './checks'
import { generateText } from '@/core/ai/text'
import { generateStructured } from '@/core/ai/structured'

/** Runtime falso: responde lo que diga `reply` y cuenta las llamadas. */
function fakeRuntime(reply: (request: AiGenerateRequest) => string): LocalModelRuntime {
  return {
    endpoint: 'http://127.0.0.1:1',
    listModels: async () => ['modelo:prueba'],
    chat: async (_model, request, onToken) => {
      const text = reply(request)
      onToken(text)
      return text
    }
  }
}

const info = { runtime: 'falso', startedAt: '2026-11-15T10:00:00Z', commit: 'abc123' }

describe('runEvals', () => {
  it('mide aprobados, reintentos y JSON a la primera', async () => {
    let attempt = 0
    const suite = defineSuite({
      id: 'json',
      description: 'JSON con reintento',
      structured: true,
      cases: [{ id: 'uno' }],
      async run(_testCase, context) {
        const value = await generateStructured(
          context.ai,
          { messages: [{ role: 'user', content: 'dame un número' }], jsonSchema: {} },
          (raw) => {
            if (typeof (raw as { n?: unknown }).n !== 'number') throw new Error('falta n')
            return (raw as { n: number }).n
          }
        )
        return { output: String(value), checks: [check('es 7', value === 7)] }
      }
    })
    const runtime = fakeRuntime(() => (attempt++ === 0 ? 'no es json' : '{"n": 7}'))
    const report = await runEvals({
      runtime,
      model: 'modelo:prueba',
      judgeModel: 'modelo:prueba',
      suites: [suite],
      repeat: 1,
      info
    })

    expect(report.results[0]).toMatchObject({ passed: true, calls: 2, score: 1 })
    expect(report.suites[0]).toMatchObject({ passRate: 1, validFirstTryRate: 0, meanRetries: 1 })
  })

  it('un error cuenta como suspenso y el juez no suma llamadas a la función evaluada', async () => {
    const suite = defineSuite({
      id: 'texto',
      description: 'Texto con juez',
      structured: false,
      cases: [{ id: 'bien' }, { id: 'roto' }],
      async run(testCase, context) {
        if (testCase.id === 'roto') throw new Error('modelo caído')
        const output = await generateText(context.ai, { messages: [{ role: 'user', content: 'hola' }] })
        const judge = await context.judge({
          task: 't',
          input: 'i',
          output,
          rubric: [{ id: 'calidad', description: 'buena' }]
        })
        return { output, checks: [], judge }
      }
    })
    const runtime = fakeRuntime((request) =>
      request.jsonSchema ? '{"criterios":[{"id":"calidad","motivo":"bien","puntuacion":5}]}' : 'Hola.'
    )
    const report = await runEvals({
      runtime,
      model: 'modelo:prueba',
      judgeModel: 'modelo:prueba',
      suites: [suite],
      repeat: 2,
      info
    })

    expect(report.results).toHaveLength(4)
    expect(report.results.filter((result) => result.caseId === 'bien').every((result) => result.calls === 1)).toBe(true)
    expect(report.suites[0]).toMatchObject({ runs: 4, passRate: 0.5, errors: 2 })
    expect(renderMarkdown(report)).toContain('modelo caído')
  })
})

describe('comprobaciones de formato', () => {
  it('detecta una negrita perdida', async () => {
    const { keepsMarks, keepsMarkTypes } = await import('./checks')
    expect(keepsMarks('El **proyecto** acabó', 'El **proyecto** acabo').passed).toBe(true)
    expect(keepsMarks('El proyecto acabó', 'El **proyecto** acabo')).toMatchObject({ passed: false })
    expect(keepsMarkTypes('El **viernes** no habrá reunión', 'el **viernes** no hay').passed).toBe(true)
  })
})
