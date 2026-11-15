import { describe, expect, it } from 'vitest'
import { ungroundedNumbers } from '@/core/ai/grounding'
import { evaluateWorkbook } from '../calc'
import { createSheet, createWorkbook } from '../factories'
import type { Cell, Workbook } from '../types'
import { buildExplainRequest } from './explainFormula'
import { buildFormulaRequest, createFormulaParser } from './naturalFormula'
import { describeSheet } from './sheetContext'
import { buildAnalysisRequest, computeTableStats, knownNumbers } from './tableAnalysis'

const v = (value: Cell['value']): Cell => ({ value })

/** Región | Ventas | Unidades, con 4 filas de datos. */
function salesBook(): Workbook {
  const rows: [string, number, number][] = [
    ['Norte', 1200, 30],
    ['Sur', 800, 12],
    ['Este', 1500, 45],
    ['Oeste', 950, 8]
  ]
  const cells: Record<string, Cell> = { A1: v('Región'), B1: v('Ventas'), C1: v('Unidades') }
  rows.forEach(([region, sales, units], index) => {
    cells[`A${index + 2}`] = v(region)
    cells[`B${index + 2}`] = v(sales)
    cells[`C${index + 2}`] = v(units)
  })
  const workbook = createWorkbook([createSheet('Ventas', cells)])
  workbook.sheets[0].id = 's1'
  workbook.activeSheetId = 's1'
  return workbook
}

function target(address = 'E2') {
  const workbook = salesBook()
  return { workbook, evaluation: evaluateWorkbook(workbook), sheetId: 's1', address }
}

describe('describeSheet', () => {
  it('da cabeceras, unas filas y dónde acaban los datos', () => {
    const { workbook, evaluation } = target()
    const { text, dataRange } = describeSheet(workbook.sheets[0], evaluation)
    expect(text).toContain('Datos en A1:C5 (5 filas')
    expect(text).toContain('| fila | A | B | C |')
    expect(text).toContain('| 1 | "Región" | "Ventas" | "Unidades" |')
    expect(text).toContain('| 5 | "Oeste" | 950 | 8 |')
    expect(dataRange?.end).toEqual({ row: 4, col: 2 })
  })

  it('con muchas filas enseña el principio y la última', () => {
    const cells: Record<string, Cell> = {}
    for (let row = 1; row <= 100; row++) cells[`A${row}`] = v(row)
    const workbook = createWorkbook([createSheet('Larga', cells)])
    const { text } = describeSheet(workbook.sheets[0], evaluateWorkbook(workbook))
    expect(text).toContain('| … | … |')
    expect(text).toContain('| 100 | 100 |')
    expect(text).not.toContain('| 50 |')
  })
})

describe('fórmulas en lenguaje natural', () => {
  it('pide JSON con esquema y manda el contexto de la hoja como datos', () => {
    const request = buildFormulaRequest({ request: 'suma las ventas', sheetDescription: 'HOJA', targetAddress: 'E2' })
    expect(request.jsonSchema).toMatchObject({ required: ['formula', 'explicacion'] })
    expect(request.messages[1].content).toContain('<peticion>\nsuma las ventas\n</peticion>')
    expect(request.messages[1].content).toContain('celda E2')
  })

  it('acepta la fórmula en inglés o en español y enseña el resultado', () => {
    const parse = createFormulaParser(target())
    const english = parse({
      formula: '=SUMIF(B2:B5,">1000",C2:C5)',
      explicacion: 'Suma las unidades con ventas > 1000.'
    })
    expect(english).toMatchObject({
      canonical: 'SUMIF(B2:B5,">1000",C2:C5)',
      localized: '=SUMAR.SI(B2:B5;">1000";C2:C5)',
      preview: 75
    })
    expect(parse({ formula: 'PROMEDIO(B2:B5)', explicacion: '' }).preview).toBe(1112.5)
  })

  it('rechaza con un motivo útil para el reintento', () => {
    const parse = createFormulaParser(target('B6'))
    expect(() => parse({ formula: 'SUM(B2:B5', explicacion: '' })).toThrow(/no es válida/)
    expect(() => parse({ formula: 'MEDIAN(B2:B5)', explicacion: '' })).toThrow(/MEDIAN no existe; usa solo: SUM/)
    expect(() => parse({ formula: 'ROUND(B2,1,2)', explicacion: '' })).toThrow(
      /ROUND necesita entre 1 y 2 argumentos y tiene 3/
    )
    expect(() => parse({ formula: 'SUM(Ventas)', explicacion: '' })).toThrow(/no es una función ni una celda/)
    expect(() => parse({ formula: 'SUM(B2:B10)', explicacion: '' })).toThrow(/propia celda \(B6\)/)
    expect(() => parse({ formula: 'Otra!A1', explicacion: '' })).toThrow(/la hoja "Otra" no existe/)
    expect(() => parse({ formula: 'A2*2', explicacion: '' })).toThrow(/da #¡VALOR!/)
    expect(() => parse({ explicacion: 'nada' })).toThrow(/falta "formula"/)
  })
})

describe('explicar una fórmula', () => {
  it('manda la fórmula tal y como la ve el usuario, con su resultado', () => {
    const request = buildExplainRequest({
      localizedFormula: '=SUMA(B2:B5)',
      address: 'B6',
      result: '4450',
      sheetDescription: 'HOJA'
    })
    expect(request.messages[1].content).toContain('Celda B6: =SUMA(B2:B5)')
    expect(request.messages[1].content).toContain('Resultado actual: 4450')
  })
})

describe('analizar una tabla', () => {
  const { workbook, evaluation } = target()
  const stats = computeTableStats(workbook.sheets[0], evaluation, {
    start: { row: 0, col: 0 },
    end: { row: 4, col: 2 }
  })

  it('el código calcula las cifras, incluido quién tiene el máximo', () => {
    expect(stats).toMatchObject({ range: 'A1:C5', dataRows: 4, hasHeader: true })
    expect(stats.columns[1]).toMatchObject({
      header: 'Ventas',
      numeric: { sum: 4450, mean: 1112.5, min: 800, max: 1500, minLabel: 'Sur', maxLabel: 'Este' }
    })
    expect(stats.columns[0]).toMatchObject({ header: 'Región', distinctTexts: 4, numeric: null })
  })

  it('el prompt lleva las estadísticas y el resumen se puede comprobar cifra a cifra', () => {
    const request = buildAnalysisRequest(stats)
    expect(request.messages[1].content).toContain('"Ventas" (columna B): 4 valores; suma 4450; media 1112,5')
    const good = 'Las ventas suman 4.450 € y la media es de 1.112,5. Este lidera con 1.500 y Sur queda último con 800.'
    expect(ungroundedNumbers(good, knownNumbers(stats))).toEqual([])
    expect(ungroundedNumbers('Las ventas crecieron un 35 % hasta 5.000.', knownNumbers(stats))).toEqual([35, 5000])
  })
})
