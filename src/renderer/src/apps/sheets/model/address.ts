import type { CellCoord, CellRange } from './types'

/** Tamaño de la cuadrícula: 10.000 filas y columnas de la A a la ZZ. */
export const MAX_ROWS = 10_000
export const MAX_COLUMNS = 702

/** 0 -> "A", 25 -> "Z", 26 -> "AA". Las columnas son un sistema en base 26 sin cero. */
export function columnName(col: number): string {
  let name = ''
  let rest = col + 1
  while (rest > 0) {
    const digit = (rest - 1) % 26
    name = String.fromCharCode(65 + digit) + name
    rest = Math.floor((rest - 1) / 26)
  }
  return name
}

/** "A" -> 0, "AA" -> 26. Devuelve -1 si no son solo letras. */
export function columnIndex(name: string): number {
  if (!/^[A-Za-z]+$/.test(name)) return -1
  let index = 0
  for (const char of name.toUpperCase()) index = index * 26 + (char.charCodeAt(0) - 64)
  return index - 1
}

/** { row: 2, col: 1 } -> "B3" */
export function cellAddress(coord: CellCoord): string {
  return `${columnName(coord.col)}${coord.row + 1}`
}

/** "B3" (o "$B$3") -> { row: 2, col: 1 }. null si no es una dirección válida. */
export function parseCellAddress(address: string): CellCoord | null {
  const match = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(address.trim())
  if (!match) return null
  const row = Number(match[2]) - 1
  const col = columnIndex(match[1])
  if (row < 0 || col < 0) return null
  return { row, col }
}

/** Rango de dos esquinas cualesquiera, con start arriba a la izquierda. */
export function normalizeRange(a: CellCoord, b: CellCoord): CellRange {
  return {
    start: { row: Math.min(a.row, b.row), col: Math.min(a.col, b.col) },
    end: { row: Math.max(a.row, b.row), col: Math.max(a.col, b.col) }
  }
}

/** "A1:C3", o "B2" si el rango es una sola celda. */
export function rangeAddress(range: CellRange): string {
  const start = cellAddress(range.start)
  const end = cellAddress(range.end)
  return start === end ? start : `${start}:${end}`
}

export function rangeContains(range: CellRange, coord: CellCoord): boolean {
  return (
    coord.row >= range.start.row &&
    coord.row <= range.end.row &&
    coord.col >= range.start.col &&
    coord.col <= range.end.col
  )
}

export function rangeSize(range: CellRange): { rows: number; cols: number } {
  return { rows: range.end.row - range.start.row + 1, cols: range.end.col - range.start.col + 1 }
}

/** Recorre todas las celdas de un rango, fila a fila. */
export function* rangeCoords(range: CellRange): Generator<CellCoord> {
  for (let row = range.start.row; row <= range.end.row; row++) {
    for (let col = range.start.col; col <= range.end.col; col++) yield { row, col }
  }
}
