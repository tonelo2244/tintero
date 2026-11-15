import { describe, expect, it } from 'vitest'
import { chartData, niceTicks } from './chart'
import { conditionalStyler, mixColors } from './conditional'
import { createSheet, createWorkbook } from './factories'
import type { Cell, CellValue } from './types'
import { workbookReducer } from './workbookReducer'

const range = (r1: number, c1: number, r2: number, c2: number) => ({
  start: { row: r1, col: c1 },
  end: { row: r2, col: c2 }
})

function valuesOf(cells: Record<string, Cell>) {
  return (address: string): CellValue => cells[address]?.value ?? null
}

describe('datos de un gráfico', () => {
  const cells: Record<string, Cell> = {
    A1: { value: 'Mes' },
    B1: { value: 'Ventas' },
    C1: { value: 'Gastos' },
    A2: { value: 'Ene' },
    B2: { value: 10 },
    C2: { value: 4 },
    A3: { value: 'Feb' },
    B3: { value: 'n/d' },
    C3: { value: 6 }
  }

  it('cabecera = nombres de serie, primera columna = categorías, el texto es un hueco', () => {
    const sheet = createSheet('Hoja1', cells)
    expect(chartData(sheet, range(0, 0, 2, 2), valuesOf(cells))).toEqual({
      categories: ['Ene', 'Feb'],
      series: [
        { name: 'Ventas', values: [10, null] },
        { name: 'Gastos', values: [4, 6] }
      ]
    })
  })

  it('una sola columna de números: categorías numeradas y serie sin nombre', () => {
    const only: Record<string, Cell> = { A1: { value: 3 }, A2: { value: 5 } }
    expect(chartData(createSheet('x', only), range(0, 0, 1, 0), valuesOf(only))).toEqual({
      categories: ['1', '2'],
      series: [{ name: 'Serie 1', values: [3, 5] }]
    })
  })

  it('marcas de eje redondas', () => {
    expect(niceTicks(0, 97)).toEqual([0, 20, 40, 60, 80, 100])
    expect(niceTicks(-12, 30)).toEqual([-20, -10, 0, 10, 20, 30])
  })
})

describe('formato condicional', () => {
  it('aplica la primera regla que se cumple y las escalas de color', () => {
    const cells: Record<string, Cell> = {
      A1: { value: 0 },
      A2: { value: 50 },
      A3: { value: 100 },
      B1: { value: 'Pendiente' }
    }
    const sheet = createSheet('Hoja1', cells)
    sheet.conditionalFormats = [
      { id: 'r1', range: range(0, 0, 2, 0), rule: { kind: 'greaterThan', value: 90 }, style: { bold: true } },
      { id: 'r2', range: range(0, 0, 2, 0), rule: { kind: 'colorScale', minColor: '#ffffff', maxColor: '#000000' } },
      { id: 'r3', range: range(0, 1, 0, 1), rule: { kind: 'textContains', text: 'pend' }, style: { fill: '#ffeb9c' } }
    ]
    const styler = conditionalStyler(sheet, valuesOf(cells))!
    expect(styler('A3', 100)).toEqual({ bold: true })
    expect(styler('A2', 50)).toEqual({ fill: '#808080' })
    expect(styler('A1', 0)).toEqual({ fill: '#ffffff' })
    expect(styler('B1', 'Pendiente')).toEqual({ fill: '#ffeb9c' })
    expect(styler('C1', 5)).toBeUndefined()
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  it('el reducer añade reglas delante, las borra por rango y las mueve al insertar columnas', () => {
    const workbook = createWorkbook([createSheet('Hoja1')])
    const sheetId = workbook.sheets[0].id
    let next = workbookReducer(workbook, {
      type: 'conditional/add',
      sheetId,
      format: { id: 'a', range: range(0, 0, 4, 0), rule: { kind: 'lessThan', value: 0 }, style: { color: '#ff0000' } }
    })
    next = workbookReducer(next, {
      type: 'structure/change',
      sheetId,
      change: { kind: 'insert', axis: 'columns', at: 0, count: 1 }
    })
    expect(next.sheets[0].conditionalFormats?.[0].range).toEqual(range(0, 1, 4, 1))
    next = workbookReducer(next, { type: 'conditional/clear', sheetId, range: range(2, 1, 2, 1) })
    expect(next.sheets[0].conditionalFormats).toBeUndefined()
  })

  it('los gráficos se añaden, cambian y borran, y su rango sigue a los datos', () => {
    const workbook = createWorkbook([createSheet('Hoja1')])
    const sheetId = workbook.sheets[0].id
    const chart = { id: 'c1', kind: 'bar' as const, source: range(1, 0, 3, 1), x: 10, y: 10, width: 300, height: 200 }
    let next = workbookReducer(workbook, { type: 'chart/add', sheetId, chart })
    next = workbookReducer(next, {
      type: 'chart/update',
      sheetId,
      chartId: 'c1',
      patch: { kind: 'pie', title: 'Hola' }
    })
    next = workbookReducer(next, {
      type: 'structure/change',
      sheetId,
      change: { kind: 'insert', axis: 'rows', at: 0, count: 1 }
    })
    expect(next.sheets[0].charts).toEqual([{ ...chart, kind: 'pie', title: 'Hola', source: range(2, 0, 4, 1) }])
    next = workbookReducer(next, { type: 'chart/delete', sheetId, chartId: 'c1' })
    expect(next.sheets[0].charts).toBeUndefined()
  })
})
