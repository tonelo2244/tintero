import type { JSONContent } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { detectSeparator, paragraphsToTable, splitInline } from './tableFromText'

const text = (value: string, marks?: JSONContent['marks']): JSONContent => ({
  type: 'text',
  text: value,
  ...(marks && { marks })
})
const tab: JSONContent = { type: 'tab' }
const paragraph = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content })

/** Texto de cada celda, fila a fila. */
const cellTexts = (table: JSONContent | null) =>
  table?.content?.map((row) =>
    row.content?.map((cell) => (cell.content?.[0].content ?? []).map((node) => node.text ?? '').join(''))
  )

describe('convertir texto en tabla', () => {
  it('adivina el separador: tabulación, luego punto y coma (la coma es decimal)', () => {
    expect(detectSeparator([paragraph(text('a'), tab, text('b'))])).toBe('tab')
    expect(detectSeparator([paragraph(text('a; b'))])).toBe(';')
    expect(detectSeparator([paragraph(text('4,5 y 3,2'))])).toBeNull()
  })

  it('parte por tabulaciones conservando la negrita', () => {
    const bold = [{ type: 'bold' }]
    const cells = splitInline([text('Nombre', bold), tab, text('Edad')], 'tab')
    expect(cells).toEqual([[text('Nombre', bold)], [text('Edad')]])
  })

  it('parte por punto y coma y quita los espacios de los bordes', () => {
    expect(splitInline([text('Ana ; 30;Madrid ')], ';')).toEqual([[text('Ana')], [text('30')], [text('Madrid')]])
  })

  it('las filas cortas se completan con celdas vacías', () => {
    const table = paragraphsToTable([paragraph(text('Nombre; Edad; Ciudad')), paragraph(text('Ana; 30'))])
    expect(cellTexts(table)).toEqual([
      ['Nombre', 'Edad', 'Ciudad'],
      ['Ana', '30', '']
    ])
    expect(table?.content?.[1].content?.[2]).toEqual({ type: 'tableCell', content: [{ type: 'paragraph' }] })
  })

  it('sin separador, una columna; sin párrafos, nada', () => {
    expect(cellTexts(paragraphsToTable([paragraph(text('uno')), paragraph(text('dos'))]))).toEqual([['uno'], ['dos']])
    expect(paragraphsToTable([])).toBeNull()
  })
})
