import { cellAddress } from '../model/address'
import { getCellValue, type Evaluation } from '../model/calc'
import type { ConditionalStyler } from '../model/conditional'
import { defaultAlignment, formatCellValue } from '../model/format'
import { mergeIndex } from '../model/merges'
import { usedSize } from '../model/selection'
import type { Sheet } from '../model/types'
import { DEFAULT_COLUMN_WIDTH, ROW_HEIGHT } from '../constants'
import { cellCss } from './SheetGrid'

/** Ancho útil de un A4 vertical con márgenes de 1,5 cm, en píxeles CSS (96 por pulgada). */
const PRINTABLE_WIDTH = Math.floor(((21 - 3) / 2.54) * 96)

interface SheetPrintViewProps {
  sheet: Sheet
  evaluation: Evaluation
  hiddenRows: ReadonlySet<number>
  conditionalStyle?: ConditionalStyler
}

/**
 * Lo que sale al imprimir o exportar a PDF: una tabla HTML normal con la zona usada de la hoja.
 * La cuadrícula virtualizada no sirve para imprimir (solo existe lo que se ve en pantalla), así que
 * pintamos aparte una versión estática que el navegador sabe partir en páginas.
 *
 * "Ajustar al ancho": si las columnas usadas no caben en la página, se reduce la escala (como la
 * opción "Ajustar todas las columnas en una página" de Excel). Las filas filtradas no se imprimen.
 */
export function SheetPrintView({ sheet, evaluation, hiddenRows, conditionalStyle }: SheetPrintViewProps) {
  const { rows, cols } = usedSize(sheet)
  if (rows === 0) return null
  const widths = Array.from({ length: cols }, (_, col) => sheet.columnWidths[col] ?? DEFAULT_COLUMN_WIDTH)
  const totalWidth = widths.reduce((total, width) => total + width, 0)
  const scale = Math.min(1, PRINTABLE_WIDTH / totalWidth)
  const merges = mergeIndex(sheet)

  return (
    <div className="print-only sheet-print" aria-hidden>
      <style>{'@page { size: A4; margin: 1.5cm; }'}</style>
      {/* Con table-layout: fixed el ancho de la tabla manda: si no se fija, los anchos de columna se ignoran. */}
      <table style={{ width: totalWidth, zoom: scale }}>
        <colgroup>
          {widths.map((width, col) => (
            <col key={col} style={{ width }} />
          ))}
        </colgroup>
        <tbody>
          {Array.from({ length: rows }, (_, row) => {
            if (hiddenRows.has(row)) return null
            const height = sheet.rowHeights?.[row]
            if (height === 0) return null
            return (
              <tr key={row} style={height ? { height } : undefined}>
                {Array.from({ length: cols }, (_, col) => {
                  const address = cellAddress({ row, col })
                  const merge = merges.get(address)
                  // De una combinada solo se pinta la esquina, que ocupa el resto con colSpan/rowSpan.
                  if (merge && (merge.start.row !== row || merge.start.col !== col)) return null
                  const cell = sheet.cells[address]
                  const value = getCellValue(evaluation, sheet.id, address)
                  const extra = conditionalStyle?.(address, value)
                  const style = extra ? { ...cell?.style, ...extra } : cell?.style
                  return (
                    <td
                      key={col}
                      colSpan={merge ? merge.end.col - merge.start.col + 1 : undefined}
                      rowSpan={merge ? merge.end.row - merge.start.row + 1 : undefined}
                      style={{
                        textAlign: style?.align ?? defaultAlignment(value),
                        whiteSpace: style?.wrap ? 'normal' : undefined,
                        height: height && height !== ROW_HEIGHT ? height : undefined,
                        ...cellCss(style, value)
                      }}
                    >
                      {formatCellValue(value, style?.numberFormat)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
