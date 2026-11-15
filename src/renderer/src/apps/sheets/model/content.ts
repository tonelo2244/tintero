import { parseCellAddress } from './address'
import type { Cell, Sheet, Workbook } from './types'

/**
 * Valida un libro leído de disco. Es la frontera de confianza: el archivo puede venir
 * dañado o editado a mano, así que comprobamos la forma antes de que lo vea el resto de la app.
 * Las celdas con una dirección inválida o sin nada útil se descartan en vez de romper la apertura.
 *
 * `_fileVersion` queda para futuras migraciones: .tsheet nació con la versión 2 del sobre.
 */
export function parseWorkbook(raw: unknown, _fileVersion: number): Workbook {
  const candidate = raw as Partial<Workbook> | null
  if (!candidate || !Array.isArray(candidate.sheets) || candidate.sheets.length === 0) {
    throw new Error('La hoja de cálculo está dañada o no tiene hojas.')
  }
  const sheets = candidate.sheets.map(parseSheet)
  const names = new Set(sheets.map((sheet) => sheet.name.toLowerCase()))
  if (names.size !== sheets.length) throw new Error('La hoja de cálculo tiene dos hojas con el mismo nombre.')
  const activeSheetId = sheets.some((sheet) => sheet.id === candidate.activeSheetId)
    ? candidate.activeSheetId!
    : sheets[0].id
  return { sheets, activeSheetId }
}

function parseSheet(raw: unknown, index: number): Sheet {
  const sheet = raw as Partial<Sheet> | null
  if (!sheet || typeof sheet.id !== 'string' || typeof sheet.name !== 'string') {
    throw new Error(`La hoja ${index + 1} está dañada.`)
  }
  const cells: Record<string, Cell> = {}
  for (const [address, cell] of Object.entries(sheet.cells ?? {})) {
    if (parseCellAddress(address) && isCell(cell)) cells[address.toUpperCase()] = cell
  }
  const columnWidths: Record<number, number> = {}
  for (const [col, width] of Object.entries(sheet.columnWidths ?? {})) {
    if (Number.isInteger(Number(col)) && typeof width === 'number' && width > 0) columnWidths[Number(col)] = width
  }
  return { id: sheet.id, name: sheet.name, cells, columnWidths }
}

function isCell(value: unknown): value is Cell {
  if (typeof value !== 'object' || value === null) return false
  const cell = value as Cell
  const validValue = cell.value === undefined || ['number', 'string', 'boolean'].includes(typeof cell.value)
  const validFormula = cell.formula === undefined || typeof cell.formula === 'string'
  const validStyle = cell.style === undefined || (typeof cell.style === 'object' && cell.style !== null)
  return validValue && validFormula && validStyle
}
