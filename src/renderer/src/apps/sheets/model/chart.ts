import { cellAddress } from './address'
import { formatCellValue } from './format'
import type { CellRange, CellValue, Sheet } from './types'

/**
 * Datos de un gráfico a partir de su rango, con la convención de Excel:
 *   - si la primera fila tiene texto sobre columnas de números, son los nombres de las series;
 *   - si la primera columna no es numérica, son las categorías (el eje X o los sectores);
 *   - cada columna restante es una serie. Lo que no es número se dibuja como hueco.
 * Se calcula en cada render a partir de los valores actuales: el gráfico se actualiza solo al recalcular.
 */
export interface ChartSeries {
  name: string
  values: (number | null)[]
}

export interface ChartData {
  categories: string[]
  series: ChartSeries[]
}

type ValueAt = (address: string) => CellValue

export function chartData(sheet: Sheet, source: CellRange, valueAt: ValueAt): ChartData {
  const value = (row: number, col: number) => valueAt(cellAddress({ row, col }))
  const text = (row: number, col: number) =>
    formatCellValue(value(row, col), sheet.cells[cellAddress({ row, col })]?.style?.numberFormat)
  const { start, end } = source

  const firstColumnIsLabels =
    end.col > start.col &&
    rowsOf(source, false).some((row) => {
      const current = value(row, start.col)
      return current !== null && typeof current !== 'number'
    })
  const seriesStart = firstColumnIsLabels ? start.col + 1 : start.col
  const firstRowIsHeader =
    end.row > start.row &&
    Array.from({ length: end.col - seriesStart + 1 }, (_, i) => seriesStart + i).some(
      (col) => typeof value(start.row, col) === 'string'
    )
  const dataRows = rowsOf(source, firstRowIsHeader)

  const categories = dataRows.map((row, index) => (firstColumnIsLabels ? text(row, start.col) : String(index + 1)))
  const series: ChartSeries[] = []
  for (let col = seriesStart; col <= end.col; col++) {
    series.push({
      name: firstRowIsHeader ? text(start.row, col) : `Serie ${col - seriesStart + 1}`,
      values: dataRows.map((row) => {
        const current = value(row, col)
        return typeof current === 'number' && Number.isFinite(current) ? current : null
      })
    })
  }
  return { categories, series }
}

function rowsOf(range: CellRange, skipHeader: boolean): number[] {
  const first = range.start.row + (skipHeader ? 1 : 0)
  return Array.from({ length: Math.max(0, range.end.row - first + 1) }, (_, i) => first + i)
}

/**
 * Marcas "bonitas" para un eje: 0, 25, 50, 75, 100 en vez de 0, 23,7, 47,4… Es el algoritmo
 * clásico de redondear el paso a 1, 2 o 5 por una potencia de 10.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  const low = Math.min(0, min)
  const high = Math.max(0, max)
  if (low === high) return [0, 1]
  const rawStep = (high - low) / count
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const step = [1, 2, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rawStep)!
  const ticks: number[] = []
  for (let tick = Math.floor(low / step) * step; tick <= high + step / 2; tick += step) {
    ticks.push(Number(tick.toPrecision(12)))
    if (tick >= high) break
  }
  return ticks
}
