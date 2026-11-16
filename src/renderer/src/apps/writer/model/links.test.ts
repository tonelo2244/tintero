import { describe, expect, it } from 'vitest'
import {
  bookmarkOfHref,
  isValidBookmarkName,
  listBookmarks,
  normalizeHref,
  suggestBookmarkName,
  uniqueBookmarkName
} from './links'

describe('vínculos', () => {
  it('completa la dirección como Word: web, correo o marcador', () => {
    expect(normalizeHref('tintero.app')).toBe('https://tintero.app')
    expect(normalizeHref('  http://ejemplo.es/a ')).toBe('http://ejemplo.es/a')
    expect(normalizeHref('ana@correo.es')).toBe('mailto:ana@correo.es')
    expect(normalizeHref('mailto:ana@correo.es')).toBe('mailto:ana@correo.es')
    expect(normalizeHref('#Conclusiones')).toBe('#Conclusiones')
    expect(normalizeHref('   ')).toBeNull()
  })

  it('distingue los vínculos internos', () => {
    expect(bookmarkOfHref('#Resumen')).toBe('Resumen')
    expect(bookmarkOfHref('https://tintero.app')).toBeNull()
    expect(bookmarkOfHref('#')).toBeNull()
    expect(bookmarkOfHref(null)).toBeNull()
  })
})

describe('marcadores', () => {
  it('sigue las reglas de nombre de Word', () => {
    expect(isValidBookmarkName('Capítulo_2')).toBe(true)
    expect(isValidBookmarkName('año')).toBe(true)
    expect(isValidBookmarkName('2capítulo')).toBe(false)
    expect(isValidBookmarkName('con espacio')).toBe(false)
    expect(isValidBookmarkName('')).toBe(false)
    expect(isValidBookmarkName('a'.repeat(41))).toBe(false)
  })

  it('propone un nombre válido a partir del texto seleccionado', () => {
    expect(suggestBookmarkName('Resultados del año')).toBe('Resultados_del_año')
    expect(suggestBookmarkName('1. Introducción')).toBe('Introducción')
    expect(suggestBookmarkName('¿?')).toBe('Marcador')
    expect(isValidBookmarkName(suggestBookmarkName('x'.repeat(80)))).toBe(true)
  })

  it('no repite nombres', () => {
    expect(uniqueBookmarkName('Marcador', [])).toBe('Marcador')
    expect(uniqueBookmarkName('Marcador', ['Marcador', 'Marcador2'])).toBe('Marcador3')
  })

  it('lista los marcadores del documento sin los ocultos de Word', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'bookmark', attrs: { name: 'Inicio' } },
            { type: 'bookmark', attrs: { name: '_GoBack' } },
            { type: 'text', text: 'Hola' }
          ]
        },
        { type: 'paragraph', content: [{ type: 'bookmark', attrs: { name: 'Final' } }] }
      ]
    }
    expect(listBookmarks(doc)).toEqual(['Inicio', 'Final'])
  })
})
