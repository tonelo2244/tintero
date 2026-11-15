import { generateStructured } from '@/core/ai/structured'
import { generateText } from '@/core/ai/text'
import { ungroundedNumbers } from '@/core/ai/grounding'
import { cleanModelText } from '@/apps/writer/model/ai/writingActions'
import { evaluateWorkbook, getCellValue } from '@/apps/sheets/model/calc'
import { createSheet, createWorkbook } from '@/apps/sheets/model/factories'
import { formatCellValue } from '@/apps/sheets/model/format'
import { toLocalizedFormula } from '@/apps/sheets/model/formula/transform'
import { parseCellAddress } from '@/apps/sheets/model/address'
import { buildExplainRequest } from '@/apps/sheets/model/ai/explainFormula'
import { buildFormulaRequest, createFormulaParser } from '@/apps/sheets/model/ai/naturalFormula'
import { describeSheet } from '@/apps/sheets/model/ai/sheetContext'
import { buildAnalysisRequest, computeTableStats, knownNumbers } from '@/apps/sheets/model/ai/tableAnalysis'
import type { Cell, CellValue, Scalar } from '@/apps/sheets/model/types'
import fixtures from '../cases/sheets-fixtures.json'
import formulaCases from '../cases/formulas.json'
import explainCases from '../cases/explain.json'
import analysisCases from '../cases/table-analysis.json'
import { check, containsAll, inLanguage, noPreamble } from '../lib/checks'
import { defineSuite, type EvalCase } from '../lib/types'

export type FixtureId = keyof typeof fixtures

/** Hoja de prueba a partir de filas (la primera fila va en A1). Un texto con "=" es una fórmula. */
export function fixtureBook(id: FixtureId, extra: Record<string, Cell> = {}) {
  const fixture = fixtures[id]
  const cells: Record<string, Cell> = {}
  fixture.rows.forEach((row, rowIndex) =>
    (row as Scalar[]).forEach((value, colIndex) => {
      cells[`${String.fromCharCode(65 + colIndex)}${rowIndex + 1}`] = { value }
    })
  )
  const workbook = createWorkbook([createSheet(fixture.name, { ...cells, ...extra })])
  return { workbook, sheet: workbook.sheets[0], evaluation: evaluateWorkbook(workbook) }
}

export function sameValue(actual: CellValue, expected: Scalar): boolean {
  if (typeof expected === 'number' && typeof actual === 'number') return Math.abs(actual - expected) < 1e-6
  return actual === expected
}

interface FormulaCase extends EvalCase {
  sheet: FixtureId
  target: string
  request: string
  expected: Scalar
  /** Una fórmula correcta escrita a mano: el test de los casos comprueba que da `expected`. */
  reference: string
}

/**
 * La suite más objetiva de todas: la fórmula se evalúa con el motor de la fase 5 y su resultado
 * se compara con el esperado. No hace falta juez: o da 2700 o no lo da.
 */
export const formulaSuite = defineSuite<FormulaCase>({
  id: 'formulas',
  description: 'Fórmula a partir de una petición en lenguaje natural (resultado exacto)',
  structured: true,
  cases: formulaCases as FormulaCase[],
  async run(testCase, context) {
    const { workbook, sheet, evaluation } = fixtureBook(testCase.sheet)
    const proposal = await generateStructured(
      context.ai,
      buildFormulaRequest({
        request: testCase.request,
        sheetDescription: describeSheet(sheet, evaluation).text,
        targetAddress: testCase.target
      }),
      createFormulaParser({ workbook, evaluation, sheetId: sheet.id, address: testCase.target }),
      { maxAttempts: 3 }
    )
    return {
      output: `${proposal.localized}  →  ${formatCellValue(proposal.preview)}\n${proposal.explanation}`,
      checks: [
        check(
          `da ${testCase.expected}`,
          sameValue(proposal.preview, testCase.expected),
          `dio ${formatCellValue(proposal.preview)}`
        ),
        check('trae explicación', proposal.explanation.length > 0)
      ]
    }
  }
})

interface ExplainCase extends EvalCase {
  sheet: FixtureId
  address: string
  formula: string
  mustMention: string[]
  shouldWarn?: boolean
}

export const explainSuite = defineSuite<ExplainCase>({
  id: 'explicar',
  description: 'Explicar una fórmula en lenguaje llano',
  structured: false,
  cases: explainCases as ExplainCase[],
  async run(testCase, context) {
    if (!parseCellAddress(testCase.address)) throw new Error(`Dirección no válida en el caso: ${testCase.address}`)
    const { sheet, evaluation } = fixtureBook(testCase.sheet, { [testCase.address]: { formula: testCase.formula } })
    const localizedFormula = `=${toLocalizedFormula(testCase.formula)}`
    const output = cleanModelText(
      await generateText(
        context.ai,
        buildExplainRequest({
          localizedFormula,
          address: testCase.address,
          result: formatCellValue(getCellValue(evaluation, sheet.id, testCase.address)),
          sheetDescription: describeSheet(sheet, evaluation).text
        })
      )
    )
    const checks = [noPreamble(output), inLanguage(output, 'es'), containsAll(output, testCase.mustMention, 'menciona')]
    const judge = await context.judge({
      task: 'Explicar qué hace una fórmula de hoja de cálculo a alguien que no sabe de fórmulas.',
      input: `${describeSheet(sheet, evaluation).text}\n\nFórmula en ${testCase.address}: ${localizedFormula}`,
      output,
      rubric: [
        { id: 'correccion', description: 'Lo que explica es exactamente lo que calcula la fórmula.' },
        { id: 'claridad', description: 'Se entiende sin saber de fórmulas y nombra las columnas por su cabecera.' },
        ...(testCase.shouldWarn
          ? [{ id: 'aviso', description: 'Avisa de que el rango no incluye todas las filas con datos.' }]
          : [])
      ]
    })
    return { output, checks, judge }
  }
})

interface AnalysisCase extends EvalCase {
  sheet: FixtureId
  range: string
  mustMention: string[]
}

export const tableAnalysisSuite = defineSuite<AnalysisCase>({
  id: 'analizar-tabla',
  description: 'Resumir una tabla: el código calcula, el modelo redacta',
  structured: false,
  cases: analysisCases as AnalysisCase[],
  async run(testCase, context) {
    const { sheet, evaluation } = fixtureBook(testCase.sheet)
    const [start, end] = testCase.range.split(':').map((address) => parseCellAddress(address)!)
    const stats = computeTableStats(sheet, evaluation, { start, end })
    const output = cleanModelText(await generateText(context.ai, buildAnalysisRequest(stats)))
    const invented = ungroundedNumbers(output, knownNumbers(stats))
    const checks = [
      noPreamble(output),
      inLanguage(output, 'es'),
      containsAll(output, testCase.mustMention, 'menciona'),
      check(
        'sin cifras inventadas',
        invented.length === 0,
        invented.length ? `inventa: ${invented.join(', ')}` : undefined
      )
    ]
    const judge = await context.judge({
      task: 'Resumir en 3 a 5 frases una tabla a partir de estadísticas ya calculadas, sin calcular nada nuevo.',
      input: buildAnalysisRequest(stats).messages[1].content,
      output,
      rubric: [
        { id: 'fidelidad', description: 'Todo lo que afirma sale de las estadísticas; no calcula ni inventa nada.' },
        {
          id: 'utilidad',
          description: 'Destaca lo importante (máximos, mínimos, lo que llama la atención) en 3 a 5 frases.'
        }
      ]
    })
    return { output, checks, judge }
  }
})
