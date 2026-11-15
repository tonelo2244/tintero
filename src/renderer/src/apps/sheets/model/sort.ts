import { cellAddress } from './address'
import { shiftFormula } from './formula/transform'
import { isError } from './formula/values'
import type { Cell, CellRange, CellValue, Sheet } from './types'

/**
 * Ordenar un rango por una o varias columnas, con el orden de Excel:
 *   ascendente: números < textos (sin distinguir mayúsculas) < lógicos < errores, y las vacías al final.
 *   descendente: lo mismo al revés, pero las vacías siguen al final (Excel nunca las sube).
 * Es estable: dos filas iguales en todas las claves conservan su orden relativo.
 *
 * Se ordenan filas enteras dentro del rango. Una fórmula que viaja a otra fila se ajusta como al
 * copiarla (sus referencias relativas se desplazan), que es lo que hace Excel.
 */
export interface SortKey {
  /** Índice de columna de la hoja (no relativo al rango). */
  col: number
  descending: boolean
}

function typeRank(value: CellValue): number {
  if (typeof value === 'number') return 0
  if (typeof value === 'string') return 1
  if (typeof value === 'boolean') return 2
  return 3 // error
}

export function compareForSort(a: CellValue, b: CellValue, descending: boolean): number {
  const aEmpty = a === null || a === ''
  const bEmpty = b === null || b === ''
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1
  let order = typeRank(a) - typeRank(b)
  if (order === 0) {
    if (typeof a === 'number' && typeof b === 'number') order = a - b
    else if (typeof a === 'string' && typeof b === 'string')
      order = a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true })
    else if (typeof a === 'boolean' && typeof b === 'boolean') order = Number(a) - Number(b)
    else if (isError(a) && isError(b)) order = 0
  }
  return descending ? -order : order
}

/**
 * Celdas a escribir para dejar el rango ordenado. Con `hasHeader`, la primera fila no se mueve.
 * `valueAt` da el valor visible (el calculado, si es una fórmula): se ordena por lo que se ve.
 */
export function sortRange(
  sheet: Sheet,
  range: CellRange,
  keys: SortKey[],
  hasHeader: boolean,
  valueAt: (address: string) => CellValue
): Record<string, Cell | null> {
  const firstRow = range.start.row + (hasHeader ? 1 : 0)
  const rows: number[] = []
  for (let row = firstRow; row <= range.end.row; row++) rows.push(row)

  const sorted = [...rows].sort((a, b) => {
    for (const key of keys) {
      const order = compareForSort(
        valueAt(cellAddress({ row: a, col: key.col })),
        valueAt(cellAddress({ row: b, col: key.col })),
        key.descending
      )
      if (order !== 0) return order
    }
    return a - b // Array.prototype.sort ya es estable, pero así queda escrito.
  })

  const updates: Record<string, Cell | null> = {}
  sorted.forEach((sourceRow, index) => {
    const targetRow = firstRow + index
    for (let col = range.start.col; col <= range.end.col; col++) {
      const cell = sheet.cells[cellAddress({ row: sourceRow, col })]
      const target = cellAddress({ row: targetRow, col })
      if (!cell) {
        updates[target] = null
        continue
      }
      updates[target] =
        cell.formula === undefined || sourceRow === targetRow
          ? cell
          : { ...cell, formula: shiftFormula(cell.formula, targetRow - sourceRow, 0) }
    }
  })
  return updates
}

/** ¿La primera fila parece una cabecera? Texto encima de una columna que debajo tiene números. */
export function guessHasHeader(range: CellRange, valueAt: (address: string) => CellValue): boolean {
  if (range.end.row === range.start.row) return false
  for (let col = range.start.col; col <= range.end.col; col++) {
    const top = valueAt(cellAddress({ row: range.start.row, col }))
    const below = valueAt(cellAddress({ row: range.start.row + 1, col }))
    if (typeof top === 'string' && top !== '' && typeof below !== 'string') return true
  }
  // Si toda la fila es texto y la de debajo también, Excel tampoco lo sabe: asumimos cabecera
  // cuando todas las celdas de la primera fila son texto no vacío.
  for (let col = range.start.col; col <= range.end.col; col++) {
    const top = valueAt(cellAddress({ row: range.start.row, col }))
    if (typeof top !== 'string' || top === '') return false
  }
  return true
}
