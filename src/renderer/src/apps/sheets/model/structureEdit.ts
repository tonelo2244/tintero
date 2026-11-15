import { cellAddress, MAX_COLUMNS, MAX_ROWS, parseCellAddress } from './address'
import {
  adjustFormulaForMove,
  adjustFormulaForStructure,
  shiftIndex,
  type StructureChange,
  type TargetSheet
} from './formula/structure'
import type { Cell, CellCoord, CellRange, Sheet, Workbook } from './types'

/**
 * Cambios de estructura del libro: insertar o borrar filas o columnas, y mover un rango.
 * Son funciones puras que usa el reducer. Cada una hace tres cosas:
 *   1. recolocar las celdas de la hoja afectada,
 *   2. reescribir las fórmulas de TODO el libro que apuntaban a esa hoja,
 *   3. recolocar lo que cuelga de filas o columnas (anchos, altos, combinadas…).
 */

/** Recorre todas las fórmulas del libro y aplica `adjust`; solo copia las hojas que cambian. */
function adjustFormulas(
  workbook: Workbook,
  targetSheetId: string,
  adjust: (formula: string, target: TargetSheet) => string
): Workbook {
  const targetName = workbook.sheets.find((sheet) => sheet.id === targetSheetId)?.name ?? ''
  const sheets = workbook.sheets.map((sheet) => {
    const target: TargetSheet = { name: targetName, formulaIsOnSheet: sheet.id === targetSheetId }
    let cells = sheet.cells
    for (const [address, cell] of Object.entries(sheet.cells)) {
      if (cell.formula === undefined) continue
      const formula = adjust(cell.formula, target)
      if (formula === cell.formula) continue
      if (cells === sheet.cells) cells = { ...sheet.cells }
      cells[address] = { ...cell, formula }
    }
    return cells === sheet.cells ? sheet : { ...sheet, cells }
  })
  return sheets.every((sheet, index) => sheet === workbook.sheets[index]) ? workbook : { ...workbook, sheets }
}

function replaceSheet(workbook: Workbook, sheetId: string, update: (sheet: Sheet) => Sheet): Workbook {
  return { ...workbook, sheets: workbook.sheets.map((sheet) => (sheet.id === sheetId ? update(sheet) : sheet)) }
}

/** Mapa índice -> valor (anchos de columna, altos de fila) con los índices recolocados. */
export function shiftIndexedRecord<T>(record: Record<number, T>, change: StructureChange): Record<number, T> {
  const result: Record<number, T> = {}
  for (const [key, value] of Object.entries(record)) {
    const index = shiftIndex(Number(key), change)
    if (index !== null) result[index] = value
  }
  return result
}

/** Rango recolocado tras el cambio, o null si desaparece entero. */
export function shiftRange(range: CellRange, change: StructureChange): CellRange | null {
  const pick = (coord: CellCoord) => (change.axis === 'rows' ? coord.row : coord.col)
  const start = pick(range.start)
  const end = pick(range.end)
  let newStart: number | null
  let newEnd: number | null
  if (change.kind === 'insert') {
    newStart = shiftIndex(start, change)
    newEnd = shiftIndex(end, change) ?? (change.axis === 'rows' ? MAX_ROWS : MAX_COLUMNS) - 1
  } else {
    // Borrar un trozo del rango lo encoge; si se borra entero, desaparece.
    const deletedEnd = change.at + change.count - 1
    if (start >= change.at && end <= deletedEnd) return null
    newStart = start < change.at ? start : start > deletedEnd ? start - change.count : change.at
    newEnd = end < change.at ? end : end > deletedEnd ? end - change.count : change.at - 1
  }
  if (newStart === null) return null
  const set = (coord: CellCoord, index: number): CellCoord =>
    change.axis === 'rows' ? { ...coord, row: index } : { ...coord, col: index }
  return { start: set(range.start, newStart), end: set(range.end, newEnd) }
}

