import { useMemo, useState, type ReactNode } from 'react'
import { cellAddress, columnName, parseCellAddress, rangeSize } from '../../model/address'
import { getCellValue, type Evaluation } from '../../model/calc'
import { filterChoices, hiddenRows as computeHiddenRows } from '../../model/filter'
import { findCells, replaceInCell, type FindOptions } from '../../model/find'
import { formatCellValue } from '../../model/format'
import { currentRegion } from '../../model/selection'
import { guessHasHeader, sortRange, type SortKey } from '../../model/sort'
import type { Cell, CellCoord, CellRange, Sheet, Workbook } from '../../model/types'
import { rangesOverlap, type WorkbookAction } from '../../model/workbookReducer'
import { FilterMenu } from './FilterMenu'
import { SheetFindBar } from './SheetFindBar'
import { SortDialog } from './SortDialog'

interface SheetDataOptions {
  workbook: Workbook
  sheet: Sheet
  evaluation: Evaluation
  range: CellRange
  anchor: CellCoord
  apply(action: WorkbookAction): void
  applyBatch(actions: WorkbookAction[]): void
  /** Ir a una celda, cambiando de hoja si hace falta. */
  goTo(sheetId: string, coord: CellCoord): void
  setNotice(message: string | null): void
  focusGrid(): void
}

const EMPTY_FIND: FindOptions = { query: '', matchCase: false, wholeCell: false, lookIn: 'values', scope: 'sheet' }

/**
 * Ordenar, filtrar y buscar/reemplazar en Hojas. Vive aparte de SheetsEditor para que el editor no
 * crezca sin control: aquí está el estado de los paneles y la traducción de clics a acciones; la
 * lógica (qué filas se ocultan, cómo se ordena, qué coincide) está en model/.
 */
