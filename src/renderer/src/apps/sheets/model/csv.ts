import type { ImportResult } from '@/core/appModule'
import { cellAddress, MAX_COLUMNS, MAX_ROWS, parseCellAddress } from './address'
import { evaluateWorkbook, getCellValue } from './calc'
import { detectDelimiter, parseDelimited, serializeDelimited } from './delimited'
import { createSheet, createWorkbook } from './factories'
import { dateToSerial, formatDate } from './format'
import { localizedError } from './formula/printer'
import { parseNumberText } from './input'
import type { Cell, CellValue, Sheet, Workbook } from './types'

/**
 * CSV: un formato sin tipos ni formato, solo texto. Decisiones:
 *
 * - Exportamos la hoja activa con los VALORES calculados (un CSV no tiene fórmulas), con el
 *   estándar RFC 4180: "," como separador y "." decimal. Es lo que leen pandas, bases de datos
 *   y Google Sheets. Añadimos el BOM UTF-8 para que Excel muestre bien las tildes.
 * - Al importar adivinamos el separador. Si es ";" (el CSV del Excel español), los números
 *   vienen con coma decimal; si es ",", con punto.
 * - Un campo que empieza por "=" se importa como TEXTO, no como fórmula: es la defensa contra la
 *   "inyección de CSV" (un archivo descargado que ejecuta fórmulas al abrirse).
 */

export function exportCsv(workbook: Workbook): Uint8Array {
  const sheet = workbook.sheets.find((candidate) => candidate.id === workbook.activeSheetId) ?? workbook.sheets[0]
  const evaluation = evaluateWorkbook(workbook)
  const { rows, cols } = usedSize(sheet)
  const lines: string[][] = []
  for (let row = 0; row < rows; row++) {
    const line: string[] = []
    for (let col = 0; col < cols; col++) {
      const address = cellAddress({ row, col })
      line.push(csvText(getCellValue(evaluation, sheet.id, address), sheet.cells[address]))
    }
    lines.push(line)
  }
  return new TextEncoder().encode('﻿' + serializeDelimited(lines, ',') + '\r\n')
}

function csvText(value: CellValue, cell: Cell | undefined): string {
  if (value === null) return ''
  if (typeof value === 'number') {
    // Las fechas en ISO (2026-11-15): es el único formato de fecha que nadie malinterpreta.
    if (cell?.style?.numberFormat?.kind === 'date') return formatDate(value).split('/').reverse().join('-')
    return String(Number(value.toPrecision(15)))
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'string') return value
  return localizedError(value.error)
}

/** Filas y columnas hasta la última celda con contenido. */
export function usedSize(sheet: Sheet): { rows: number; cols: number } {
  let rows = 0
  let cols = 0
  for (const [address, cell] of Object.entries(sheet.cells)) {
    if (cell.value === undefined && cell.formula === undefined) continue
    const coord = parseCellAddress(address)!
    rows = Math.max(rows, coord.row + 1)
    cols = Math.max(cols, coord.col + 1)
  }
  return { rows, cols }
}

export function importCsv(bytes: Uint8Array): ImportResult<Workbook> {
  const text = new TextDecoder('utf-8').decode(bytes)
  const delimiter = detectDelimiter(text)
  const decimal = delimiter === ';' ? ',' : '.'
  const rows = parseDelimited(text, delimiter)
  const warnings: string[] = []
  const cells: Record<string, Cell> = {}
  let clipped = false

  rows.forEach((row, rowIndex) => {
    row.forEach((field, colIndex) => {
      if (field === '') return
      if (rowIndex >= MAX_ROWS || colIndex >= MAX_COLUMNS) {
        clipped = true
        return
      }
      cells[cellAddress({ row: rowIndex, col: colIndex })] = csvCell(field, decimal)
    })
  })
  if (clipped) warnings.push(`los datos más allá de la fila ${MAX_ROWS} o la columna ZZ`)
  return { content: createWorkbook([createSheet('Hoja1', cells)]), warnings }
}

function csvCell(field: string, decimal: '.' | ','): Cell {
  const text = field.trim()
  const number =
    decimal === ',' ? parseNumberText(text) : /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text) ? Number(text) : null
  if (number !== null) return { value: number }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (iso) return { value: dateToSerial(+iso[1], +iso[2], +iso[3]), style: { numberFormat: { kind: 'date' } } }
  const upper = text.toUpperCase()
  if (upper === 'TRUE' || upper === 'VERDADERO') return { value: true }
  if (upper === 'FALSE' || upper === 'FALSO') return { value: false }
  return { value: field }
}
