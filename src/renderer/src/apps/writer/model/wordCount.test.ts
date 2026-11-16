import { describe, expect, it } from 'vitest'
import { countWords, wordCount } from './wordCount'

describe('recuento de palabras', () => {
  it('cuenta como Word: los signos sueltos no son palabras', () => {
    expect(countWords('Hola, mundo — qué tal')).toBe(4)
    expect(countWords('e-mail cuesta 3,5 €')).toBe(3)
    expect(countWords('   ')).toBe(0)
  })

  it('caracteres con y sin espacios, y párrafos no vacíos', () => {
    const result = wordCount({ paragraphs: ['Hola mundo', '', 'Adiós\tya'], lines: 3, pages: 1 })
    expect(result).toEqual({
      pages: 1,
      words: 4,
      charactersNoSpaces: 16,
      charactersWithSpaces: 18,
      paragraphs: 2,
      lines: 3
    })
  })

  it('cuenta letras con tilde y emojis como un carácter', () => {
    expect(wordCount({ paragraphs: ['año 🙂'], lines: null, pages: null }).charactersWithSpaces).toBe(5)
  })
})
