import { cellAddress, rangeContains } from './address'
import type { CellCoord, CellRange, Sheet } from './types'

/**
 * Celdas combinadas. Se guardan como una lista de rangos (Excel hace lo mismo en <mergeCells>);
 * para pintar la cuadrícula hace falta preguntar "¿esta celda está tapada?" muchas veces por
 * fotograma, así que `mergeIndex` construye un mapa dirección -> rango una vez por cambio.
 */
export type MergeIndex = ReadonlyMap<string, CellRange>

export function mergeIndex(sheet: Sheet): MergeIndex {
  const index = new Map<string, CellRange>()
  for (const merge of sheet.merges ?? []) {
    for (let row = merge.start.row; row <= merge.end.row; row++) {
      for (let col = merge.start.col; col <= merge.end.col; col++) index.set(cellAddress({ row, col }), merge)
    }
  }
  return index
}

export function mergeAt(sheet: Sheet, coord: CellCoord): CellRange | null {
  return sheet.merges?.find((merge) => rangeContains(merge, coord)) ?? null
}

/** Agranda un rango hasta que no corte ninguna combinada por la mitad (como la selección de Excel). */
export function expandToMerges(range: CellRange, sheet: Sheet): CellRange {
  let current = range
  for (let changed = true; changed;) {
    changed = false
    for (const merge of sheet.merges ?? []) {
      const overlaps =
        merge.start.row <= current.end.row &&
        current.start.row <= merge.end.row &&
        merge.start.col <= current.end.col &&
        current.start.col <= merge.end.col
      if (!overlaps) continue
      const next = {
        start: { row: Math.min(current.start.row, merge.start.row), col: Math.min(current.start.col, merge.start.col) },
        end: { row: Math.max(current.end.row, merge.end.row), col: Math.max(current.end.col, merge.end.col) }
      }
      if (
        next.start.row !== current.start.row ||
        next.start.col !== current.start.col ||
        next.end.row !== current.end.row ||
        next.end.col !== current.end.col
      ) {
        current = next
        changed = true
      }
    }
  }
  return current
}
