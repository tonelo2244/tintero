import type { AppTemplate } from '@/core/appModule'
import { createSheet, createWorkbook } from './model/factories'
import { cellFromInput } from './model/input'
import type { Cell, CellStyle, Workbook } from './model/types'

/**
 * Las plantillas se escriben como lo escribiría el usuario ("=SUMA(B4:B9)", "1.200 €") y pasan
 * por el mismo `cellFromInput` que la cuadrícula. Así las plantillas prueban de paso el parser.
 */
function cells(rows: Record<string, string>, styles: Record<string, CellStyle> = {}): Record<string, Cell> {
  const result: Record<string, Cell> = {}
  for (const [address, text] of Object.entries(rows)) {
    const cell = cellFromInput(text, styles[address] ? { style: styles[address] } : undefined)
    if (cell) result[address] = cell
  }
  for (const [address, style] of Object.entries(styles)) result[address] ??= { style }
  return result
}

const HEADER: CellStyle = { bold: true, fill: '#d8eee1', borders: { bottom: true } }
const TOTAL: CellStyle = { bold: true, borders: { top: true } }
const EURO: CellStyle = { numberFormat: { kind: 'currency', decimals: 2 } }

function budgetWorkbook(): Workbook {
  const sheet = createSheet(
    'Presupuesto',
    cells(
      {
        A1: 'Presupuesto mensual',
        A3: 'Concepto',
        B3: 'Previsto',
        C3: 'Real',
        D3: 'Diferencia',
        A4: 'Alquiler',
        B4: '750',
        C4: '750',
        A5: 'Supermercado',
        B5: '300',
        C5: '342,5',
        A6: 'Transporte',
        B6: '60',
        C6: '48',
        A7: 'Suministros',
        B7: '120',
        C7: '131,2',
        A8: 'Ocio',
        B8: '150',
        C8: '95',
        A9: 'Ahorro',
        B9: '200',
        C9: '200',
        D4: '=B4-C4',
        D5: '=B5-C5',
        D6: '=B6-C6',
        D7: '=B7-C7',
        D8: '=B8-C8',
        D9: '=B9-C9',
        A10: 'Total',
        B10: '=SUMA(B4:B9)',
        C10: '=SUMA(C4:C9)',
        D10: '=SUMA(D4:D9)',
        A12: 'Estado',
        B12: '=SI(D10>=0;"Dentro del presupuesto";"Te has pasado")'
      },
      {
        A1: { bold: true, color: '#1f7a4d' },
        A3: HEADER,
        B3: HEADER,
        C3: HEADER,
        D3: HEADER,
        A10: TOTAL,
        ...Object.fromEntries(
          ['B', 'C', 'D'].flatMap((col) => [4, 5, 6, 7, 8, 9].map((row) => [`${col}${row}`, EURO]))
        ),
        B10: { ...TOTAL, ...EURO },
        C10: { ...TOTAL, ...EURO },
        D10: { ...TOTAL, ...EURO },
        A12: { bold: true }
      }
    )
  )
  sheet.columnWidths = { 0: 150, 1: 110, 2: 110, 3: 110 }
  return createWorkbook([sheet])
}

function tourWorkbook(): Workbook {
  const sheet = createSheet(
    'Bienvenida',
    cells(
      {
        A1: 'Le damos la bienvenida a Tintero Hojas de cálculo',
        A3: '1. Escribe en cualquier celda y pulsa Intro.',
        A4: '2. Empieza con = para escribir una fórmula. Prueba en C8: =A8*B8',
        A5: '3. Mientras escribes una fórmula, haz clic en otra celda para insertar su referencia.',
        A7: 'Unidades',
        B7: 'Precio',
        C7: 'Total',
        A8: '3',
        B8: '12,5 €',
        A9: '5',
        B9: '4,2 €',
        C9: '=A9*B9',
        A11: '4. Selecciona C8:C9 y mira la suma en la barra de estado.',
        A12: '5. Usa las pestañas de abajo para añadir hojas. Doble clic para renombrarlas.',
        A13: '6. Exporta a Excel (.xlsx) o CSV con el botón de exportar de la barra superior.'
      },
      {
        A1: { bold: true, color: '#1f7a4d' },
        A7: HEADER,
        B7: HEADER,
        C7: HEADER,
        C8: EURO,
        C9: EURO
      }
    )
  )
  return createWorkbook([sheet])
}

function BlankPreview() {
  return <div className="sheet-thumb" />
}

function BudgetPreview() {
  return (
    <div className="sheet-thumb sheet-thumb--budget">
      <b>Presupuesto</b>
      {Array.from({ length: 6 }, (_, index) => (
        <i key={index} />
      ))}
    </div>
  )
}

function TourPreview() {
  return (
    <div className="sheet-thumb sheet-thumb--tour">
      <span>
        Realizar
        <br />
        un recorrido
      </span>
      <span className="sheet-thumb__formula">=SUMA()</span>
    </div>
  )
}

export const sheetsTemplates: AppTemplate<Workbook>[] = [
  { id: 'blank', name: 'Libro en blanco', Preview: BlankPreview, createContent: () => createWorkbook() },
  { id: 'tour', name: 'Bienvenido a Tintero', Preview: TourPreview, createContent: tourWorkbook },
  { id: 'budget', name: 'Presupuesto mensual', Preview: BudgetPreview, createContent: budgetWorkbook }
]
