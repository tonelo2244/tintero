import { useMemo, useState } from 'react'
import { createId } from '@/core/ids'
import { rangeSize } from '../../model/address'
import { currentRegion } from '../../model/selection'
import type { CellCoord, CellRange, CellValue, ChartKind, Sheet } from '../../model/types'
import type { WorkbookAction } from '../../model/workbookReducer'
import { columnMetrics, rowMetrics } from '../gridMetrics'
import { ChartLayer } from './ChartLayer'

interface Options {
  sheet: Sheet
  range: CellRange
  anchor: CellCoord
  valueAt(address: string): CellValue
  apply(action: WorkbookAction): void
  setNotice(message: string | null): void
}

const NO_ROWS: ReadonlySet<number> = new Set()

/** Gráficos de la hoja: insertar desde la selección, seleccionar, mover, cambiar y borrar. */
export function useCharts({ sheet, range, anchor, valueAt, apply, setNotice }: Options) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const columns = useMemo(() => columnMetrics(sheet.columnWidths), [sheet.columnWidths])
  const rows = useMemo(() => rowMetrics(sheet.rowHeights, NO_ROWS), [sheet.rowHeights])
  const selected = sheet.charts?.find((chart) => chart.id === selectedId) ? selectedId : null

  const insertChart = (kind: ChartKind) => {
    const { rows: height, cols: width } = rangeSize(range)
    const source = height > 1 || width > 1 ? range : currentRegion(sheet, anchor)
    if (!source) {
      setNotice('Selecciona los datos del gráfico (por ejemplo, una columna de nombres y otra de números).')
      return
    }
    // Al lado de los datos, como hace Excel, con un tamaño razonable.
    const id = createId('chart')
    apply({
      type: 'chart/add',
      sheetId: sheet.id,
      chart: {
        id,
        kind,
        source,
        x: columns.offsets[source.end.col + 1] + 16,
        y: rows.offsets[source.start.row],
        width: 420,
        height: 260
      }
    })
    setSelectedId(id)
  }

  const layer = (
    <ChartLayer
      sheet={sheet}
      valueAt={valueAt}
      selectedId={selected}
      onSelect={setSelectedId}
      onChange={(chartId, patch) => apply({ type: 'chart/update', sheetId: sheet.id, chartId, patch })}
      onDelete={(chartId) => {
        apply({ type: 'chart/delete', sheetId: sheet.id, chartId })
        setSelectedId(null)
      }}
    />
  )

  return {
    layer,
    selectedId: selected,
    deselect: () => setSelectedId(null),
    deleteSelected: () => {
      if (!selected) return false
      apply({ type: 'chart/delete', sheetId: sheet.id, chartId: selected })
      setSelectedId(null)
      return true
    },
    insertChart
  }
}
