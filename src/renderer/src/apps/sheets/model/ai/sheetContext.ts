import { cellAddress, columnName, rangeAddress } from '../address'
import { getCellValue, type Evaluation } from '../calc'
import { localizedError } from '../formula/printer'
import { usedRange } from '../selection'
import type { CellRange, CellValue, Sheet } from '../types'

/**
 * Qué ve el modelo de la hoja: las cabeceras y unas pocas filas, nunca la hoja entera.
 *
 * Tres razones: (1) a un modelo de 4-9B le sobra con ver la forma de los datos para escribir
 * =SUMAR.SI(A2:A48;">10";B2:B48); (2) una hoja de 10.000 filas no cabe en su contexto; y
 * (3) cuanto menos texto, antes responde. Lo que sí necesita saber es dónde acaban los datos
 * (la última fila), porque el motor no admite columnas enteras (B:B) y los rangos deben ser concretos.
 */
export const CONTEXT_LIMITS = { sampleRows: 5, maxColumns: 12, maxCellChars: 40 } as const

export interface SheetContext {
  /** Texto listo para el prompt. */
  text: string
  /** Zona con datos (null si la hoja está vacía). */
  dataRange: CellRange | null
}

export function describeSheet(sheet: Sheet, evaluation: Evaluation): SheetContext {
  const used = usedRange(sheet)
  if (!used) return { text: `Hoja "${sheet.name}": vacía.`, dataRange: null }

  const lastCol = Math.min(used.end.col, used.start.col + CONTEXT_LIMITS.maxColumns - 1)
  const columns = Array.from({ length: lastCol - used.start.col + 1 }, (_, index) => used.start.col + index)
  const totalRows = used.end.row - used.start.row + 1
  const shownRows = rowsToShow(used, CONTEXT_LIMITS.sampleRows)

  const valueAt = (row: number, col: number) => getCellValue(evaluation, sheet.id, cellAddress({ row, col }))
  const header = `| fila | ${columns.map(columnName).join(' | ')} |`
  const separator = `| ---- | ${columns.map(() => '---').join(' | ')} |`
  const lines = shownRows.map((row) =>
    row === null
      ? `| … | ${columns.map(() => '…').join(' | ')} |`
      : `| ${row + 1} | ${columns.map((col) => cellForPrompt(valueAt(row, col))).join(' | ')} |`
  )

  const text = [
    `Hoja "${sheet.name}". Datos en ${rangeAddress(used)} (${totalRows} filas; la primera suele ser de cabeceras).`,
    used.end.col > lastCol ? `Solo se muestran las columnas hasta ${columnName(lastCol)}.` : '',
    header,
    separator,
    ...lines
  ]
    .filter(Boolean)
    .join('\n')
  return { text, dataRange: used }
}

/** Las primeras filas y la última (para que el modelo sepa hasta dónde llegan los datos). */
function rowsToShow(range: CellRange, sample: number): (number | null)[] {
  const rows: (number | null)[] = []
  const firstBlockEnd = Math.min(range.end.row, range.start.row + sample)
  for (let row = range.start.row; row <= firstBlockEnd; row++) rows.push(row)
  if (range.end.row > firstBlockEnd) {
    if (range.end.row > firstBlockEnd + 1) rows.push(null)
    rows.push(range.end.row)
  }
  return rows
}

/** Texto entre comillas, números tal cual (con punto decimal, como en las fórmulas), vacío como nada. */
function cellForPrompt(value: CellValue): string {
  if (value === null) return ''
  if (typeof value === 'number') return String(Number(value.toPrecision(12)))
  if (typeof value === 'boolean') return value ? 'VERDADERO' : 'FALSO'
  if (typeof value === 'string') {
    const clipped =
      value.length > CONTEXT_LIMITS.maxCellChars ? `${value.slice(0, CONTEXT_LIMITS.maxCellChars)}…` : value
    return `"${clipped.replace(/\|/g, '/').replace(/\s+/g, ' ')}"`
  }
  return localizedError(value.error)
}
