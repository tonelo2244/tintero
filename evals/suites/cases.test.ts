import { describe, expect, it } from 'vitest'
import { createFormulaParser } from '@/apps/sheets/model/ai/naturalFormula'
import { documentChunks } from '@/apps/writer/model/ai/documentChunks'
import formulaCases from '../cases/formulas.json'
import ragCorpus from '../cases/rag-corpus.json'
import ragCases from '../cases/rag.json'
import { SUITES } from '.'
import { corpusDocument } from './rag'
import { fixtureBook, sameValue, type FixtureId } from './sheets'

/**
 * Los casos también son código y también tienen errores: un "esperado" mal calculado haría
 * suspender a un modelo que acierta. Estos tests validan el propio banco de evaluación.
 */
describe('casos del banco de evaluación', () => {
  it('cada suite tiene casos con ids únicos', () => {
    for (const suite of SUITES) {
      const ids = suite.cases.map((testCase) => testCase.id)
      expect(ids.length, suite.id).toBeGreaterThan(0)
      expect(new Set(ids).size, suite.id).toBe(ids.length)
    }
  })

  it.each(formulaCases)('la fórmula de referencia de «$id» pasa el validador y da lo esperado', (testCase) => {
    const { workbook, sheet, evaluation } = fixtureBook(testCase.sheet as FixtureId)
    const parse = createFormulaParser({ workbook, evaluation, sheetId: sheet.id, address: testCase.target })
    const proposal = parse({ formula: testCase.reference, explicacion: 'referencia' })
    expect(sameValue(proposal.preview, testCase.expected), `dio ${JSON.stringify(proposal.preview)}`).toBe(true)
  })

  it.each(ragCases.filter((testCase) => !testCase.notFound))(
    'el párrafo esperado de «$id» existe y cae entero en un trozo',
    (testCase) => {
      const document = ragCorpus.documents.find((candidate) => candidate.id === testCase.expectedSource)
      expect(document, testCase.expectedSource).toBeDefined()
      const chunks = documentChunks(corpusDocument(document!.blocks))
      expect(chunks.some((chunk) => chunk.text.includes(testCase.expectedSnippet!))).toBe(true)
    }
  )
})
