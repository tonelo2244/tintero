import { MAX_COLUMNS } from '../model/address'
import type { Sheet } from '../model/types'
import { DEFAULT_COLUMN_WIDTH } from '../constants'

/**
 * Posición horizontal de cada columna. offsets[c] es donde empieza la columna c, y
 * offsets[MAX_COLUMNS] el ancho total. Con sumas acumuladas, "¿qué columna hay en x?"
 * es una búsqueda binaria: O(log n) aunque haya 702 columnas de anchos distintos.
 */
export interface ColumnMetrics {
  offsets: Float64Array
  width(col: number): number
  /** Columna que contiene la coordenada x (desde el borde izquierdo de la columna A). */
  columnAt(x: number): number
  totalWidth: number
}

export function columnMetrics(columnWidths: Sheet['columnWidths']): ColumnMetrics {
  const offsets = new Float64Array(MAX_COLUMNS + 1)
  for (let col = 0; col < MAX_COLUMNS; col++) {
    offsets[col + 1] = offsets[col] + (columnWidths[col] ?? DEFAULT_COLUMN_WIDTH)
  }
  return {
    offsets,
    width: (col) => offsets[col + 1] - offsets[col],
    columnAt: (x) => {
      let low = 0
      let high = MAX_COLUMNS - 1
      while (low < high) {
        const middle = (low + high + 1) >> 1
        if (offsets[middle] <= x) low = middle
        else high = middle - 1
      }
      return low
    },
    totalWidth: offsets[MAX_COLUMNS]
  }
}
