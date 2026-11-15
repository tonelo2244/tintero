import { describe, expect, it } from 'vitest'
import { evaluateWorkbook, getCellValue } from './calc'
import { createSheet, createWorkbook } from './factories'
import { adjustFormulaForMove, adjustFormulaForStructure } from './formula/structure'
import { canInsert } from './structureEdit'
import type { Cell, Workbook } from './types'
import { workbookReducer } from './workbookReducer'

const here = { name: 'Hoja1', formulaIsOnSheet: true }
const elsewhere = { name: 'Hoja1', formulaIsOnSheet: false }

function book(cells: Record<string, Cell>, other: Record<string, Cell> = {}): Workbook {
  const workbook = createWorkbook([createSheet('Hoja1', cells), createSheet('Otra', other)])
  workbook.sheets[0].id = 's1'
  workbook.sheets[1].id = 's2'
  workbook.activeSheetId = 's1'
  return workbook
}

describe('insertar y borrar filas o columnas en las fórmulas', () => {
  const insertRows = { kind: 'insert', axis: 'rows', at: 2, count: 2 } as const
  const deleteRows = { kind: 'delete', axis: 'rows', at: 2, count: 2 } as const

  it('insertar filas mueve lo de debajo, absoluto o no, y agranda los rangos que cruza', () => {
    expect(adjustFormulaForStructure('A1+A3+$A$5', insertRows, here)).toBe('A1+A5+$A$7')
    expect(adjustFormulaForStructure('SUM(A1:A10)', insertRows, here)).toBe('SUM(A1:A12)')
    expect(adjustFormulaForStructure('SUM(A3:A4)', insertRows, here)).toBe('SUM(A5:A6)')
    // Las columnas enteras no cambian al insertar filas.
    expect(adjustFormulaForStructure('SUM(A:A)', insertRows, here)).toBe('SUM(A:A)')
  })

  it('borrar filas da #¡REF! a lo borrado y encoge los rangos', () => {
    expect(adjustFormulaForStructure('A3*2', deleteRows, here)).toBe('#REF!*2')
    expect(adjustFormulaForStructure('A6', deleteRows, here)).toBe('A4')
    expect(adjustFormulaForStructure('SUM(A1:A10)', deleteRows, here)).toBe('SUM(A1:A8)')
    expect(adjustFormulaForStructure('SUM(A2:A5)', deleteRows, here)).toBe('SUM(A2:A3)')
    expect(adjustFormulaForStructure('SUM(A3:A4)', deleteRows, here)).toBe('SUM(#REF!)')
  })

  it('solo toca las referencias a la hoja que cambia', () => {
    expect(adjustFormulaForStructure('A5+Hoja1!A5+Otra!A5', insertRows, elsewhere)).toBe('A5+Hoja1!A7+Otra!A5')
    expect(adjustFormulaForStructure('B1+D1', { kind: 'delete', axis: 'columns', at: 1, count: 1 }, here)).toBe(
      '#REF!+C1'
    )
  })

  it('el reducer recoloca celdas, anchos y fórmulas de todo el libro', () => {
    const workbook = book(
      { A1: { value: 1 }, A2: { value: 2 }, A3: { formula: 'SUM(A1:A2)' }, C1: { value: 'x' } },
      { A1: { formula: 'Hoja1!A3*10' } }
    )
    workbook.sheets[0].columnWidths = { 2: 150 }
    const inserted = workbookReducer(workbook, {
      type: 'structure/change',
      sheetId: 's1',
      change: { kind: 'insert', axis: 'rows', at: 1, count: 1 }
    })
    expect(inserted.sheets[0].cells).toEqual({
      A1: { value: 1 },
      A3: { value: 2 },
      A4: { formula: 'SUM(A1:A3)' },
      C1: { value: 'x' }
    })
    expect(inserted.sheets[1].cells.A1).toEqual({ formula: 'Hoja1!A4*10' })
    expect(getCellValue(evaluateWorkbook(inserted), 's2', 'A1')).toBe(30)

    const withoutColumn = workbookReducer(workbook, {
      type: 'structure/change',
      sheetId: 's1',
      change: { kind: 'delete', axis: 'columns', at: 1, count: 1 }
    })
    expect(withoutColumn.sheets[0].cells.B1).toEqual({ value: 'x' })
    expect(withoutColumn.sheets[0].columnWidths).toEqual({ 1: 150 })
  })

  it('no inserta si empujaría datos fuera de la hoja', () => {
    const workbook = book({ A10000: { value: 1 } })
    const change = { kind: 'insert', axis: 'rows', at: 0, count: 1 } as const
    expect(canInsert(workbook.sheets[0], change)).toBe(false)
    expect(workbookReducer(workbook, { type: 'structure/change', sheetId: 's1', change })).toBe(workbook)
  })
})

describe('cortar y pegar con fórmulas', () => {
  const source = { start: { row: 0, col: 0 }, end: { row: 1, col: 0 } } // A1:A2

  it('lo que apuntaba a lo movido lo sigue; los rangos solo si están enteros dentro', () => {
    const delta = { row: 0, col: 2 } // a C1:C2
    expect(adjustFormulaForMove('A1+A2', source, delta, here)).toBe('C1+C2')
    expect(adjustFormulaForMove('SUM(A1:A2)', source, delta, here)).toBe('SUM(C1:C2)')
    expect(adjustFormulaForMove('SUM(A1:A3)', source, delta, here)).toBe('SUM(A1:A3)')
    // C1 se sobrescribe al pegar: lo que la leía ya no tiene sentido.
    expect(adjustFormulaForMove('C1', source, delta, here)).toBe('#REF!')
  })

  it('el reducer mueve las celdas y actualiza el libro entero', () => {
    const workbook = book(
      { A1: { value: 5 }, A2: { formula: 'A1*2' }, B1: { formula: 'A2+1' }, C1: { value: 'se pisa' } },
      { A1: { formula: 'Hoja1!A1' } }
    )
    const moved = workbookReducer(workbook, {
      type: 'range/move',
      sheetId: 's1',
      source,
      target: { row: 0, col: 2 }
    })
    expect(moved.sheets[0].cells).toEqual({
      C1: { value: 5 },
      C2: { formula: 'C1*2' },
      B1: { formula: 'C2+1' }
    })
    expect(moved.sheets[1].cells.A1).toEqual({ formula: 'Hoja1!C1' })
    const evaluation = evaluateWorkbook(moved)
    expect(getCellValue(evaluation, 's1', 'B1')).toBe(11)
  })
})
