import { cellAddress } from '../model/address'
import { getCellValue, type Evaluation } from '../model/calc'
import { defaultAlignment, formatCellValue } from '../model/format'
import { usedSize } from '../model/selection'
import type { Sheet } from '../model/types'
import { DEFAULT_COLUMN_WIDTH } from '../constants'
import { cellCss } from './SheetGrid'

/**
 * Lo que sale al imprimir o exportar a PDF: una tabla HTML normal con la zona usada de la hoja.
 * La cuadrícula virtualizada no sirve para imprimir (solo existe lo que se ve en pantalla), así que
 * pintamos aparte una versión estática que el navegador sabe partir en páginas.
 */
export function SheetPrintView({ sheet, evaluation }: { sheet: Sheet; evaluation: Evaluation }) {
  const { rows, cols } = usedSize(sheet)
  if (rows === 0) return null
  const widths = Array.from({ length: cols }, (_, col) => sheet.columnWidths[col] ?? DEFAULT_COLUMN_WIDTH)
  return (
    <div className="print-only sheet-print" aria-hidden>
      <style>{'@page { size: A4; margin: 1.5cm; }'}</style>
      {/* Con table-layout: fixed el ancho de la tabla manda: si no se fija, los anchos de columna se ignoran. */}
      <table style={{ width: widths.reduce((total, width) => total + width, 0) }}>
        <colgroup>
          {widths.map((width, col) => (
            <col key={col} style={{ width }} />
          ))}
        </colgroup>
        <tbody>
          {Array.from({ length: rows }, (_, row) => (
            <tr key={row}>
              {Array.from({ length: cols }, (_, col) => {
                const address = cellAddress({ row, col })
                const cell = sheet.cells[address]
                const value = getCellValue(evaluation, sheet.id, address)
                return (
                  <td
                    key={col}
                    style={{ textAlign: cell?.style?.align ?? defaultAlignment(value), ...cellCss(cell?.style, value) }}
                  >
                    {formatCellValue(value, cell?.style?.numberFormat)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
