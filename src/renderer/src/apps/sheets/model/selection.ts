import { MAX_COLUMNS, MAX_ROWS, cellAddress, normalizeRange, parseCellAddress, rangeContains } from './address'
import type { CellCoord, CellRange, Sheet } from './types'

/**
 * Selección de la cuadrícula. `anchor` es la celda activa (donde se escribe) y `focus` la
 * esquina contraria, la que mueven Mayús+flechas. Es el modelo de Excel.
 */
export interface Selection {
  anchor: CellCoord
  focus: CellCoord
}

export type Direction = 'up' | 'down' | 'left' | 'right'

const DELTAS: Record<Direction, CellCoord> = {
  up: { row: -1, col: 0 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
  right: { row: 0, col: 1 }
}

export function singleCell(coord: CellCoord): Selection {
  return { anchor: coord, focus: coord }
}

export function selectionRange(selection: Selection): CellRange {
  return normalizeRange(selection.anchor, selection.focus)
}

export function clampCoord(coord: CellCoord): CellCoord {
  return {
    row: Math.min(MAX_ROWS - 1, Math.max(0, coord.row)),
    col: Math.min(MAX_COLUMNS - 1, Math.max(0, coord.col))
  }
}

export function step(coord: CellCoord, direction: Direction, distance = 1): CellCoord {
  const delta = DELTAS[direction]
  return clampCoord({ row: coord.row + delta.row * distance, col: coord.col + delta.col * distance })
}

function hasContent(sheet: Sheet, coord: CellCoord): boolean {
  const cell = sheet.cells[cellAddress(coord)]
  return cell?.value !== undefined || cell?.formula !== undefined
}

/**
 * Ctrl+flecha de Excel: si estás en un bloque de datos, salta a su final; si no, a la siguiente
 * celda con datos; y si no hay ninguna, al borde de la hoja.
 */
export function jump(sheet: Sheet, from: CellCoord, direction: Direction): CellCoord {
  let current = from
  let next = step(current, direction)
  if (next.row === current.row && next.col === current.col) return current

  if (hasContent(sheet, current) && hasContent(sheet, next)) {
    while (hasContent(sheet, next)) {
      current = next
      next = step(current, direction)
      if (next.row === current.row && next.col === current.col) break
    }
    return current
  }

  // Buscamos la siguiente celda con datos entre las existentes, sin recorrer 10.000 filas vacías.
  const delta = DELTAS[direction]
  let best: CellCoord | null = null
  for (const address of Object.keys(sheet.cells)) {
    const coord = parseCellAddress(address)
    if (!coord || !hasContent(sheet, coord)) continue
    const sameLine = delta.row !== 0 ? coord.col === from.col : coord.row === from.row
    const distance = delta.row !== 0 ? (coord.row - from.row) * delta.row : (coord.col - from.col) * delta.col
    if (!sameLine || distance <= 0) continue
    const bestDistance = best
      ? delta.row !== 0
        ? (best.row - from.row) * delta.row
        : (best.col - from.col) * delta.col
      : Infinity
    if (distance < bestDistance) best = coord
  }
  if (best) return best
  return step(from, direction, Math.max(MAX_ROWS, MAX_COLUMNS))
}

/** Rectángulo que contiene todas las celdas con algo (contenido o formato). null si la hoja está vacía. */
export function usedRange(sheet: Sheet): CellRange | null {
  let range: CellRange | null = null
  for (const address of Object.keys(sheet.cells)) {
    const coord = parseCellAddress(address)
    if (!coord) continue
    range = range
      ? normalizeRange(
          { row: Math.min(range.start.row, coord.row), col: Math.min(range.start.col, coord.col) },
          { row: Math.max(range.end.row, coord.row), col: Math.max(range.end.col, coord.col) }
        )
      : { start: coord, end: coord }
  }
  return range
}

/** Suma, promedio y recuento de la selección, para la barra de estado (como Excel). */
export function selectionStats(
  sheet: Sheet,
  range: CellRange,
  valueAt: (address: string) => unknown
): { count: number; numericCount: number; sum: number } {
  let count = 0
  let numericCount = 0
  let sum = 0
  // Se recorren las celdas existentes, no el rango: seleccionar una columna entera no cuesta nada.
  for (const address of Object.keys(sheet.cells)) {
    const coord = parseCellAddress(address)
    if (!coord || !rangeContains(range, coord)) continue
    const value = valueAt(address)
    if (value === null || value === undefined) continue
    count++
    if (typeof value === 'number') {
      numericCount++
      sum += value
    }
  }
  return { count, numericCount, sum }
}

/**
 * Autosuma: el rango de números contiguos justo encima de la celda (o, si no hay, a su izquierda).
 * Es la misma heurística que Excel al pulsar Σ.
 */
export function autoSumRange(coord: CellCoord, valueAt: (coord: CellCoord) => unknown): CellRange | null {
  for (const direction of ['up', 'left'] as const) {
    let current = step(coord, direction)
    let last: CellCoord | null = null
    while ((current.row !== coord.row || current.col !== coord.col) && typeof valueAt(current) === 'number') {
      last = current
      const next = step(current, direction)
      if (next.row === current.row && next.col === current.col) break
      current = next
    }
    if (last) return normalizeRange(last, step(coord, direction))
  }
  return null
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

/**
 * "Región actual" de Excel (Ctrl+Mayús+*): el bloque de celdas con datos que rodea a `coord`,
 * creciendo mientras haya algo en la fila o columna de al lado. Es lo que se ordena o filtra
 * cuando el usuario solo tiene una celda seleccionada.
 */
export function currentRegion(sheet: Sheet, coord: CellCoord): CellRange | null {
  const filled = (row: number, col: number) =>
    row >= 0 && col >= 0 && row < MAX_ROWS && col < MAX_COLUMNS && hasContent(sheet, { row, col })
  let region: CellRange = { start: coord, end: coord }
  for (let grew = true; grew;) {
    grew = false
    const { start, end } = region
    const rowHas = (row: number) => {
      for (let col = start.col - 1; col <= end.col + 1; col++) if (filled(row, col)) return true
      return false
    }
    const colHas = (col: number) => {
      for (let row = start.row - 1; row <= end.row + 1; row++) if (filled(row, col)) return true
      return false
    }
    if (start.row > 0 && rowHas(start.row - 1)) region = { ...region, start: { ...region.start, row: start.row - 1 } }
    else if (end.row < MAX_ROWS - 1 && rowHas(end.row + 1))
      region = { ...region, end: { ...region.end, row: end.row + 1 } }
    else if (start.col > 0 && colHas(start.col - 1))
      region = { ...region, start: { ...region.start, col: start.col - 1 } }
    else if (end.col < MAX_COLUMNS - 1 && colHas(end.col + 1))
      region = { ...region, end: { ...region.end, col: end.col + 1 } }
    else continue
    grew = true
  }
  const single = region.start.row === region.end.row && region.start.col === region.end.col
  return single && !hasContent(sheet, coord) ? null : region
}
