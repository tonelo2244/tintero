import { describe, expect, it } from 'vitest'
import { columnWidthsTwips, readColumnWidths } from './tableLayout'

const cell = (attrs: Record<string, unknown> = {}) => ({ type: 'tableCell', attrs })

describe('readColumnWidths', () => {
  it('lee una entrada por columna, teniendo en cuenta las celdas combinadas', () => {
    const table = {
      type: 'table',
      content: [{ type: 'tableRow', content: [cell({ colwidth: [120] }), cell({ colspan: 2, colwidth: [80, null] })] }]
    }
    expect(readColumnWidths(table)).toEqual([120, 80, null])
  })

  it('devuelve null en las columnas que nadie ha redimensionado', () => {
    const table = { type: 'table', content: [{ type: 'tableRow', content: [cell(), cell({ colwidth: null })] }] }
    expect(readColumnWidths(table)).toEqual([null, null])
  })
})

describe('columnWidthsTwips', () => {
  it('reparte el ancho a partes iguales si ninguna columna es fija', () => {
    expect(columnWidthsTwips([null, null, null], 9000)).toEqual([3000, 3000, 3000])
  })

  it('respeta las columnas fijas y reparte lo que sobra', () => {
    // 100 px = 1500 twips; quedan 7500 para las otras dos.
    expect(columnWidthsTwips([100, null, null], 9000)).toEqual([1500, 3750, 3750])
  })

  it('escala la tabla si las columnas fijas no caben en la página', () => {
    const widths = columnWidthsTwips([400, 400], 9000) // 12 000 twips pedidos
    expect(widths).toEqual([4500, 4500])
  })

  it('una tabla sin columnas no tiene anchos', () => {
    expect(columnWidthsTwips([], 9000)).toEqual([])
  })
})