export function useSheetData(options: SheetDataOptions) {
  const { workbook, sheet, evaluation, range, anchor, apply, setNotice, focusGrid } = options
  const valueAt = (address: string) => getCellValue(evaluation, sheet.id, address)

  const [sortDialog, setSortDialog] = useState<{ range: CellRange; hasHeader: boolean } | null>(null)
  const [filterMenu, setFilterMenu] = useState<{ col: number; anchor: DOMRect } | null>(null)
  const [find, setFind] = useState<{ mode: 'find' | 'replace'; request: number } | null>(null)
  const [findOptions, setFindOptions] = useState<FindOptions>(EMPTY_FIND)

  const hiddenRows = useMemo(
    () => computeHiddenRows(sheet, (address) => getCellValue(evaluation, sheet.id, address)),
    [sheet, evaluation]
  )

  /** Lo que se ordena: la selección si es un rango, el filtro si la celda está en él, o la región actual. */
  const sortTarget = (): CellRange | null => {
    const { rows, cols } = rangeSize(range)
    if (rows > 1 || cols > 1) return range
    if (sheet.filter && rangesOverlap(sheet.filter.range, range)) return sheet.filter.range
    return currentRegion(sheet, anchor)
  }

  const runSort = (target: CellRange, keys: SortKey[], hasHeader: boolean) => {
    if (sheet.merges?.some((merge) => rangesOverlap(merge, target))) {
      setNotice('No se puede ordenar un rango con celdas combinadas.')
      return
    }
    apply({ type: 'cells/set', sheetId: sheet.id, cells: sortRange(sheet, target, keys, hasHeader, valueAt) })
    focusGrid()
  }

  const isFilterHeader = (target: CellRange) =>
    sheet.filter !== undefined &&
    sheet.filter.range.start.row === target.start.row &&
    sheet.filter.range.start.col === target.start.col

  // ---------- Buscar ----------

  const matches = useMemo(
    () =>
      find
        ? findCells(workbook, sheet.id, findOptions, (sheetId, address) => getCellValue(evaluation, sheetId, address))
        : [],
    [find, workbook, sheet.id, findOptions, evaluation]
  )
  const currentMatch = matches.findIndex((match) => match.sheetId === sheet.id && match.address === cellAddress(anchor))

  const goToMatch = (direction: 1 | -1) => {
    if (matches.length === 0) return
    const index =
      currentMatch >= 0
        ? (currentMatch + direction + matches.length) % matches.length
        : direction === 1
          ? 0
          : matches.length - 1
    const match = matches[index]
    options.goTo(match.sheetId, parseCellAddress(match.address)!)
  }

  const replaceCurrent = (replacement: string) => {
    if (currentMatch < 0) {
      goToMatch(1)
      return
    }
    const match = matches[currentMatch]
    const target = workbook.sheets.find((candidate) => candidate.id === match.sheetId)!
    const next = replaceInCell(target.cells[match.address], findOptions, replacement)
    if (next !== undefined) apply({ type: 'cells/set', sheetId: match.sheetId, cells: { [match.address]: next } })
    goToMatch(1)
  }

  const replaceAll = (replacement: string) => {
    const bySheet = new Map<string, Record<string, Cell | null>>()
    for (const match of matches) {
      const target = workbook.sheets.find((candidate) => candidate.id === match.sheetId)!
      const next = replaceInCell(target.cells[match.address], findOptions, replacement)
      if (next === undefined) continue
      const cells = bySheet.get(match.sheetId) ?? {}
      cells[match.address] = next
      bySheet.set(match.sheetId, cells)
    }
    const count = [...bySheet.values()].reduce((total, cells) => total + Object.keys(cells).length, 0)
    // Un solo paso de deshacer para todo el reemplazo, aunque toque varias hojas.
    options.applyBatch([...bySheet].map(([sheetId, cells]) => ({ type: 'cells/set', sheetId, cells })))
    setNotice(
      count === 0
        ? 'No había nada que reemplazar.'
        : count === 1
          ? 'Se reemplazó 1 celda.'
          : `Se reemplazaron ${count} celdas.`
    )
  }

  // ---------- Comandos de la cinta ----------

  const commands = {
    sort: (descending: boolean) => {
      const target = sortTarget()
      if (!target) return
      const hasHeader = isFilterHeader(target) || guessHasHeader(target, valueAt)
      runSort(target, [{ col: anchor.col, descending }], hasHeader)
    },
    openSortDialog: () => {
      const target = sortTarget()
      if (target) setSortDialog({ range: target, hasHeader: isFilterHeader(target) || guessHasHeader(target, valueAt) })
    },
    toggleFilter: () => {
      if (sheet.filter) {
        apply({ type: 'filter/set', sheetId: sheet.id, filter: null })
        return
      }
      const { rows, cols } = rangeSize(range)
      const target = rows > 1 || cols > 1 ? range : currentRegion(sheet, anchor)
      if (!target || target.end.row === target.start.row) {
        setNotice('Selecciona una tabla con una fila de encabezados para filtrarla.')
        return
      }
      apply({ type: 'filter/set', sheetId: sheet.id, filter: { range: target, excluded: {} } })
      focusGrid()
    },
    clearFilters: () => {
      if (sheet.filter) apply({ type: 'filter/set', sheetId: sheet.id, filter: { ...sheet.filter, excluded: {} } })
    },
    openFind: (mode: 'find' | 'replace') => setFind((current) => ({ mode, request: (current?.request ?? 0) + 1 }))
  }

  // ---------- Lo que se pinta ----------

  const filter = sheet.filter
  const filterButtons = filter
    ? {
        row: filter.range.start.row,
        cols: Array.from(
          { length: filter.range.end.col - filter.range.start.col + 1 },
          (_, i) => filter.range.start.col + i
        ),
        active: new Set(
          Object.entries(filter.excluded)
            .filter(([, values]) => values.length > 0)
            .map(([col]) => Number(col))
        )
      }
    : null

  const headerLabel = (col: number, hasHeader: boolean, headerRow: number) => {
    const text = hasHeader ? formatCellValue(valueAt(cellAddress({ row: headerRow, col }))) : ''
    return text || `Columna ${columnName(col)}`
  }

  const overlays: ReactNode = (
    <>
      {sortDialog && (
        <SortDialog
          range={sortDialog.range}
          initialHasHeader={sortDialog.hasHeader}
          columnLabel={(col, hasHeader) => headerLabel(col, hasHeader, sortDialog.range.start.row)}
          onSort={(keys, hasHeader) => {
            runSort(sortDialog.range, keys, hasHeader)
            setSortDialog(null)
          }}
          onClose={() => {
            setSortDialog(null)
            focusGrid()
          }}
        />
      )}
      {filterMenu && filter && (
        <FilterMenu
          columnLabel={headerLabel(filterMenu.col, true, filter.range.start.row)}
          choices={filterChoices(sheet, filterMenu.col, valueAt)}
          excluded={filter.excluded[filterMenu.col] ?? []}
          anchor={filterMenu.anchor}
          onSort={(descending) => {
            runSort(filter.range, [{ col: filterMenu.col, descending }], true)
            setFilterMenu(null)
          }}
          onApply={(excluded) => {
            const next = { ...filter.excluded }
            if (excluded.length > 0) next[filterMenu.col] = excluded
            else delete next[filterMenu.col]
            apply({ type: 'filter/set', sheetId: sheet.id, filter: { ...filter, excluded: next } })
            setFilterMenu(null)
            focusGrid()
          }}
          onClose={() => setFilterMenu(null)}
        />
      )}
      {find && (
        <SheetFindBar
          mode={find.mode}
          openRequest={find.request}
          options={findOptions}
          current={currentMatch}
          total={matches.length}
          onOptionsChange={setFindOptions}
          onGo={goToMatch}
          onReplace={replaceCurrent}
          onReplaceAll={replaceAll}
          onClose={() => {
            setFind(null)
            focusGrid()
          }}
        />
      )}
    </>
  )

  return {
    hiddenRows,
    filterButtons,
    openFilterMenu: (col: number, anchorRect: DOMRect) => setFilterMenu({ col, anchor: anchorRect }),
    commands,
    overlays
  }
}
