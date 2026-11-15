// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { evaluateWorkbook, getCellValue } from '../calc'
import { createSheet, createWorkbook } from '../factories'
import type { Workbook } from '../types'
import { exportXlsx } from './exportXlsx'
import { importXlsx } from './importXlsx'
import { fromExcelNumberFormat, toExcelNumberFormat } from './xlsxFormats'

function sampleWorkbook(): Workbook {
  const data = createSheet('Datos', {
    A1: { value: 'Producto', style: { bold: true, fill: '#d8eee1', borders: { bottom: true } } },
    B1: { value: 'Precio', style: { bold: true, align: 'right' } },
    A2: { value: 'Café' },
    B2: { value: 1.5, style: { numberFormat: { kind: 'currency', decimals: 2 } } },
    A3: { value: 'Té' },
    B3: { value: 2.25, style: { numberFormat: { kind: 'currency', decimals: 2 }, color: '#c0392b' } },
    B4: { formula: 'SUM(B2:B3)', style: { italic: true } },
    C1: { value: 46341, style: { numberFormat: { kind: 'date' } } },
    C2: { value: 0.215, style: { numberFormat: { kind: 'percent', decimals: 1 } } },
    D1: { formula: 'CONCAT("a",A2)' },
    D2: { formula: '1/0' },
    D3: { value: true }
  })
  data.columnWidths = { 0: 150 }
  data.merges = [{ start: { row: 5, col: 0 }, end: { row: 5, col: 2 } }]
  const summary = createSheet('Resumen 2026', { A1: { formula: 'Datos!B4*2' } })
  return createWorkbook([data, summary])
}

describe('formatos de número de Excel', () => {
  it('traduce en los dos sentidos', () => {
    expect(toExcelNumberFormat({ kind: 'currency', decimals: 2 })).toBe('#,##0.00 "€"')
    expect(toExcelNumberFormat({ kind: 'percent', decimals: 0 })).toBe('0%')
    expect(fromExcelNumberFormat('#,##0.00 "€"')).toEqual({ format: { kind: 'currency', decimals: 2 }, lossy: false })
    expect(fromExcelNumberFormat('#,##0.00\\ [$€-C0A]')).toEqual({
      format: { kind: 'currency', decimals: 2 },
      lossy: false
    })
    expect(fromExcelNumberFormat('0.0%')).toEqual({ format: { kind: 'percent', decimals: 1 }, lossy: false })
    expect(fromExcelNumberFormat('dd/mm/yyyy')).toEqual({ format: { kind: 'date' }, lossy: false })
    expect(fromExcelNumberFormat('mm-dd-yy')).toEqual({ format: { kind: 'date' }, lossy: true })
    expect(fromExcelNumberFormat('General')).toEqual({ lossy: false })
    expect(fromExcelNumberFormat('[Red]0.00;(0.00)').lossy).toBe(true)
  })
})

describe('exportar a .xlsx', () => {
  it('escribe valores, fórmulas con su resultado y formato', async () => {
    const bytes = await exportXlsx(sampleWorkbook())
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(bytes.buffer as ArrayBuffer)

    const data = book.getWorksheet('Datos')!
    expect(data.getCell('B4').value).toEqual({ formula: 'SUM(B2:B3)', result: 3.75 })
    expect(data.getCell('D1').formula).toBe('_xlfn.CONCAT("a",A2)')
    expect(data.getCell('D2').value).toEqual({ formula: '1/0', result: { error: '#DIV/0!' } })
    expect(data.getCell('A1').font.bold).toBe(true)
    expect(data.getCell('A1').fill).toMatchObject({ pattern: 'solid', fgColor: { argb: 'FFD8EEE1' } })
    expect(data.getCell('A1').border.bottom?.style).toBe('thin')
    expect(data.getCell('B2').numFmt).toBe('#,##0.00 "€"')
    expect(data.getCell('B3').font.color?.argb).toBe('FFC0392B')
    expect(data.getColumn(1).width).toBeCloseTo(20.71, 1)
    expect(book.getWorksheet('Resumen 2026')!.getCell('A1').value).toEqual({ formula: 'Datos!B4*2', result: 7.5 })
  })
})

