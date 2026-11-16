import { describe, expect, it } from 'vitest'
import { footnotesByPage, listNotes, noteMark, noteNumbers, toRoman } from './notes'

describe('notas', () => {
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Uno' },
          { type: 'note', attrs: { id: 'a', kind: 'footnote', text: 'Primera' } },
          { type: 'note', attrs: { id: 'b', kind: 'endnote', text: 'Final' } }
        ]
      },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'note', attrs: { id: 'c', kind: 'footnote', text: 'En tabla' } }]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }

  it('lista en orden y numera cada tipo por separado', () => {
    const notes = listNotes(doc)
    expect(notes.map((note) => note.id)).toEqual(['a', 'b', 'c'])
    expect([...noteNumbers(notes)]).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 2]
    ])
  })

  it('las del final van en romanos en minúscula', () => {
    expect(noteMark('endnote', 4)).toBe('iv')
    expect(noteMark('footnote', 4)).toBe('4')
    expect(toRoman(1994)).toBe('MCMXCIV')
    expect(toRoman(0)).toBe('0')
  })

  it('reparte las notas al pie por la hoja de su referencia', () => {
    const notes = [
      { id: 'a', kind: 'footnote' as const, pos: 5 },
      { id: 'b', kind: 'endnote' as const, pos: 6 },
      { id: 'c', kind: 'footnote' as const, pos: 120 }
    ]
    const pages = footnotesByPage(notes, (pos) => (pos < 100 ? 1 : 2))
    expect([...pages].map(([page, list]) => [page, list.map((note) => note.id)])).toEqual([
      [1, ['a']],
      [2, ['c']]
    ])
  })
})
