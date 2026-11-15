import type { AiGenerateRequest } from '@shared/ai'
import { extractNumbers } from '@/core/ai/grounding'
import { cellAddress, columnName, rangeAddress } from '../address'
import { getCellValue, type Evaluation } from '../calc'
import type { CellRange, CellValue, Sheet } from '../types'

/**
 * «Resume estos datos». Reparto de trabajo deliberado:
 *   - el CÓDIGO calcula todas las cifras (sumas, medias, máximos, quién tiene el máximo...);
 *   - el MODELO solo las redacta.
 * Un modelo pequeño suma mal y se inventa números con total seguridad; así, cada cifra del
 * resumen se puede comprobar contra las calculadas (ver core/ai/grounding.ts).
 */
export interface NumericSummary {
  sum: number
  mean: number
  min: number
  max: number
  /** Etiqueta de la fila del mínimo/máximo (de la primera columna de texto), si la hay. */
  minLabel: string | null
  maxLabel: string | null
}

export interface ColumnStats {
  column: string
  header: string | null
  /** Celdas con algo (sin la cabecera). */
  count: number
  numeric: NumericSummary | null
  /** Valores de texto más repetidos (máx. 3). */
  topValues: { value: string; count: number }[]
  distinctTexts: number
}

export interface TableStats {
  range: string
  dataRows: number
  hasHeader: boolean
  columns: ColumnStats[]
}

const MAX_COLUMNS = 20

export function computeTableStats(sheet: Sheet, evaluation: Evaluation, range: CellRange): TableStats {
  const value = (row: number, col: number): CellValue => getCellValue(evaluation, sheet.id, cellAddress({ row, col }))
  const lastCol = Math.min(range.end.col, range.start.col + MAX_COLUMNS - 1)
  const cols = Array.from({ length: lastCol - range.start.col + 1 }, (_, index) => range.start.col + index)

  const hasHeader = detectHeader(range, cols, value)
  const firstDataRow = hasHeader ? range.start.row + 1 : range.start.row
  const rows = Array.from({ length: Math.max(0, range.end.row - firstDataRow + 1) }, (_, index) => firstDataRow + index)
  // La primera columna con texto hace de "etiqueta" de cada fila (Región, Producto, Mes...).
  const labelCol = cols.find((col) => rows.some((row) => typeof value(row, col) === 'string'))

  const columns = cols.map((col): ColumnStats => {
    const header = hasHeader ? String(value(range.start.row, col) ?? '') || null : null
    const numbers: { value: number; row: number }[] = []
    const texts = new Map<string, number>()
    let count = 0
    for (const row of rows) {
      const cell = value(row, col)
      if (cell === null || cell === '') continue
      count++
      if (typeof cell === 'number') numbers.push({ value: cell, row })
      else if (typeof cell === 'string') texts.set(cell, (texts.get(cell) ?? 0) + 1)
    }
    const label = (row: number) => {
      if (labelCol === undefined || labelCol === col) return null
      const text = value(row, labelCol)
      return typeof text === 'string' ? text : null
    }
    let numeric: NumericSummary | null = null
    if (numbers.length > 0) {
      const minEntry = numbers.reduce((best, entry) => (entry.value < best.value ? entry : best))
      const maxEntry = numbers.reduce((best, entry) => (entry.value > best.value ? entry : best))
      const sum = numbers.reduce((total, entry) => total + entry.value, 0)
      numeric = {
        sum: round(sum),
        mean: round(sum / numbers.length),
        min: minEntry.value,
        max: maxEntry.value,
        minLabel: label(minEntry.row),
        maxLabel: label(maxEntry.row)
      }
    }
    const topValues = [...texts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([text, times]) => ({ value: text, count: times }))
    return { column: columnName(col), header, count, numeric, topValues, distinctTexts: texts.size }
  })

  return { range: rangeAddress(range), dataRows: rows.length, hasHeader, columns }
}

/** Cabecera = la primera fila es todo texto y debajo hay algún número. */
function detectHeader(range: CellRange, cols: number[], value: (row: number, col: number) => CellValue): boolean {
  if (range.end.row === range.start.row) return false
  const first = cols.map((col) => value(range.start.row, col)).filter((cell) => cell !== null && cell !== '')
  if (first.length === 0 || !first.every((cell) => typeof cell === 'string')) return false
  return cols.some((col) => typeof value(range.start.row + 1, col) === 'number')
}

function round(value: number): number {
  return Number(value.toPrecision(12))
}

/** Todas las cifras que el resumen puede usar: las calculadas y las que ya están en los textos. */
export function knownNumbers(stats: TableStats): number[] {
  const numbers = [stats.dataRows, stats.columns.length]
  for (const column of stats.columns) {
    numbers.push(column.count, column.distinctTexts)
    if (column.numeric) {
      const { sum, mean, min, max } = column.numeric
      numbers.push(sum, mean, min, max, max - min)
    }
    for (const top of column.topValues) numbers.push(top.count, ...extractNumbers(top.value))
    numbers.push(...extractNumbers(column.header ?? ''))
    numbers.push(...extractNumbers([column.numeric?.minLabel, column.numeric?.maxLabel].filter(Boolean).join(' ')))
  }
  return numbers
}

/** Las estadísticas en un formato compacto y legible para el modelo (y para depurar el prompt). */
export function describeStats(stats: TableStats): string {
  const lines = [
    `Datos de ${stats.range}: ${stats.dataRows} filas${stats.hasHeader ? ' (sin contar la cabecera)' : ''}.`
  ]
  for (const column of stats.columns) {
    if (column.count === 0) continue
    const name = column.header ? `"${column.header}" (columna ${column.column})` : `Columna ${column.column}`
    const parts = [`${column.count} valores`]
    if (column.numeric) {
      const { sum, mean, min, max, minLabel, maxLabel } = column.numeric
      parts.push(
        `suma ${formatForPrompt(sum)}`,
        `media ${formatForPrompt(mean)}`,
        `mínimo ${formatForPrompt(min)}${minLabel ? ` (${minLabel})` : ''}`,
        `máximo ${formatForPrompt(max)}${maxLabel ? ` (${maxLabel})` : ''}`
      )
    }
    if (column.topValues.length > 0) {
      parts.push(
        `${column.distinctTexts} textos distintos; los más repetidos: ${column.topValues
          .map((top) => `"${top.value}" (${top.count})`)
          .join(', ')}`
      )
    }
    lines.push(`- ${name}: ${parts.join('; ')}.`)
  }
  return lines.join('\n')
}

/** Cifras a la española y con 2 decimales como mucho: el modelo tiende a copiarlas tal cual. */
function formatForPrompt(value: number): string {
  return value.toLocaleString('es-ES', { maximumFractionDigits: 2 })
}

const SYSTEM_PROMPT = [
  'Redactas resúmenes breves de tablas de datos para un informe.',
  'Recibirás estadísticas ya calculadas. Usa SOLO esas cifras: no calcules nada nuevo (ni porcentajes, ni diferencias, ni totales) y no inventes datos.',
  'Escribe de 3 a 5 frases en español: qué contiene la tabla, los valores más altos y más bajos, y algo que llame la atención.',
  'Responde solo con el resumen, sin títulos, sin listas y sin Markdown.'
].join('\n')

export function buildAnalysisRequest(stats: TableStats): AiGenerateRequest {
  return {
    temperature: 0.2,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `<estadisticas>\n${describeStats(stats)}\n</estadisticas>` }
    ]
  }
}
