import { describe, expect, it } from 'vitest'
import { evaluateWorkbook, getCellValue, updateEvaluation } from '../calc'
import { createSheet, createWorkbook } from '../factories'
import type { Cell, Workbook } from '../types'
import { workbookReducer } from '../workbookReducer'
import { buildSheetAgentRequest, interpretSheetCalls } from './sheetTools'

const v = (value: Cell['value']): Cell => ({ value })

function book(): Workbook {
  const workbook = createWorkbook([
    createSheet('Ventas', { A1: v('Región'), B1: v('Ventas'), A2: v('Norte'), B2: v(100), A3: v('Sur'), B3: v(50) })
  ])
  workbook.sheets[0].id = 's1'
  workbook.activeSheetId = 's1'
  return workbook
}

function run(calls: Parameters<typeof interpretSheetCalls>[2]) {
  const workbook = book()
  const result = interpretSheetCalls(workbook, { sheetId: 's1', evaluation: evaluateWorkbook(workbook) }, calls)
  const next = result.steps.flatMap((step) => step.actions).reduce(workbookReducer, workbook)
  return { result, next, values: updateEvaluation(evaluateWorkbook(workbook), next) }
}

describe('agente de Hojas', () => {
  it('manda la hoja, la celda activa y la petición como datos', () => {
    const request = buildSheetAgentRequest('HOJA', 'C4', 'pon totales')
    expect(request.tools.map((tool) => tool.name)).toEqual([
      'set_values',
      'set_formula',
      'format_cells',
      'clear_cells',
      'add_sheet'
    ])
    expect(request.messages[1].content).toContain('Celda seleccionada: C4.')
  })

  it('«pon en negrita la cabecera y añade el total»', () => {
    const { result, next, values } = run([
      { name: 'format_cells', arguments: { range: 'A1:B1', bold: true, fill: '#FFF2CC' } },
      { name: 'set_values', arguments: { start: 'A4', rows: [['Total', '=SUM(B2:B3)']] } }
    ])
    expect(result.problems).toEqual([])
    expect(result.steps.map((step) => step.label)).toEqual([
      'Dar formato a A1:B1: negrita, relleno #fff2cc',
      'Escribir 2 celdas en A4:B4'
    ])
    expect(next.sheets[0].cells.B1.style).toMatchObject({ bold: true, fill: '#fff2cc' })
    expect(next.sheets[0].cells.B4).toEqual({ formula: 'SUM(B2:B3)' })
    expect(getCellValue(values, 's1', 'B4')).toBe(150)
  })

  it('valida las fórmulas con el parser y descarta lo inválido con motivo', () => {
    const { result } = run([
      { name: 'set_formula', arguments: { cell: 'C2', formula: 'MEDIAN(B2:B3)' } },
      { name: 'set_formula', arguments: { cell: 'B2', formula: 'B2*2' } },
      { name: 'format_cells', arguments: { range: 'B:B', bold: true } },
      { name: 'clear_cells', arguments: { range: 'Z1:Z9' } },
      { name: 'add_sheet', arguments: { name: 'ventas' } },
      { name: 'set_formula', arguments: { cell: 'C2', formula: 'B2*2' } }
    ])
    expect(result.steps.map((step) => step.label)).toEqual(['Poner =B2*2 en C2'])
    expect(result.problems).toEqual([
      expect.stringMatching(/^set_formula: la función MEDIAN no existe/),
      expect.stringMatching(/^set_formula: la fórmula no puede leer su propia celda \(B2\)/),
      expect.stringMatching(/^format_cells: "B:B" no es una celda ni un rango/),
      'clear_cells: Z1:Z9 ya está vacío',
      expect.stringMatching(/^add_sheet: /)
    ])
  })

  it('añadir una hoja no cambia la hoja activa', () => {
    const { next } = run([{ name: 'add_sheet', arguments: { name: 'Resumen' } }])
    expect(next.sheets.map((sheet) => sheet.name)).toEqual(['Ventas', 'Resumen'])
    expect(next.activeSheetId).toBe('s1')
  })
})
