import { getSchema, type JSONContent } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { createWriterExtensions } from '../editor/extensions'
import { buildSearchRegExp, findMatches, matchIndexAt, nextMatchIndex } from './search'

const schema = getSchema(createWriterExtensions())
const paragraph = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content })
const text = (value: string, marks: JSONContent['marks'] = []): JSONContent => ({ type: 'text', text: value, marks })
const docOf = (...blocks: JSONContent[]) => schema.nodeFromJSON({ type: 'doc', content: blocks })

const ANY = { matchCase: false, wholeWord: false }

/** Texto de cada coincidencia, para que los tests se lean sin calcular posiciones a mano. */
const found = (doc: ReturnType<typeof docOf>, query: string, options = ANY) =>
  findMatches(doc, query, options).map(({ from, to }) => doc.textBetween(from, to))

describe('findMatches', () => {
  it('no distingue mayúsculas por defecto y sí cuando se le pide', () => {
    const doc = docOf(paragraph(text('Casa, casa y CASA')))
    expect(found(doc, 'casa')).toEqual(['Casa', 'casa', 'CASA'])
    expect(found(doc, 'casa', { matchCase: true, wholeWord: false })).toEqual(['casa'])
  })

  it('con "palabra completa" no encuentra la palabra dentro de otra, aunque lleve tildes', () => {
    const doc = docOf(paragraph(text('sol solar girasol sol. camión')))
    expect(found(doc, 'sol', { matchCase: false, wholeWord: true })).toEqual(['sol', 'sol'])
    expect(found(doc, 'cami', { matchCase: false, wholeWord: true })).toEqual([])
  })

  it('encuentra texto partido en trozos con formato distinto', () => {
    // "Tin" en negrita + "tero" normal son dos nodos de texto, pero una sola palabra.
    const doc = docOf(paragraph(text('Tin', [{ type: 'bold' }]), text('tero')))
    expect(found(doc, 'tintero')).toEqual(['Tintero'])
  })

  it('no une texto de dos párrafos distintos', () => {
    const doc = docOf(paragraph(text('hola')), paragraph(text('mundo')))
    expect(found(doc, 'holamundo')).toEqual([])
  })

  it('no atraviesa un salto de línea', () => {
    const doc = docOf(paragraph(text('uno'), { type: 'hardBreak' }, text('dos')))
    expect(found(doc, 'unodos')).toEqual([])
    expect(found(doc, 'dos')).toEqual(['dos'])
  })

  it('trata los caracteres especiales de las expresiones regulares como texto', () => {
    const doc = docOf(paragraph(text('precio (aprox.): 3$ o 3.5$')))
    expect(found(doc, '(aprox.)')).toEqual(['(aprox.)'])
    expect(found(doc, '3.5$')).toEqual(['3.5$'])
  })

  it('busca también dentro de tablas y listas', () => {
    const doc = docOf({
      type: 'table',
      content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph(text('dato'))] }] }]
    })
    expect(found(doc, 'dato')).toEqual(['dato'])
  })

  it('una búsqueda vacía no devuelve nada', () => {
    expect(findMatches(docOf(paragraph(text('algo'))), '', ANY)).toEqual([])
    expect(buildSearchRegExp('', ANY)).toBeNull()
  })
})

describe('navegación entre coincidencias', () => {
  const matches = [
    { from: 1, to: 3 },
    { from: 10, to: 12 },
    { from: 20, to: 22 }
  ]

  it('la siguiente es la primera que empieza después del cursor, y da la vuelta al final', () => {
    expect(nextMatchIndex(matches, 5, 1)).toBe(1)
    expect(nextMatchIndex(matches, 10, 1)).toBe(1)
    expect(nextMatchIndex(matches, 25, 1)).toBe(0)
  })

  it('la anterior es la última que acaba antes del cursor, y da la vuelta al principio', () => {
    expect(nextMatchIndex(matches, 10, -1)).toBe(0)
    expect(nextMatchIndex(matches, 0, -1)).toBe(2)
  })

  it('sin coincidencias devuelve -1', () => {
    expect(nextMatchIndex([], 0, 1)).toBe(-1)
  })

  it('reconoce cuándo la selección es exactamente una coincidencia', () => {
    expect(matchIndexAt(matches, { from: 10, to: 12 })).toBe(1)
    expect(matchIndexAt(matches, { from: 10, to: 11 })).toBe(-1)
  })
})
