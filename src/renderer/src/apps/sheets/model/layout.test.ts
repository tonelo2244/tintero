import { describe, expect, it } from 'vitest'
import { parseWorkbook } from './content'
import { createSheet, createWorkbook } from './factories'
import { expandToMerges, mergeIndex } from './merges'
import type { Workbook } from './types'
import { workbookReducer } from './workbookReducer'

function book(): Workbook {
  const workbook = createWorkbook([
    createSheet('Hoja1', {
      A1: { value: 'Título' },
      B1: { value: 'se pierde', style: { bold: true } },
      A3: { value: 1 }
    })
  ])
  workbook.sheets[0].id = 's1'
  workbook.activeSheetId = 's1'
  return workbook
}

const range = (r1: number, c1: number, r2: number, c2: number) => ({
  start: { row: r1, col: c1 },
  end: { row: r2, col: c2 }
})

describe('celdas combinadas', () => {
  it('combinar conserva solo la esquina (el formato del resto se queda) y separar lo deshace', () => {
    const merged = workbookReducer(book(), { type: 'cells/merge', sheetId: 's1', range: range(0, 0, 0, 2) })
    expect(merged.sheets[0].merges).toEqual([range(0, 0, 0, 2)])
    expect(merged.sheets[0].cells.A1).toEqual({ value: 'Título' })
    expect(merged.sheets[0].cells.B1).toEqual({ style: { bold: true } })
    const split = workbookReducer(merged, { type: 'cells/unmerge', sheetId: 's1', range: range(0, 1, 0, 1) })
    expect(split.sheets[0].merges).toBeUndefined()
  })

  it('una combinada nueva sustituye a las que pisa', () => {
    let workbook = workbookReducer(book(), { type: 'cells/merge', sheetId: 's1', range: range(0, 0, 0, 1) })
    workbook = workbookReducer(workbook, { type: 'cells/merge', sheetId: 's1', range: range(0, 1, 1, 2) })
    expect(workbook.sheets[0].merges).toEqual([range(0, 1, 1, 2)])
  })

  it('se mueven al insertar filas y se deshacen si quedan en una celda', () => {
    let workbook = workbookReducer(book(), { type: 'cells/merge', sheetId: 's1', range: range(2, 0, 3, 0) })
    workbook = workbookReducer(workbook, {
      type: 'structure/change',
      sheetId: 's1',
      change: { kind: 'insert', axis: 'rows', at: 0, count: 2 }
    })
    expect(workbook.sheets[0].merges).toEqual([range(4, 0, 5, 0)])
    workbook = workbookReducer(workbook, {
      type: 'structure/change',
      sheetId: 's1',
      change: { kind: 'delete', axis: 'rows', at: 5, count: 1 }
    })
    expect(workbook.sheets[0].merges).toEqual([])
  })

  it('la selección se agranda hasta no cortar ninguna combinada', () => {
    const sheet = { ...createSheet('x'), merges: [range(1, 1, 2, 3)] }
    expect(expandToMerges(range(0, 0, 1, 1), sheet)).toEqual(range(0, 0, 2, 3))
    expect(mergeIndex(sheet).get('D3')).toEqual(range(1, 1, 2, 3))
  })
})

describe('alto de fila e inmovilizar', () => {
  it('cambia el alto de varias filas y vuelve al de por defecto con null', () => {
    let workbook = workbookReducer(book(), { type: 'rows/resize', sheetId: 's1', rows: [0, 1], height: 40 })
    expect(workbook.sheets[0].rowHeights).toEqual({ 0: 40, 1: 40 })
    workbook = workbookReducer(workbook, { type: 'rows/resize', sheetId: 's1', rows: [0, 1], height: null })
    expect(workbook.sheets[0].rowHeights).toBeUndefined()
  })

  it('inmoviliza y moviliza', () => {
    const frozen = workbookReducer(book(), { type: 'view/freeze', sheetId: 's1', rows: 1, cols: 0 })
    expect(frozen.sheets[0].frozen).toEqual({ rows: 1, cols: 0 })
    expect(workbookReducer(frozen, { type: 'view/freeze', sheetId: 's1', rows: 0, cols: 0 }).sheets[0].frozen).toBe(
      undefined
    )
  })

  it('los .tsheet sin estas partes se abren igual, y las dañadas se ignoran', () => {
    const raw = {
      activeSheetId: 's1',
      sheets: [
        {
          id: 's1',
          name: 'Hoja1',
          cells: {},
          columnWidths: {},
          rowHeights: { 2: 40, 3: 0, x: 5 },
          frozen: { rows: 1, cols: 0 },
          merges: [range(0, 0, 0, 2), { start: { row: -1, col: 0 }, end: { row: 0, col: 0 } }],
          charts: [{ id: 'c', kind: 'radar', source: range(0, 0, 1, 1), x: 0, y: 0, width: 1, height: 1 }]
        }
      ]
    }
    const sheet = parseWorkbook(raw, 2).sheets[0]
    expect(sheet.rowHeights).toEqual({ 2: 40, 3: 0 })
    expect(sheet.frozen).toEqual({ rows: 1, cols: 0 })
    expect(sheet.merges).toEqual([range(0, 0, 0, 2)])
    expect(sheet.charts).toBeUndefined()
    const old = parseWorkbook({ activeSheetId: 's1', sheets: [{ id: 's1', name: 'Hoja1', cells: {} }] }, 2)
    expect(Object.keys(old.sheets[0])).toEqual(['id', 'name', 'cells', 'columnWidths'])
  })
})
