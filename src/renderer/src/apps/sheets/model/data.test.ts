import { describe, expect, it } from 'vitest'
import { evaluateWorkbook, getCellValue } from './calc'
import { createSheet, createWorkbook } from './factories'
import { BLANK_LABEL, filterChoices, hiddenRows } from './filter'
import { findCells, replaceInCell, type FindOptions } from './find'
import { currentRegion } from './selection'
import { compareForSort, guessHasHeader, sortRange } from './sort'
import type { Cell, CellValue, Sheet } from './types'
import { workbookReducer } from './workbookReducer'

const range = (r1: number, c1: number, r2: number, c2: number) => ({
  start: { row: r1, col: c1 },
  end: { row: r2, col: c2 }
})

function sheetWith(cells: Record<string, Cell>): { sheet: Sheet; valueAt: (address: string) => CellValue } {
  const sheet = createSheet('Hoja1', cells)
  sheet.id = 's1'
  const evaluation = evaluateWorkbook(createWorkbook([sheet]))
  return {
    sheet,
    valueAt: (address) => getCellValue(evaluation, 's1', address)
  }
}

describe('ordenar', () => {
  it('sigue el orden de Excel: números, textos, lógicos, errores y vacías siempre al final', () => {
    const values = ['b', null, true, 3, { error: '#N/A' as const }, 'A', 1]
    expect([...values].sort((a, b) => compareForSort(a, b, false))).toEqual([
      1,
      3,
      'A',
      'b',
      true,
      { error: '#N/A' },
      null
    ])
    expect([...values].sort((a, b) => compareForSort(a, b, true)).at(-1)).toBeNull()
  })

  it('ordena por varias claves, deja la cabecera y ajusta las fórmulas que cambian de fila', () => {
    const { sheet, valueAt } = sheetWith({
      A1: { value: 'Zona' },
      B1: { value: 'Ventas' },
      C1: { value: 'Doble' },
      A2: { value: 'Sur' },
      B2: { value: 5 },
      C2: { formula: 'B2*2' },
      A3: { value: 'Norte' },
      B3: { value: 7 },
      C3: { formula: 'B3*2' },
      A4: { value: 'Sur' },
      B4: { value: 9 },
      C4: { formula: 'B4*2' }
    })
    const target = range(0, 0, 3, 2)
    expect(guessHasHeader(target, valueAt)).toBe(true)
    const updates = sortRange(
      sheet,
      target,
      [
        { col: 0, descending: false },
        { col: 1, descending: true }
      ],
      true,
      valueAt
    )
    expect(updates).toEqual({
      A2: { value: 'Norte' },
      B2: { value: 7 },
      C2: { formula: 'B2*2' },
      A3: { value: 'Sur' },
      B3: { value: 9 },
      C3: { formula: 'B3*2' },
      A4: { value: 'Sur' },
      B4: { value: 5 },
      C4: { formula: 'B4*2' }
    })
  })
})

describe('filtrar', () => {
  const data = {
    A1: { value: 'Zona' },
    B1: { value: 'Ventas' },
    A2: { value: 'Sur' },
    B2: { value: 5 },
    A3: { value: 'Norte' },
    B3: { value: 7 },
    A4: { value: 'Sur' },
    A5: { value: 'Este' },
    B5: { value: 7 }
  }

  it('oculta las filas con valores desmarcados, sin tocar los datos', () => {
    const { sheet, valueAt } = sheetWith(data)
    sheet.filter = { range: range(0, 0, 4, 1), excluded: { 0: ['Sur'] } }
    expect([...hiddenRows(sheet, valueAt)]).toEqual([1, 3])
    sheet.filter = { range: range(0, 0, 4, 1), excluded: { 1: [BLANK_LABEL, '7'] } }
    expect([...hiddenRows(sheet, valueAt)]).toEqual([2, 3, 4])
  })

  it('la lista de una columna solo ofrece lo que dejan ver las demás columnas', () => {
    const { sheet, valueAt } = sheetWith(data)
    sheet.filter = { range: range(0, 0, 4, 1), excluded: { 0: ['Sur'] } }
    expect(filterChoices(sheet, 1, valueAt)).toEqual(['7'])
    expect(filterChoices(sheet, 0, valueAt)).toEqual(['Este', 'Norte', 'Sur'])
  })

  it('el reducer pone y quita el filtro, y la región actual sale sola desde una celda', () => {
    const { sheet } = sheetWith(data)
    expect(currentRegion(sheet, { row: 2, col: 1 })).toEqual(range(0, 0, 4, 1))
    expect(currentRegion(sheet, { row: 20, col: 5 })).toBeNull()
    const workbook = createWorkbook([sheet])
    const filtered = workbookReducer(workbook, {
      type: 'filter/set',
      sheetId: 's1',
      filter: { range: range(0, 0, 4, 1), excluded: {} }
    })
    expect(filtered.sheets[0].filter).toBeDefined()
    expect(workbookReducer(filtered, { type: 'filter/set', sheetId: 's1', filter: null }).sheets[0].filter).toBe(
      undefined
    )
  })
})

describe('buscar y reemplazar', () => {
  const options: FindOptions = { query: 'sur', matchCase: false, wholeCell: false, lookIn: 'values', scope: 'sheet' }

  it('busca en valores o en fórmulas, en la hoja o en el libro', () => {
    const first = createSheet('Uno', { B2: { value: 'Sur' }, A1: { value: 'Surtido' }, C1: { formula: 'SUM(A1:A2)' } })
    const second = createSheet('Dos', { A1: { value: 'sur' } })
    first.id = 'a'
    second.id = 'b'
    const workbook = createWorkbook([first, second])
    const evaluation = evaluateWorkbook(workbook)
    const valueAt = (sheetId: string, address: string) => getCellValue(evaluation, sheetId, address)

    expect(findCells(workbook, 'a', options, valueAt)).toEqual([
      { sheetId: 'a', address: 'A1' },
      { sheetId: 'a', address: 'B2' }
    ])
    expect(findCells(workbook, 'b', { ...options, scope: 'workbook', wholeCell: true }, valueAt)).toEqual([
      { sheetId: 'b', address: 'A1' },
      { sheetId: 'a', address: 'B2' }
    ])
    expect(findCells(workbook, 'a', { ...options, query: 'SUMA', lookIn: 'formulas' }, valueAt)).toEqual([
      { sheetId: 'a', address: 'C1' }
    ])
    expect(findCells(workbook, 'a', { ...options, query: 'SUMA' }, valueAt)).toEqual([])
  })

  it('reemplaza sobre lo escrito y lo vuelve a interpretar', () => {
    expect(replaceInCell({ value: 'Zona Sur' }, options, 'Norte')).toEqual({ value: 'Zona Norte' })
    expect(
      replaceInCell({ formula: 'SUM(A1:A3)' }, { ...options, query: 'SUMA', lookIn: 'formulas' }, 'PROMEDIO')
    ).toEqual({ formula: 'AVERAGE(A1:A3)' })
    expect(replaceInCell({ value: 'x1' }, { ...options, query: 'x' }, '')).toEqual({ value: 1 })
    expect(replaceInCell({ value: 'Este' }, options, 'Norte')).toBeUndefined()
  })
})
