import { describe, expect, it } from 'vitest'
import { cellAddress, columnIndex, columnName, parseCellAddress, rangeAddress } from './address'
import { changedCells, evaluateWorkbook, getCellValue, sheetValues, updateEvaluation } from './calc'
import { copyRange, fillRange, pasteCopiedCells, pasteText } from './clipboard'
import { parseWorkbook } from './content'
import { exportCsv, importCsv } from './csv'
import { parseDelimited, serializeDelimited } from './delimited'
import { createSheet, createWorkbook, nextSheetName, validateSheetName } from './factories'
import { formatCellValue, formatGeneralNumber } from './format'
import { cellEditText, cellFromInput, parseNumberText, parseUserInput } from './input'
import type { Cell, Workbook } from './types'
import { workbookReducer } from './workbookReducer'

function book(...sheets: [string, Record<string, Cell>][]): Workbook {
  const workbook = createWorkbook(sheets.map(([name, cells]) => createSheet(name, cells)))
  // Ids fijos para que los tests se lean mejor.
  workbook.sheets.forEach((sheet, index) => (sheet.id = `s${index + 1}`))
  workbook.activeSheetId = 's1'
  return workbook
}

const f = (formula: string): Cell => ({ formula })
const v = (value: Cell['value']): Cell => ({ value })

describe('direcciones', () => {
  it('convierte columnas en base 26 sin cero', () => {
    expect([0, 25, 26, 51, 701].map(columnName)).toEqual(['A', 'Z', 'AA', 'AZ', 'ZZ'])
    expect(['A', 'Z', 'AA', 'ZZ'].map(columnIndex)).toEqual([0, 25, 26, 701])
    expect(parseCellAddress('$C$10')).toEqual({ row: 9, col: 2 })
    expect(parseCellAddress('C0')).toBeNull()
    expect(cellAddress({ row: 0, col: 27 })).toBe('AB1')
    expect(rangeAddress({ start: { row: 0, col: 0 }, end: { row: 2, col: 1 } })).toBe('A1:B3')
  })
})

