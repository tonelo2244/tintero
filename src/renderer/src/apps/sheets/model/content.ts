import { MAX_COLUMNS, MAX_ROWS, parseCellAddress } from './address'
import type {
  Cell,
  CellRange,
  ChartKind,
  ConditionalFormat,
  ConditionalRule,
  Sheet,
  SheetChart,
  SheetFilter,
  Workbook
} from './types'

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
  const result: Sheet = { id: sheet.id, name: sheet.name, cells, columnWidths: parseSizes(sheet.columnWidths) }

  // Partes opcionales de la fase 9: lo que no tenga la forma esperada se ignora, no rompe la apertura.
  const rowHeights = parseSizes(sheet.rowHeights, true)
  if (Object.keys(rowHeights).length > 0) result.rowHeights = rowHeights
  const frozen = sheet.frozen
  if (frozen && isIndex(frozen.rows, MAX_ROWS) && isIndex(frozen.cols, MAX_COLUMNS) && frozen.rows + frozen.cols > 0) {
    result.frozen = { rows: frozen.rows, cols: frozen.cols }
  }
  const merges = (Array.isArray(sheet.merges) ? sheet.merges : []).filter(isRange)
  if (merges.length > 0) result.merges = merges
  if (isFilter(sheet.filter)) result.filter = sheet.filter
  const charts = (Array.isArray(sheet.charts) ? sheet.charts : []).filter(isChart)
  if (charts.length > 0) result.charts = charts
  const formats = (Array.isArray(sheet.conditionalFormats) ? sheet.conditionalFormats : []).filter(isConditionalFormat)
  if (formats.length > 0) result.conditionalFormats = formats
  return result
}

/** Anchos de columna o altos de fila. Un alto 0 es válido: la fila está oculta. */
function parseSizes(raw: Record<number, number> | undefined, allowZero = false): Record<number, number> {
  const sizes: Record<number, number> = {}
  for (const [index, size] of Object.entries(raw ?? {})) {
    if (Number.isInteger(Number(index)) && typeof size === 'number' && (size > 0 || (allowZero && size === 0))) {
      sizes[Number(index)] = size
    }
  }
  return sizes
}

function isIndex(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < limit
}

function isRange(value: unknown): value is CellRange {
  const range = value as CellRange | null
  return (
    !!range &&
    isIndex(range.start?.row, MAX_ROWS) &&
    isIndex(range.start?.col, MAX_COLUMNS) &&
    isIndex(range.end?.row, MAX_ROWS) &&
    isIndex(range.end?.col, MAX_COLUMNS) &&
    range.start.row <= range.end.row &&
    range.start.col <= range.end.col
  )
}

function isFilter(value: unknown): value is SheetFilter {
  const filter = value as SheetFilter | null
  return (
    !!filter &&
    isRange(filter.range) &&
    typeof filter.excluded === 'object' &&
    filter.excluded !== null &&
    Object.values(filter.excluded).every(
      (list) => Array.isArray(list) && list.every((item) => typeof item === 'string')
    )
  )
}

const CHART_KINDS: ChartKind[] = ['bar', 'line', 'pie']

function isChart(value: unknown): value is SheetChart {
  const chart = value as SheetChart | null
  return (
    !!chart &&
    typeof chart.id === 'string' &&
    CHART_KINDS.includes(chart.kind) &&
    isRange(chart.source) &&
    [chart.x, chart.y, chart.width, chart.height].every((number) => typeof number === 'number' && number >= 0)
  )
}

function isConditionalFormat(value: unknown): value is ConditionalFormat {
  const format = value as ConditionalFormat | null
  return !!format && typeof format.id === 'string' && isRange(format.range) && isRule(format.rule)
}

function isRule(rule: ConditionalRule | undefined): boolean {
  switch (rule?.kind) {
    case 'greaterThan':
    case 'lessThan':
      return typeof rule.value === 'number'
    case 'between':
      return typeof rule.min === 'number' && typeof rule.max === 'number'
    case 'textContains':
      return typeof rule.text === 'string'
    case 'colorScale':
      return typeof rule.minColor === 'string' && typeof rule.maxColor === 'string'
    default:
      return false
  }
}

function isCell(value: unknown): value is Cell {
  if (typeof value !== 'object' || value === null) return false
  const cell = value as Cell
  const validValue = cell.value === undefined || ['number', 'string', 'boolean'].includes(typeof cell.value)
  const validFormula = cell.formula === undefined || typeof cell.formula === 'string'
  const validStyle = cell.style === undefined || (typeof cell.style === 'object' && cell.style !== null)
  return validValue && validFormula && validStyle
}
