import { describe, expect, it } from 'vitest'
import type { AiApi, AiGenerateRequest } from '@shared/ai'
import { chunkDocument, summarizeText } from './longDocument'
import { MAX_INPUT_CHARS } from './writingActions'

const paragraph = (words: number, word = 'palabra') => Array.from({ length: words }, () => word).join(' ') + '.'

describe('chunkDocument', () => {
  it('agrupa secciones enteras y empieza cada trozo en un título', () => {
    const text = ['# Uno', paragraph(10), '# Dos', paragraph(10), '# Tres', paragraph(10)].join('\n\n')
    const chunks = chunkDocument(text, 160)
    expect(chunks.length).toBe(3)
    expect(chunks.every((chunk) => chunk.startsWith('# '))).toBe(true)
    expect(chunkDocument(text, 10_000)).toEqual([text])
  })

  it('parte una sección demasiado larga por párrafos y un párrafo enorme por frases', () => {
    const long = Array.from({ length: 30 }, (_, index) => `Frase número ${index} con algo de texto.`).join(' ')
    const chunks = chunkDocument(['# Única', paragraph(20), long].join('\n\n'), 300)
    expect(chunks.length).toBeGreaterThan(3)
    expect(chunks.every((chunk) => chunk.length <= 300)).toBe(true)
    expect(chunks.join(' ')).toContain('Frase número 29')
  })
})

/** Modelo falso que registra qué le piden: "RESUMEN-PARTE-n" para cada parte, "FINAL" al juntar. */
function fakeAi(calls: AiGenerateRequest[]): AiApi {
  return {
    status: async () => ({ state: 'unreachable', endpoint: '' }),
    setModel: async () => ({ state: 'unreachable', endpoint: '' }),
    generate(request, onToken) {
      calls.push(request)
      const user = request.messages.at(-1)!.content
      const part = /^Parte (\d+) de/.exec(user)
      const text = part ? `Resumen de la parte ${part[1]}.` : 'FINAL'
      onToken?.(text)
      return { result: Promise.resolve({ text, cancelled: false }), cancel: () => {} }
    }
  }
}

describe('summarizeText', () => {
  it('un texto corto se resume en una sola llamada', async () => {
    const calls: AiGenerateRequest[] = []
    expect(await summarizeText(fakeAi(calls), 'Texto corto.')).toBe('FINAL')
    expect(calls).toHaveLength(1)
  })

  it('un texto largo se resume por partes y luego se juntan los resúmenes en orden', async () => {
    const calls: AiGenerateRequest[] = []
    const sections = Array.from({ length: 6 }, (_, index) => `# Sección ${index + 1}\n\n${paragraph(800)}`)
    const text = sections.join('\n\n')
    expect(text.length).toBeGreaterThan(MAX_INPUT_CHARS)
    const progress: string[] = []

    const summary = await summarizeText(fakeAi(calls), text, { onProgress: (step) => progress.push(step.label) })

    expect(summary).toBe('FINAL')
    expect(calls.length).toBe(progress.length)
    expect(progress.at(-1)).toBe('Juntando los resúmenes…')
    const combine = calls.at(-1)!.messages.at(-1)!.content
    expect(combine).toMatch(/Parte 1: Resumen de la parte 1\.[\s\S]*Parte 2: Resumen de la parte 2\./)
    // Nada se ha recortado: la última sección llegó al modelo.
    expect(calls.some((call) => call.messages.at(-1)!.content.includes('# Sección 6'))).toBe(true)
  })
})