describe('importar .xlsx', () => {
  it('ida y vuelta: lo exportado se vuelve a leer igual', async () => {
    const original = sampleWorkbook()
    const { content, warnings } = await importXlsx(await exportXlsx(original))
    expect(warnings).toEqual([])
    expect(content.sheets.map((sheet) => sheet.name)).toEqual(['Datos', 'Resumen 2026'])
    const [data] = content.sheets
    expect(data.cells.B4).toEqual({ formula: 'SUM(B2:B3)', style: { italic: true } })
    expect(data.cells.D1.formula).toBe('CONCAT("a",A2)')
    expect(data.cells.C1).toEqual({ value: 46341, style: { numberFormat: { kind: 'date' } } })
    expect(data.cells.A1.style).toEqual(original.sheets[0].cells.A1.style)
    expect(data.cells.B3.style).toEqual(original.sheets[0].cells.B3.style)
    expect(data.columnWidths[0]).toBe(150)
    expect(data.merges).toEqual(original.sheets[0].merges)
    const evaluation = evaluateWorkbook(content)
    expect(getCellValue(evaluation, content.sheets[1].id, 'A1')).toBe(7.5)
  })

  it('avisa de lo que no puede conservar', async () => {
    const book = new ExcelJS.Workbook()
    const sheet = book.addWorksheet('Hoja1')
    sheet.getCell('A1').value = { richText: [{ text: 'Hola ', font: { bold: true } }, { text: 'mundo' }] }
    sheet.getCell('A2').value = { formula: 'SUMPRODUCT(B1:B2,C1:C2)', result: 3 }
    sheet.getCell('A3').value = { formula: 'SUM(A:A)', result: 0 }
    sheet.getCell('A4').font = { name: 'Arial', size: 14 }
    sheet.getCell('A4').value = 5
    sheet.getCell('A5').font = { name: 'Calibri', size: 11 }
    sheet.getCell('A5').value = 6
    sheet.mergeCells('B5:C5')
    const { content, warnings } = await importXlsx(new Uint8Array(await book.xlsx.writeBuffer()))
    const cells = content.sheets[0].cells
    expect(cells.A1).toEqual({ value: 'Hola mundo' })
    expect(cells.A2).toEqual({ formula: 'SUMPRODUCT(B1:B2,C1:C2)' })
    expect(cells.A3).toEqual({ formula: 'SUM(A:A)' })
    expect(content.sheets[0].merges).toEqual([{ start: { row: 4, col: 1 }, end: { row: 4, col: 2 } }])
    // Arial 14 se conserva; Calibri 11 es la fuente normal del libro y no se guarda en la celda.
    expect(cells.A4).toEqual({ value: 5, style: { fontFamily: 'Arial', fontSize: 14 } })
    expect(cells.A5).toEqual({ value: 6 })
    expect(warnings).toEqual(
      expect.arrayContaining([
        'el formato dentro de una celda (se conserva el texto)',
        expect.stringMatching(/SUMPRODUCT/)
      ])
    )
    // Las columnas enteras (A:A) ya se entienden desde la fase 9: no hay aviso de sintaxis.
    expect(warnings.some((warning) => warning.includes('sintaxis'))).toBe(false)
  })
})

describe('fase 10: fuentes, altos, paneles y formato condicional', () => {
  it('ida y vuelta de lo que es de la hoja', async () => {
    const sheet = createSheet('Datos', {
      A1: { value: 'Título', style: { fontFamily: 'Georgia', fontSize: 16, bold: true } },
      A2: { value: 'Texto largo', style: { wrap: true } },
      B2: { value: 120 }
    })
    sheet.rowHeights = { 0: 40, 1: 60 }
    sheet.frozen = { rows: 1, cols: 1 }
    sheet.conditionalFormats = [
      {
        id: 'r1',
        range: { start: { row: 1, col: 1 }, end: { row: 5, col: 1 } },
        rule: { kind: 'greaterThan', value: 100 },
        style: { bold: true, fill: '#c6efce' }
      },
      {
        id: 'r2',
        range: { start: { row: 1, col: 1 }, end: { row: 5, col: 1 } },
        rule: { kind: 'between', min: 1, max: 9 }
      },
      {
        id: 'r3',
        range: { start: { row: 1, col: 0 }, end: { row: 5, col: 0 } },
        rule: { kind: 'textContains', text: 'urgente' },
        style: { color: '#c0392b' }
      },
      {
        id: 'r4',
        range: { start: { row: 1, col: 1 }, end: { row: 5, col: 1 } },
        rule: { kind: 'colorScale', minColor: '#ffffff', maxColor: '#63be7b' }
      }
    ]
    const { content, warnings } = await importXlsx(await exportXlsx(createWorkbook([sheet])))
    expect(warnings).toEqual([])
    const [read] = content.sheets
    expect(read.cells.A1.style).toEqual({ fontFamily: 'Georgia', fontSize: 16, bold: true })
    expect(read.cells.A2.style).toEqual({ wrap: true })
    expect(read.rowHeights).toEqual({ 0: 40, 1: 60 })
    expect(read.frozen).toEqual({ rows: 1, cols: 1 })
    expect(read.conditionalFormats?.map(({ range, rule, style }) => ({ range, rule, style }))).toEqual(
      sheet.conditionalFormats.map(({ range, rule, style }) => ({ range, rule, style }))
    )
  })
})

const fixture = (name: string) => new Uint8Array(readFileSync(resolve('fixtures/office', name)))

describe.each(['excel-formato.xlsx', 'libreoffice-formato.xlsx'])('corpus: %s', (name) => {
  it('conserva fuentes, alto de filas, paneles, ajuste y formato condicional', async () => {
    const { content, warnings } = await importXlsx(fixture(name))
    const [sheet] = content.sheets
    expect(sheet.cells.A1.style).toMatchObject({ fontFamily: 'Georgia', fontSize: 16, bold: true })
    // La fuente normal del libro no se copia a cada celda.
    expect(sheet.cells.A3.style?.fontFamily).toBeUndefined()
    expect(sheet.rowHeights?.[0]).toBe(40)
    expect(sheet.frozen).toEqual({ rows: 2, cols: 0 })
    expect(sheet.merges).toEqual([{ start: { row: 0, col: 0 }, end: { row: 0, col: 2 } }])
    expect(sheet.cells.C3.style?.wrap).toBe(true)
    const rules = sheet.conditionalFormats?.map((format) => format.rule)
    expect(rules).toEqual([
      { kind: 'greaterThan', value: 100 },
      { kind: 'colorScale', minColor: '#ffffff', maxColor: '#63be7b' }
    ])
    expect(sheet.conditionalFormats?.[0].style).toEqual({ bold: true, color: '#006100', fill: '#c6efce' })
    // La regla con fórmula (ISBLANK) no existe en Tintero: se avisa.
    expect(warnings).toContain('algunas reglas de formato condicional (Tintero tiene cinco tipos)')
  })
})
