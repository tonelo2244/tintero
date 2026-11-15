import { cellAddress, parseCellAddress, rangeContains, rangeCoords } from './address'
import { validateSheetName } from './factories'
import type { StructureChange } from './formula/structure'
import { renameSheetInFormula } from './formula/transform'
import { applyStructureChange, moveRange } from './structureEdit'
import type {
  Cell,
  CellBorders,
  CellCoord,
  CellRange,
  CellStyle,
  ConditionalFormat,
  Sheet,
  SheetChart,
  SheetFilter,
  Workbook
} from './types'

/**
 * Toda la edición del libro como funciones puras (estado, acción) -> estado nuevo,
 * igual que el reducer de Diapositivas. Se combina con core/history.ts para deshacer/rehacer.
 *
 * Inmutabilidad con "structural sharing": solo se copian la hoja y el mapa de celdas que cambian.
 * Las demás hojas son el mismo objeto, y el motor de cálculo lo aprovecha para saber qué recalcular.
 */
export type WorkbookAction =
  /** Escribe o borra (null) celdas. Es la acción de editar, pegar y rellenar. */
  | { type: 'cells/set'; sheetId: string; cells: Record<string, Cell | null> }
  /** Aplica formato a un rango. Una propiedad a undefined la quita. */
  | { type: 'cells/style'; sheetId: string; range: CellRange; style: Partial<CellStyle> }
  /** Bordes: en todas las celdas, solo el contorno del rango, solo abajo o ninguno. */
  | { type: 'cells/borders'; sheetId: string; range: CellRange; mode: BorderMode }
  /** Borra el contenido de un rango (Supr). Con `includeStyle`, también el formato. */
  | { type: 'cells/clear'; sheetId: string; range: CellRange; includeStyle?: boolean }
  | { type: 'column/resize'; sheetId: string; col: number; width: number }
  /** Alto de una o varias filas. null vuelve al alto por defecto. */
  | { type: 'rows/resize'; sheetId: string; rows: number[]; height: number | null }
  /** Inmovilizar las primeras filas y columnas. 0 y 0 quita la inmovilización. */
  | { type: 'view/freeze'; sheetId: string; rows: number; cols: number }
  /** Combinar un rango: solo se conserva el contenido de la esquina superior izquierda, como en Excel. */
  | { type: 'cells/merge'; sheetId: string; range: CellRange }
  /** Poner, cambiar o quitar (null) el autofiltro de la hoja. */
  | { type: 'filter/set'; sheetId: string; filter: SheetFilter | null }
  | { type: 'chart/add'; sheetId: string; chart: SheetChart }
  | { type: 'chart/update'; sheetId: string; chartId: string; patch: Partial<Omit<SheetChart, 'id'>> }
  | { type: 'chart/delete'; sheetId: string; chartId: string }
  /** Añade una regla de formato condicional (al principio: la última creada gana, como en Excel). */
  | { type: 'conditional/add'; sheetId: string; format: ConditionalFormat }
  /** Quita las reglas que toquen el rango. */
  | { type: 'conditional/clear'; sheetId: string; range: CellRange }
  /** Separar las combinadas que toquen el rango. */
  | { type: 'cells/unmerge'; sheetId: string; range: CellRange }
  /** Insertar o borrar filas o columnas. Las fórmulas de todo el libro se reescriben. */
  | { type: 'structure/change'; sheetId: string; change: StructureChange }
  /** Cortar y pegar: mueve el rango y las fórmulas que apuntaban a él lo siguen. */
  | { type: 'range/move'; sheetId: string; source: CellRange; target: CellCoord }
  | { type: 'sheet/add'; sheet: Sheet }
  | { type: 'sheet/rename'; sheetId: string; name: string }
  | { type: 'sheet/delete'; sheetId: string }
  | { type: 'sheet/select'; sheetId: string }

export type BorderMode = 'all' | 'outside' | 'bottom' | 'none'

export const MIN_COLUMN_WIDTH = 24

