import { describe, expect, it } from 'vitest'
import { changeCase, compareTexts } from './textCase'

describe('changeCase', () => {
  it('respeta acentos, diéresis y la ñ', () => {
    expect(changeCase('año pingüino canción', 'upper')).toBe('AÑO PINGÜINO CANCIÓN')
    expect(changeCase('ÁRBOL ÑANDÚ', 'lower')).toBe('árbol ñandú')
  })

  it('tipo oración pone mayúscula tras punto, interrogación o exclamación', () => {
    expect(changeCase('HOLA. ¿qué TAL? ¡bien!', 'sentence')).toBe('Hola. ¿Qué tal? ¡Bien!')
    // Un trozo a mitad de frase no empieza con mayúscula.
    expect(changeCase('MUNDO', 'sentence', false)).toBe('mundo')
  })

  it('cada palabra con mayúscula, sin romper los apóstrofos', () => {
    expect(changeCase("el ÁRBOL de o'neill", 'title')).toBe("El Árbol De O'neill")
  })

  it('tipo inverso', () => {
    expect(changeCase('Ñandú', 'toggle')).toBe('ñANDÚ')
  })
})

describe('compareTexts', () => {
  it('ordena sin importar acentos y con los números en orden', () => {
    expect(['Óscar', 'ana', 'Bea'].sort(compareTexts)).toEqual(['ana', 'Bea', 'Óscar'])
    expect(['Tema 10', 'Tema 2'].sort(compareTexts)).toEqual(['Tema 2', 'Tema 10'])
  })
})
