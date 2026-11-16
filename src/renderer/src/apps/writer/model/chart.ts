import type { ChartData } from '@/apps/sheets/model/chart'
import type { ChartKind } from '@/apps/sheets/model/types'

/**
 * Gráfico del documento (fase 16). Guarda su propia tabla pequeña de datos (no enlaza con una hoja
 * de cálculo, igual que el gráfico que Word inserta) y se pinta con el mismo componente que los
 * gráficos de Hojas. La tabla se edita como una cuadrícula de textos: la primera fila son los nombres
 * de las series y la primera columna, las categorías.
 */

export const CHART = 'chart'

export const CHART_KINDS: { kind: ChartKind; label: string }[] = [
  { kind: 'bar', label: 'Columnas' },
  { kind: 'line', label: 'Líneas' },
  { kind: 'pie', label: 'Circular' }
]

export const DEFAULT_CHART_SIZE = { width: 480, height: 300 }

/** Los datos de ejemplo que pone Word al insertar un gráfico, en español. */
export const SAMPLE_CHART_DATA: ChartData = {
  categories: ['Categoría 1', 'Categoría 2', 'Categoría 3', 'Categoría 4'],
  series: [
    { name: 'Serie 1', values: [4.3, 2.5, 3.5, 4.5] },
    { name: 'Serie 2', values: [2.4, 4.4, 1.8, 2.8] },
    { name: 'Serie 3', values: [2, 2, 3, 5] }
  ]
}

export const isChartKind = (value: unknown): value is ChartKind => CHART_KINDS.some((option) => option.kind === value)

/** Número escrito a mano: admite coma decimal y separador de miles con punto ("1.234,5"). Vacío o texto, null. */
export function parseChartNumber(text: string): number | null {
  const trimmed = text.trim().replace(/\s/g, '')
  if (!trimmed) return null
  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

/** Número para la cuadrícula, con coma decimal. */
export const formatChartNumber = (value: number | null) => (value === null ? '' : String(value).replace('.', ','))

/** Datos -> cuadrícula de textos (la esquina va vacía). */
export function chartDataToTable(data: ChartData): string[][] {
  return [
    ['', ...data.series.map((series) => series.name)],
    ...data.categories.map((category, row) => [
      category,
      ...data.series.map((series) => formatChartNumber(series.values[row] ?? null))
    ])
  ]
}

/** Cuadrícula -> datos. Las filas y columnas sin nombre ni números se quitan. */
export function tableToChartData(table: string[][]): ChartData {
  const [header = [], ...rows] = table
  const columns = Math.max(header.length, ...rows.map((row) => row.length))
  const usedRows = rows.filter((row) => row.some((cell) => cell.trim() !== ''))
  const usedColumns = Array.from({ length: columns - 1 }, (_, index) => index + 1).filter(
    (column) => (header[column] ?? '').trim() !== '' || usedRows.some((row) => (row[column] ?? '').trim() !== '')
  )
  return {
    categories: usedRows.map((row, index) => row[0]?.trim() || `Categoría ${index + 1}`),
    series: usedColumns.map((column, index) => ({
      name: header[column]?.trim() || `Serie ${index + 1}`,
      values: usedRows.map((row) => parseChartNumber(row[column] ?? ''))
    }))
  }
}

/** Lee los datos guardados, con cuidado: un archivo dañado no debe romper el documento. */
export function normalizeChartData(raw: unknown): ChartData {
  const candidate = raw as Partial<ChartData> | null
  if (!candidate || !Array.isArray(candidate.categories) || !Array.isArray(candidate.series)) return SAMPLE_CHART_DATA
  const categories = candidate.categories.map((category) => String(category))
  const series = candidate.series
    .filter((entry) => entry && Array.isArray(entry.values))
    .map((entry) => ({
      name: String(entry.name ?? ''),
      values: categories.map((_, index) => {
        const value = entry.values[index]
        return typeof value === 'number' && Number.isFinite(value) ? value : null
      })
    }))
  return series.length > 0 ? { categories, series } : SAMPLE_CHART_DATA
}