export function workbookReducer(state: Workbook, action: WorkbookAction): Workbook {
  switch (action.type) {
    case 'cells/set':
      return updateCells(state, action.sheetId, (cells) => {
        for (const [address, cell] of Object.entries(action.cells)) {
          if (cell && !isEmptyCell(cell)) cells[address] = cell
          else delete cells[address]
        }
      })
    case 'cells/style':
      return updateCells(state, action.sheetId, (cells) => {
        for (const coord of rangeCoords(action.range)) {
          const address = cellAddress(coord)
          const cell = applyStyle(cells[address] ?? {}, action.style)
          if (isEmptyCell(cell)) delete cells[address]
          else cells[address] = cell
        }
      })
    case 'cells/borders':
      return updateCells(state, action.sheetId, (cells) => {
        const { start, end } = action.range
        for (const coord of rangeCoords(action.range)) {
          const address = cellAddress(coord)
          const current = cells[address] ?? {}
          const edge = {
            top: coord.row === start.row,
            bottom: coord.row === end.row,
            left: coord.col === start.col,
            right: coord.col === end.col
          }
          const borders = bordersFor(action.mode, edge, current.style?.borders)
          if (borders === current.style?.borders) continue
          const cell = applyStyle(current, { borders })
          if (isEmptyCell(cell)) delete cells[address]
          else cells[address] = cell
        }
      })
    case 'cells/clear':
      return updateCells(state, action.sheetId, (cells) => {
        // Recorremos las celdas existentes, no el rango: borrar A1:ZZ10000 no debe mirar 7 millones de huecos.
        for (const address of Object.keys(cells)) {
          const coord = parseCellAddress(address)
          if (!coord || !rangeContains(action.range, coord)) continue
          const cell = cells[address]
          if (action.includeStyle || !cell.style) delete cells[address]
          else cells[address] = { style: cell.style }
        }
      })
    case 'column/resize':
      return updateSheet(state, action.sheetId, (sheet) => ({
        ...sheet,
        columnWidths: { ...sheet.columnWidths, [action.col]: Math.max(MIN_COLUMN_WIDTH, Math.round(action.width)) }
      }))
    case 'rows/resize':
      return updateSheet(state, action.sheetId, (sheet) => {
        const rowHeights = { ...sheet.rowHeights }
        for (const row of action.rows) {
          if (action.height === null) delete rowHeights[row]
          else rowHeights[row] = Math.max(0, Math.round(action.height))
        }
        const { rowHeights: _old, ...rest } = sheet
        return Object.keys(rowHeights).length > 0 ? { ...rest, rowHeights } : rest
      })
    case 'view/freeze':
      return updateSheet(state, action.sheetId, (sheet) => {
        const { frozen: _old, ...rest } = sheet
        if (action.rows <= 0 && action.cols <= 0) return sheet.frozen ? rest : sheet
        return { ...rest, frozen: { rows: Math.max(0, action.rows), cols: Math.max(0, action.cols) } }
      })
    case 'filter/set':
      return updateSheet(state, action.sheetId, (sheet) => {
        const { filter: _old, ...rest } = sheet
        return action.filter ? { ...rest, filter: action.filter } : rest
      })
    case 'chart/add':
      return updateSheet(state, action.sheetId, (sheet) => ({
        ...sheet,
        charts: [...(sheet.charts ?? []), action.chart]
      }))
    case 'chart/update':
      return updateSheet(state, action.sheetId, (sheet) => ({
        ...sheet,
        charts: (sheet.charts ?? []).map((chart) =>
          chart.id === action.chartId ? { ...chart, ...action.patch } : chart
        )
      }))
    case 'chart/delete':
      return updateSheet(state, action.sheetId, (sheet) =>
        withOptionalList(
          sheet,
          'charts',
          (sheet.charts ?? []).filter((chart) => chart.id !== action.chartId)
        )
      )
    case 'conditional/add':
      return updateSheet(state, action.sheetId, (sheet) => ({
        ...sheet,
        conditionalFormats: [action.format, ...(sheet.conditionalFormats ?? [])]
      }))
    case 'conditional/clear':
      return updateSheet(state, action.sheetId, (sheet) => {
        const formats = sheet.conditionalFormats ?? []
        const kept = formats.filter((format) => !rangesOverlap(format.range, action.range))
        return kept.length === formats.length ? sheet : withOptionalList(sheet, 'conditionalFormats', kept)
      })
    case 'cells/merge':
      return mergeCells(state, action.sheetId, action.range)
    case 'cells/unmerge':
      return updateSheet(state, action.sheetId, (sheet) => {
        const merges = (sheet.merges ?? []).filter((merge) => !rangesOverlap(merge, action.range))
        if (merges.length === (sheet.merges?.length ?? 0)) return sheet
        const { merges: _old, ...rest } = sheet
        return merges.length > 0 ? { ...rest, merges } : rest
      })
    case 'structure/change':
      return applyStructureChange(state, action.sheetId, action.change)
    case 'range/move':
      return moveRange(state, action.sheetId, action.source, action.target)
    case 'sheet/add':
      return { sheets: [...state.sheets, action.sheet], activeSheetId: action.sheet.id }
    case 'sheet/rename':
      return renameSheet(state, action.sheetId, action.name.trim())
    case 'sheet/delete': {
      // Siempre queda al menos una hoja. Las fórmulas que la nombraban pasan a dar #¡REF!.
      if (state.sheets.length <= 1) return state
      const index = state.sheets.findIndex((sheet) => sheet.id === action.sheetId)
      if (index < 0) return state
      const sheets = state.sheets.filter((sheet) => sheet.id !== action.sheetId)
      const activeSheetId =
        state.activeSheetId === action.sheetId ? sheets[Math.max(0, index - 1)].id : state.activeSheetId
      return { sheets, activeSheetId }
    }
    case 'sheet/select':
      if (state.activeSheetId === action.sheetId || !state.sheets.some((sheet) => sheet.id === action.sheetId)) {
        return state
      }
      return { ...state, activeSheetId: action.sheetId }
  }
}

