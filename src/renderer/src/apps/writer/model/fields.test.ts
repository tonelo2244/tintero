import { describe, expect, it } from 'vitest'
import { fieldKindOfInstruction } from './docx/directFormatting'
import { docxFieldInstruction, FIELD_KINDS, fieldText } from './fields'

const context = { date: new Date(2026, 10, 16), page: 3, pages: 12, fileName: 'Memoria.tdoc', author: 'Ana' }

describe('campos', () => {
  it('pintan su valor del momento', () => {
    expect(fieldText('date', context)).toBe('16 de noviembre de 2026')
    expect(fieldText('page', context)).toBe('3')
    expect(fieldText('pages', context)).toBe('12')
    expect(fieldText('fileName', context)).toBe('Memoria.tdoc')
    expect(fieldText('author', context)).toBe('Ana')
  })

  it('avisan cuando falta el dato, como Word', () => {
    expect(fieldText('author', { ...context, author: '' })).toBe('[Autor]')
    expect(fieldText('fileName', { ...context, fileName: '' })).toBe('[Sin guardar]')
  })

  it('cada campo va y vuelve por su instrucción de Word', () => {
    for (const { kind } of FIELD_KINDS) expect(fieldKindOfInstruction(docxFieldInstruction(kind))).toBe(kind)
    expect(fieldKindOfInstruction(' page \\* MERGEFORMAT ')).toBe('page')
    expect(fieldKindOfInstruction('TOC \\o "1-3"')).toBeNull()
  })
})
