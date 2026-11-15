import { cellAddress, MAX_COLUMNS, MAX_ROWS } from './address'
import { getCellValue, type Evaluation } from './calc'
import { parseDelimited, serializeDelimited } from './delimited'
import { formatCellValue } from './format'
import { shiftFormula } from './formula/transform'
import { cellFromInput } from './input'
import type { Cell, CellCoord, CellRange, Sheet } from './types'

/**
 * Copiar y pegar. Guardamos dos versiones de lo copiado:
 *   - texto con tabuladores (TSV) en el portapapeles del sistema: es lo que entienden Excel,
 *     Google Sheets o un editor de texto al pegar;
 *   - las celdas completas (fórmulas y formato) en memoria, para pegar dentro de Tintero
 *     moviendo las referencias relativas como hace Excel.
 */
export interface CopiedCells {
  origin: CellCoord
  /** Celdas por fila y columna relativas al origen; undefined = celda vacía. */
  cells: (Cell | undefined)[][]
  /** El TSV que se puso en el portapapeles, para reconocer que el pegado viene de nosotros. */
  text: string
}

export function copyRange(sheet: Sheet, range: CellRange, evaluation: Evaluation): CopiedCells {
  const cells: (Cell | undefined)[][] = []
  const lines: string[][] = []
  for (let row = range.start.row; row <= range.end.row; row++) {
    const cellRow: (Cell | undefined)[] = []
    const line: string[] = []
    for (let col = range.start.col; col <= range.end.col; col++) {
      const address = cellAddress({ row, col })
      const cell = sheet.cells[address]
      cellRow.push(cell)
      line.push(formatCellValue(getCellValue(evaluation, sheet.id, address), cell?.style?.numberFormat))
    }
    cells.push(cellRow)
    lines.push(line)
  }
  return { origin: range.start, cells, text: serializeDelimited(lines, '\t', '\n') }
}

/** Celdas a escribir al pegar lo copiado en Tintero con la esquina en `target`. */
export function pasteCopiedCells(copied: CopiedCells, target: CellCoord): Record<string, Cell | null> {
  const rowOffset = target.row - copied.origin.row
  const colOffset = target.col - copied.origin.col
  const updates: Record<string, Cell | null> = {}
  copied.cells.forEach((cellRow, rowIndex) => {
    cellRow.forEach((cell, colIndex) => {
      const row = target.row + rowIndex
      const col = target.col + colIndex
      if (row >= MAX_ROWS || col >= MAX_COLUMNS) return
      const address = cellAddress({ row, col })
      if (!cell) {
        updates[address] = null
        return
      }
      updates[address] =
        cell.formula === undefined ? cell : { ...cell, formula: shiftFormula(cell.formula, rowOffset, colOffset) }
    })
  })
  return updates
}

/** Texto pegado desde otra aplicación: cada campo se interpreta como si el usuario lo escribiera. */
export function pasteText(text: string, target: CellCoord, sheet: Sheet): Record<string, Cell | null> {
  const rows = parseDelimited(text.replace(/\r?\n$/, ''), '\t')
  const updates: Record<string, Cell | null> = {}
  rows.forEach((fields, rowIndex) => {
    fields.forEach((field, colIndex) => {
      const row = target.row + rowIndex
      const col = target.col + colIndex
      if (row >= MAX_ROWS || col >= MAX_COLUMNS) return
      const address = cellAddress({ row, col })
      updates[address] = cellFromInput(field, sheet.cells[address])
    })
  })
  return updates
}

/**
 * "Rellenar hacia abajo/derecha" (Ctrl+D / Ctrl+R): copia la primera fila (o columna) del rango
 * en el resto, moviendo las referencias. Es la forma rápida de extender una fórmula.
 */
export function fillRange(sheet: Sheet, range: CellRange, direction: 'down' | 'right'): Record<string, Cell | null> {
  const updates: Record<string, Cell | null> = {}
  for (let row = range.start.row; row <= range.end.row; row++) {
    for (let col = range.start.col; col <= range.end.col; col++) {
      const sourceRow = direction === 'down' ? range.start.row : row
      const sourceCol = direction === 'right' ? range.start.col : col
      if (row === sourceRow && col === sourceCol) continue
      const source = sheet.cells[cellAddress({ row: sourceRow, col: sourceCol })]
      const address = cellAddress({ row, col })
      if (!source) {
        updates[address] = null
        continue
      }
      updates[address] =
        source.formula === undefined
          ? source
          : { ...source, formula: shiftFormula(source.formula, row - sourceRow, col - sourceCol) }
    }
  }
  return updates
}
