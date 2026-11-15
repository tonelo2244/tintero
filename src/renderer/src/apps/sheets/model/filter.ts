import { cellAddress } from './address'
import { formatCellValue } from './format'
import type { CellValue, Sheet, SheetFilter } from './types'

/**
 * Autofiltro como vista: decide qué filas se ocultan, sin tocar los datos. Se filtra por el texto
 * tal y como se ve (con su formato), igual que la lista de casillas de Excel.
 */

/** Texto con el que aparece una celda vacía en la lista del filtro. */
export const BLANK_LABEL = '(Vacías)'

type ValueAt = (address: string) => CellValue

function displayText(sheet: Sheet, row: number, col: number, valueAt: ValueAt): string {
  const address = cellAddress({ row, col })
  const text = formatCellValue(valueAt(address), sheet.cells[address]?.style?.numberFormat)
  return text === '' ? BLANK_LABEL : text
}

/** Filas de datos (sin la cabecera) que el filtro oculta. */
export function hiddenRows(sheet: Sheet, valueAt: ValueAt): Set<number> {
  const hidden = new Set<number>()
  const filter = sheet.filter
  if (!filter) return hidden
  const active = Object.entries(filter.excluded)
    .filter(([, values]) => values.length > 0)
    .map(([col, values]) => ({ col: Number(col), values: new Set(values) }))
  if (active.length === 0) return hidden
  for (let row = filter.range.start.row + 1; row <= filter.range.end.row; row++) {
    if (active.some(({ col, values }) => values.has(displayText(sheet, row, col, valueAt)))) hidden.add(row)
  }
  return hidden
}

/**
 * Valores distintos de una columna, para la lista de casillas. Como en Excel, solo se ofrecen los
 * de las filas que siguen visibles por los filtros de OTRAS columnas (más los ya desmarcados aquí).
 */
export function filterChoices(sheet: Sheet, col: number, valueAt: ValueAt): string[] {
  const filter = sheet.filter
  if (!filter) return []
  const others: SheetFilter = { ...filter, excluded: { ...filter.excluded, [col]: [] } }
  const hiddenByOthers = hiddenRows({ ...sheet, filter: others }, valueAt)
  const values = new Set<string>(filter.excluded[col] ?? [])
  for (let row = filter.range.start.row + 1; row <= filter.range.end.row; row++) {
    if (!hiddenByOthers.has(row)) values.add(displayText(sheet, row, col, valueAt))
  }
  return [...values].sort((a, b) => {
    if (a === BLANK_LABEL || b === BLANK_LABEL) return a === BLANK_LABEL ? 1 : -1
    return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })
  })
}