/**
 * "Todos" y "ninguno" sustituyen los bordes de cada celda; "contorno" e "inferior" solo añaden
 * los lados que tocan el borde del rango y respetan el resto (así se combinan, como en Excel).
 */
function bordersFor(
  mode: BorderMode,
  edge: Required<CellBorders>,
  current: CellBorders | undefined
): CellBorders | undefined {
  switch (mode) {
    case 'all':
      return { top: true, right: true, bottom: true, left: true }
    case 'none':
      return undefined
    case 'outside': {
      if (!Object.values(edge).some(Boolean)) return current
      const borders = { ...current }
      for (const side of ['top', 'right', 'bottom', 'left'] as const) if (edge[side]) borders[side] = true
      return borders
    }
    case 'bottom':
      return edge.bottom ? { ...current, bottom: true } : current
  }
}

function isEmptyCell(cell: Cell): boolean {
  return cell.value === undefined && cell.formula === undefined && (!cell.style || Object.keys(cell.style).length === 0)
}

function applyStyle(cell: Cell, patch: Partial<CellStyle>): Cell {
  const style: CellStyle = { ...cell.style }
  for (const [key, value] of Object.entries(patch) as [keyof CellStyle, unknown][]) {
    if (value === undefined) delete style[key]
    else (style as Record<string, unknown>)[key] = value
  }
  const { style: _old, ...rest } = cell
  return Object.keys(style).length > 0 ? { ...rest, style } : rest
}

function updateSheet(state: Workbook, sheetId: string, update: (sheet: Sheet) => Sheet): Workbook {
  let changed = false
  const sheets = state.sheets.map((sheet) => {
    if (sheet.id !== sheetId) return sheet
    const next = update(sheet)
    changed = next !== sheet
    return next
  })
  return changed ? { ...state, sheets } : state
}

/**
 * Copia el mapa de celdas una vez, deja que `mutate` lo modifique y lo vuelve a congelar en el estado.
 * `alsoUpdate` permite cambiar a la vez otras partes de la hoja (p. ej. las combinadas).
 */
function updateCells(
  state: Workbook,
  sheetId: string,
  mutate: (cells: Record<string, Cell>) => void,
  alsoUpdate: (sheet: Sheet) => Sheet = (sheet) => sheet
): Workbook {
  return updateSheet(state, sheetId, (sheet) => {
    const cells = { ...sheet.cells }
    mutate(cells)
    return alsoUpdate({ ...sheet, cells })
  })
}

function renameSheet(state: Workbook, sheetId: string, name: string): Workbook {
  const sheet = state.sheets.find((candidate) => candidate.id === sheetId)
  if (!sheet || sheet.name === name || validateSheetName(state, name, sheetId)) return state
  const oldName = sheet.name
  const sheets = state.sheets.map((current) => {
    // Las fórmulas de todo el libro que nombraban la hoja se actualizan, como en Excel.
    let cells = current.cells
    for (const [address, cell] of Object.entries(current.cells)) {
      if (cell.formula === undefined) continue
      const formula = renameSheetInFormula(cell.formula, oldName, name)
      if (formula === cell.formula) continue
      if (cells === current.cells) cells = { ...current.cells }
      cells[address] = { ...cell, formula }
    }
    const renamed = current.id === sheetId ? { ...current, name } : current
    return cells === current.cells ? renamed : { ...renamed, cells }
  })
  return { ...state, sheets }
}

export function rangesOverlap(a: CellRange, b: CellRange): boolean {
  return a.start.row <= b.end.row && b.start.row <= a.end.row && a.start.col <= b.end.col && b.start.col <= a.end.col
}

function mergeCells(state: Workbook, sheetId: string, range: CellRange): Workbook {
  if (range.start.row === range.end.row && range.start.col === range.end.col) return state
  return updateCells(
    state,
    sheetId,
    (cells) => {
      // El contenido de las demás celdas se pierde (Excel avisa antes; el editor también).
      const anchor = cellAddress(range.start)
      for (const address of Object.keys(cells)) {
        const coord = parseCellAddress(address)
        if (!coord || address === anchor || !rangeContains(range, coord)) continue
        const { style } = cells[address]
        if (style) cells[address] = { style }
        else delete cells[address]
      }
    },
    (sheet) => ({
      ...sheet,
      merges: [...(sheet.merges ?? []).filter((merge) => !rangesOverlap(merge, range)), range]
    })
  )
}

/** Las listas opcionales de la hoja no se guardan vacías: una lista vacía desaparece del archivo. */
function withOptionalList<K extends 'charts' | 'conditionalFormats' | 'merges'>(
  sheet: Sheet,
  key: K,
  list: NonNullable<Sheet[K]>
): Sheet {
  const next = { ...sheet }
  if (list.length > 0) next[key] = list
  else delete next[key]
  return next
}
