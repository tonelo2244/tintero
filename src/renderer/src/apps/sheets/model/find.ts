import { cellAddress, parseCellAddress } from './address'
import { formatCellValue } from './format'
import { cellEditText, cellFromInput } from './input'
import type { Cell, CellValue, Workbook } from './types'

/**
 * Buscar y reemplazar en el libro.
 *   - "valores" busca en lo que se ve (el resultado de las fórmulas, con su formato);
 *   - "fórmulas" busca en lo que se escribió (=SUMA(A1:A3), tal y como sale en la barra).
 * Reemplazar siempre trabaja sobre lo escrito, como Excel: cambiar "SUMA" por "PROMEDIO" cambia
 * la fórmula, y el texto resultante vuelve a pasar por la misma interpretación que al teclearlo.
 */
export interface FindOptions {
  query: string
  matchCase: boolean
  /** La celda entera debe coincidir, no solo contener el texto. */
  wholeCell: boolean
  lookIn: 'values' | 'formulas'
  scope: 'sheet' | 'workbook'
}

export interface FoundCell {
  sheetId: string
  address: string
}

type ValueAt = (sheetId: string, address: string) => CellValue

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function pattern(options: FindOptions, global = false): RegExp {
  const body = escapeRegExp(options.query)
  return new RegExp(options.wholeCell ? `^${body}$` : body, `${options.matchCase ? '' : 'i'}${global ? 'g' : ''}`)
}

function searchableText(cell: Cell, value: CellValue, options: FindOptions): string {
  if (options.lookIn === 'formulas') return cellEditText(cell)
  return formatCellValue(value, cell.style?.numberFormat)
}

/** Coincidencias en orden de lectura: hoja activa primero (o solo ella), por filas y columnas. */
export function findCells(
  workbook: Workbook,
  activeSheetId: string,
  options: FindOptions,
  valueAt: ValueAt
): FoundCell[] {
  if (options.query === '') return []
  const regex = pattern(options)
  const sheets =
    options.scope === 'sheet'
      ? workbook.sheets.filter((sheet) => sheet.id === activeSheetId)
      : [...workbook.sheets].sort((a, b) => Number(b.id === activeSheetId) - Number(a.id === activeSheetId))
  const found: FoundCell[] = []
  for (const sheet of sheets) {
    const matches = Object.entries(sheet.cells)
      .filter(([address, cell]) => regex.test(searchableText(cell, valueAt(sheet.id, address), options)))
      .map(([address]) => ({ address, coord: parseCellAddress(address)! }))
      .sort((a, b) => a.coord.row - b.coord.row || a.coord.col - b.coord.col)
    for (const { coord } of matches) found.push({ sheetId: sheet.id, address: cellAddress(coord) })
  }
  return found
}

/**
 * La celda con el texto reemplazado (null = queda vacía), o undefined si no cambia nada.
 * El resultado se interpreta como si se tecleara: "=SUMA(...)" sigue siendo fórmula y "12" número.
 */
export function replaceInCell(cell: Cell, options: FindOptions, replacement: string): Cell | null | undefined {
  const text = cellEditText(cell)
  const next = text.replace(pattern(options, true), () => replacement)
  if (next === text) return undefined
  return cellFromInput(next, cell)
}
