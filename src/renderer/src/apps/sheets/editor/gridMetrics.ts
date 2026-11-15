import { MAX_COLUMNS, MAX_ROWS } from '../model/address'
import type { Sheet } from '../model/types'
import { DEFAULT_COLUMN_WIDTH, ROW_HEIGHT } from '../constants'

/**
 * Posición de cada columna (o fila). offsets[i] es donde empieza la i, y offsets[count] el tamaño
 * total. Con sumas acumuladas, "¿qué columna hay en x?" es una búsqueda binaria: O(log n) aunque
 * haya 10.000 filas de altos distintos. Una fila oculta (filtrada) mide 0.
 */
export interface AxisMetrics {
  offsets: Float64Array
  size(index: number): number
  /** Índice que contiene la coordenada (desde el borde de la primera). Las de tamaño 0 se saltan. */
  indexAt(position: number): number
  total: number
}

function buildMetrics(count: number, sizeOf: (index: number) => number): AxisMetrics {
  const offsets = new Float64Array(count + 1)
  for (let index = 0; index < count; index++) offsets[index + 1] = offsets[index] + sizeOf(index)
  return {
    offsets,
    size: (index) => offsets[index + 1] - offsets[index],
    indexAt: (position) => {
      // El último índice cuyo inicio está en o antes de `position` y que no mide 0.
      let low = 0
      let high = count - 1
      while (low < high) {
        const middle = (low + high + 1) >> 1
        if (offsets[middle] <= position) low = middle
        else high = middle - 1
      }
      while (low > 0 && offsets[low + 1] === offsets[low]) low--
      return low
    },
    total: offsets[count]
  }
}

export function columnMetrics(columnWidths: Sheet['columnWidths']): AxisMetrics {
  return buildMetrics(MAX_COLUMNS, (col) => columnWidths[col] ?? DEFAULT_COLUMN_WIDTH)
}

export function rowMetrics(rowHeights: Sheet['rowHeights'], hiddenRows: ReadonlySet<number>): AxisMetrics {
  return buildMetrics(MAX_ROWS, (row) => (hiddenRows.has(row) ? 0 : (rowHeights?.[row] ?? ROW_HEIGHT)))
}