describe('motor de cálculo', () => {
  it('calcula fórmulas encadenadas y entre hojas', () => {
    const workbook = book(
      ['Hoja1', { A1: v(2), A2: f('A1*10'), A3: f('SUM(A1:A2)+Datos!B1') }],
      ['Datos', { B1: f('Hoja1!A1+1') }]
    )
    const evaluation = evaluateWorkbook(workbook)
    expect(sheetValues(evaluation, workbook.sheets[0])).toEqual({ A1: 2, A2: 20, A3: 25 })
    expect(getCellValue(evaluation, 's2', 'B1')).toBe(3)
    expect(getCellValue(evaluation, 's1', 'Z9')).toBeNull()
  })

  it('detecta referencias circulares sin colgarse', () => {
    const workbook = book(['Hoja1', { A1: f('B1'), B1: f('A1+1'), C1: f('C1'), D1: f('A1*2'), E1: v(1) }])
    const values = sheetValues(evaluateWorkbook(workbook), workbook.sheets[0])
    expect(values.A1).toEqual({ error: '#CIRC!' })
    expect(values.C1).toEqual({ error: '#CIRC!' })
    expect(values.D1).toEqual({ error: '#CIRC!' })
    expect(values.E1).toBe(1)
  })

  it('aguanta cadenas largas sin desbordar la pila', () => {
    const cells: Record<string, Cell> = { A1: v(1) }
    for (let row = 2; row <= 5000; row++) cells[`A${row}`] = f(`A${row - 1}+1`)
    const workbook = book(['Hoja1', cells])
    expect(getCellValue(evaluateWorkbook(workbook), 's1', 'A5000')).toBe(5000)
  })

  it('el recálculo incremental da lo mismo que calcular desde cero', () => {
    let workbook = book(
      ['Hoja1', { A1: v(1), A2: v(2), B1: f('SUM(A1:A10)'), C1: f('B1*2'), D1: f('Datos!A1') }],
      ['Datos', { A1: f('Hoja1!C1+1') }]
    )
    let evaluation = evaluateWorkbook(workbook)
    const edits: Record<string, Cell | null>[] = [{ A5: v(10) }, { A1: f('A2*3') }, { A2: null }, { C1: v('x') }]
    for (const cells of edits) {
      workbook = workbookReducer(workbook, { type: 'cells/set', sheetId: 's1', cells })
      evaluation = updateEvaluation(evaluation, workbook)
      const fresh = evaluateWorkbook(workbook)
      for (const sheet of workbook.sheets) expect(sheetValues(evaluation, sheet)).toEqual(sheetValues(fresh, sheet))
    }
    expect(getCellValue(evaluation, 's1', 'B1')).toBe(10)
    expect(getCellValue(evaluation, 's2', 'A1')).toEqual({ error: '#VALUE!' })
  })

  it('solo recalcula lo que cambia de contenido (el formato no cuenta)', () => {
    const before = book(['Hoja1', { A1: v(1), B1: f('A1') }])
    const styled = workbookReducer(before, {
      type: 'cells/style',
      sheetId: 's1',
      range: { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      style: { bold: true }
    })
    expect(changedCells(before, styled)).toEqual([])
    const renamed = workbookReducer(before, { type: 'sheet/rename', sheetId: 's1', name: 'Otra' })
    expect(changedCells(before, renamed)).toBe('all')
  })

  it('una hoja borrada deja las referencias en #¡REF!', () => {
    let workbook = book(['Hoja1', { A1: f('Datos!A1') }], ['Datos', { A1: v(5) }])
    workbook = workbookReducer(workbook, { type: 'sheet/delete', sheetId: 's2' })
    expect(getCellValue(evaluateWorkbook(workbook), 's1', 'A1')).toEqual({ error: '#REF!' })
  })
})

describe('reducer del libro', () => {
  it('añade, renombra (actualizando fórmulas) y borra hojas', () => {
    let workbook = book(['Hoja1', { A1: f('Hoja2!A1*2') }], ['Hoja2', { A1: v(1) }])
    expect(nextSheetName(workbook)).toBe('Hoja3')
    workbook = workbookReducer(workbook, { type: 'sheet/rename', sheetId: 's2', name: 'Precios 2026' })
    expect(workbook.sheets[0].cells.A1.formula).toBe("'Precios 2026'!A1*2")
    expect(getCellValue(evaluateWorkbook(workbook), 's1', 'A1')).toBe(2)

    // Nombre repetido o con caracteres prohibidos: no hace nada.
    expect(workbookReducer(workbook, { type: 'sheet/rename', sheetId: 's1', name: 'precios 2026' })).toBe(workbook)
    expect(validateSheetName(workbook, 'a/b')).toMatch(/no puede contener/)

    workbook = workbookReducer(workbook, { type: 'sheet/select', sheetId: 's2' })
    workbook = workbookReducer(workbook, { type: 'sheet/delete', sheetId: 's2' })
    expect(workbook.sheets.map((sheet) => sheet.id)).toEqual(['s1'])
    expect(workbook.activeSheetId).toBe('s1')
    expect(workbookReducer(workbook, { type: 'sheet/delete', sheetId: 's1' })).toBe(workbook)
  })

  it('aplica y quita formato sin perder el contenido, y borra contenido sin perder el formato', () => {
    const range = { start: { row: 0, col: 0 }, end: { row: 1, col: 0 } }
    let workbook = book(['Hoja1', { A1: v(1) }])
    workbook = workbookReducer(workbook, { type: 'cells/style', sheetId: 's1', range, style: { bold: true } })
    expect(workbook.sheets[0].cells).toEqual({ A1: { value: 1, style: { bold: true } }, A2: { style: { bold: true } } })
    workbook = workbookReducer(workbook, { type: 'cells/clear', sheetId: 's1', range })
    expect(workbook.sheets[0].cells).toEqual({ A1: { style: { bold: true } }, A2: { style: { bold: true } } })
    workbook = workbookReducer(workbook, { type: 'cells/style', sheetId: 's1', range, style: { bold: undefined } })
    expect(workbook.sheets[0].cells).toEqual({})
  })

  it('comparte las hojas que no cambian (structural sharing)', () => {
    const workbook = book(['Hoja1', {}], ['Hoja2', {}])
    const next = workbookReducer(workbook, { type: 'cells/set', sheetId: 's1', cells: { A1: v(1) } })
    expect(next.sheets[1]).toBe(workbook.sheets[1])
    expect(next.sheets[0]).not.toBe(workbook.sheets[0])
  })
})

describe('lo que escribe el usuario', () => {
  it('reconoce números en formato español e inglés', () => {
    expect(parseNumberText('1.234,5')).toBe(1234.5)
    expect(parseNumberText('3,5')).toBe(3.5)
    expect(parseNumberText('3.5')).toBe(3.5)
    expect(parseNumberText('1.234.567')).toBe(1234567)
    expect(parseNumberText('-1e3')).toBe(-1000)
    expect(parseNumberText('1,2,3')).toBeNull()
    expect(parseNumberText('abc')).toBeNull()
  })

  it('reconoce tipos y formatos al escribir', () => {
    expect(parseUserInput('=suma(A1;A2)')).toEqual({ kind: 'formula', formula: 'suma(A1;A2)' })
    expect(parseUserInput('12,5%')).toEqual({ kind: 'value', value: 0.125, format: { kind: 'percent', decimals: 1 } })
    expect(parseUserInput('12,50 €')).toEqual({ kind: 'value', value: 12.5, format: { kind: 'currency', decimals: 2 } })
    expect(parseUserInput('15/11/2026')).toEqual({ kind: 'value', value: 46341, format: { kind: 'date' } })
    expect(parseUserInput('31/02/2026')).toEqual({ kind: 'value', value: '31/02/2026' })
    expect(parseUserInput("'007")).toEqual({ kind: 'value', value: '007' })
    expect(parseUserInput('verdadero')).toEqual({ kind: 'value', value: true })
    expect(parseUserInput('  ')).toEqual({ kind: 'empty' })
  })

  it('guarda fórmulas en forma canónica y las enseña en español', () => {
    const cell = cellFromInput('=suma(A1:A2;1)', undefined)!
    expect(cell).toEqual({ formula: 'SUM(A1:A2,1)' })
    expect(cellEditText(cell)).toBe('=SUMA(A1:A2;1)')
    // Una fórmula que no se entiende se guarda tal cual en vez de perderse.
    expect(cellFromInput('=SUMA(1;', undefined)).toEqual({ formula: 'SUMA(1;' })
  })

  it('conserva el formato de la celda y el apóstrofo de los textos que parecen números', () => {
    const percent = cellFromInput('50%', { style: { bold: true } })!
    expect(percent).toEqual({ value: 0.5, style: { bold: true, numberFormat: { kind: 'percent', decimals: 0 } } })
    expect(cellEditText(percent)).toBe('50%')
    expect(cellFromInput('', { value: 3, style: { bold: true } })).toEqual({ style: { bold: true } })
    expect(cellFromInput('', { value: 3 })).toBeNull()
    expect(cellEditText({ value: '007' })).toBe("'007")
    expect(cellEditText({ value: 1234.5 })).toBe('1234,5')
  })
})

describe('formato de valores', () => {
  it('formatea como Excel en español', () => {
    expect(formatGeneralNumber(1234.5)).toBe('1234,5')
    expect(formatGeneralNumber(0.1 + 0.2)).toBe('0,3')
    expect(formatGeneralNumber(123456789012)).toBe('1,23457E+11')
    expect(formatCellValue(1234.5, { kind: 'number', decimals: 2 })).toBe('1.234,50')
    expect(formatCellValue(1234.5, { kind: 'currency', decimals: 2 })).toMatch(/^1\.234,50\s€$/)
    expect(formatCellValue(0.125, { kind: 'percent', decimals: 1 })).toMatch(/^12,5\s%$/)
    expect(formatCellValue(46341, { kind: 'date' })).toBe('15/11/2026')
    expect(formatCellValue({ error: '#DIV/0!' })).toBe('#¡DIV/0!')
    expect(formatCellValue(true)).toBe('VERDADERO')
  })
})

describe('portapapeles y relleno', () => {
  const workbook = book(['Hoja1', { A1: v(1), B1: f('A1*2'), A2: v('a\tb') }])
  const sheet = workbook.sheets[0]
  const range = { start: { row: 0, col: 0 }, end: { row: 1, col: 1 } }

  it('copia como TSV y pega moviendo las referencias', () => {
    const copied = copyRange(sheet, range, evaluateWorkbook(workbook))
    expect(copied.text).toBe('1\t2\n"a\tb"\t')
    const pasted = pasteCopiedCells(copied, { row: 4, col: 2 })
    expect(pasted).toEqual({ C5: v(1), D5: f('C5*2'), C6: v('a\tb'), D6: null })
  })

  it('interpreta el texto pegado desde otras aplicaciones', () => {
    expect(pasteText('1,5\t=A1\nhola\r\n', { row: 0, col: 0 }, sheet)).toEqual({
      A1: v(1.5),
      B1: f('A1'),
      A2: v('hola')
    })
  })

  it('rellena hacia abajo extendiendo la fórmula', () => {
    const fill = fillRange(sheet, { start: { row: 0, col: 1 }, end: { row: 3, col: 1 } }, 'down')
    expect(fill).toEqual({ B2: f('A2*2'), B3: f('A3*2'), B4: f('A4*2') })
  })
})

describe('texto delimitado y CSV', () => {
  it('lee y escribe campos con comillas, separadores y saltos de línea', () => {
    const rows = [
      ['a', 'b,c', 'd"e'],
      ['línea\n2', '', 'x']
    ]
    const text = serializeDelimited(rows, ',')
    expect(text).toBe('a,"b,c","d""e"\r\n"línea\n2",,x')
    expect(parseDelimited(text, ',')).toEqual(rows)
  })

  it('exporta la hoja activa con valores calculados', () => {
    const workbook = book([
      'Hoja1',
      { A1: v('Precio'), B1: v(1.5), B2: f('B1*2'), C2: { value: 46341, style: { numberFormat: { kind: 'date' } } } }
    ])
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(exportCsv(workbook))
    expect(text).toBe('﻿Precio,1.5,\r\n,3,2026-11-15\r\n')
  })

  it('importa el CSV del Excel español (punto y coma, coma decimal) sin ejecutar fórmulas', async () => {
    const bytes = new TextEncoder().encode('Nombre;Importe;Fecha\nAna;1.234,5;2026-11-15\n=1+1;"3;4";VERDADERO\n')
    const { content, warnings } = importCsv(bytes)
    const cells = content.sheets[0].cells
    expect(warnings).toEqual([])
    expect(cells.B2).toEqual({ value: 1234.5 })
    expect(cells.C2).toEqual({ value: 46341, style: { numberFormat: { kind: 'date' } } })
    expect(cells.A3).toEqual({ value: '=1+1' })
    expect(cells.B3).toEqual({ value: '3;4' })
    expect(cells.C3).toEqual({ value: true })
  })

  it('importa CSV con comas y punto decimal', () => {
    const { content } = importCsv(new TextEncoder().encode('a,1.234\n'))
    expect(content.sheets[0].cells.B1).toEqual({ value: 1.234 })
  })
})

describe('archivo .tsheet', () => {
  it('valida lo leído de disco y descarta celdas inválidas', () => {
    const workbook = parseWorkbook(
      {
        sheets: [{ id: 'a', name: 'Hoja1', cells: { A1: { value: 1 }, ZZZZ1: { value: 2 }, B1: { value: {} } } }],
        activeSheetId: 'nope'
      },
      2
    )
    expect(workbook.sheets[0].cells).toEqual({ A1: { value: 1 } })
    expect(workbook.activeSheetId).toBe('a')
    expect(() => parseWorkbook({ sheets: [] }, 2)).toThrow()
  })
})