/**
 * ¿Se puede insertar sin perder datos? Como Excel, nos negamos si alguna celda con contenido
 * quedaría empujada fuera de la hoja (más allá de la fila 10.000 o la columna ZZ).
 */
export function canInsert(sheet: Sheet, change: StructureChange): boolean {
  if (change.kind !== 'insert') return true
  for (const address of Object.keys(sheet.cells)) {
    const coord = parseCellAddress(address)!
    const index = change.axis === 'rows' ? coord.row : coord.col
    if (shiftIndex(index, change) === null) return false
  }
  return true
}

/** Lo que cuelga de filas y columnas, recolocado. Las fases siguientes añaden aquí lo suyo. */
function shiftSheetLayout(sheet: Sheet, change: StructureChange): Sheet {
  return {
    ...sheet,
    ...(change.axis === 'columns' ? { columnWidths: shiftIndexedRecord(sheet.columnWidths, change) } : {})
  }
}

export function applyStructureChange(workbook: Workbook, sheetId: string, change: StructureChange): Workbook {
  const sheet = workbook.sheets.find((candidate) => candidate.id === sheetId)
  if (!sheet || change.count <= 0 || !canInsert(sheet, change)) return workbook

  // 1 y 2: primero se reescriben las fórmulas (con las direcciones antiguas) y luego se recolocan.
  const adjusted = adjustFormulas(workbook, sheetId, (formula, target) =>
    adjustFormulaForStructure(formula, change, target)
  )
  return replaceSheet(adjusted, sheetId, (current) => {
    const cells: Record<string, Cell> = {}
    for (const [address, cell] of Object.entries(current.cells)) {
      const coord = parseCellAddress(address)!
      const index = shiftIndex(change.axis === 'rows' ? coord.row : coord.col, change)
      if (index === null) continue
      cells[cellAddress(change.axis === 'rows' ? { ...coord, row: index } : { ...coord, col: index })] = cell
    }
    return shiftSheetLayout({ ...current, cells }, change)
  })
}

/**
 * Cortar y pegar dentro de una hoja: las celdas de `source` pasan a `target` (su esquina superior
 * izquierda) y las fórmulas de todo el libro que apuntaban a ellas las siguen.
 */
export function moveRange(workbook: Workbook, sheetId: string, source: CellRange, target: CellCoord): Workbook {
  const delta = { row: target.row - source.start.row, col: target.col - source.start.col }
  if (delta.row === 0 && delta.col === 0) return workbook
  const sheet = workbook.sheets.find((candidate) => candidate.id === sheetId)
  const fits =
    target.row >= 0 &&
    target.col >= 0 &&
    source.end.row + delta.row < MAX_ROWS &&
    source.end.col + delta.col < MAX_COLUMNS
  if (!sheet || !fits) return workbook

  const adjusted = adjustFormulas(workbook, sheetId, (formula, targetSheet) =>
    adjustFormulaForMove(formula, source, delta, targetSheet)
  )
  return replaceSheet(adjusted, sheetId, (current) => {
    const cells = { ...current.cells }
    const moving: [string, Cell][] = []
    for (const [address, cell] of Object.entries(current.cells)) {
      const coord = parseCellAddress(address)!
      const inSource =
        coord.row >= source.start.row &&
        coord.row <= source.end.row &&
        coord.col >= source.start.col &&
        coord.col <= source.end.col
      if (!inSource) continue
      moving.push([cellAddress({ row: coord.row + delta.row, col: coord.col + delta.col }), cell])
      delete cells[address]
    }
    // El destino se vacía entero (también lo que no recibe nada) y luego llegan las celdas movidas.
    for (let row = source.start.row; row <= source.end.row; row++) {
      for (let col = source.start.col; col <= source.end.col; col++) {
        delete cells[cellAddress({ row: row + delta.row, col: col + delta.col })]
      }
    }
    for (const [address, cell] of moving) cells[address] = cell
    return { ...current, cells }
  })
}
