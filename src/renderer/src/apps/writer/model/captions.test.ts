import { describe, expect, it } from 'vitest'
import {
  crossReferenceText,
  isReferenceAnchor,
  isValidCaptionLabel,
  newReferenceAnchor,
  sequenceNumbers,
  type ReferenceTarget
} from './captions'
import { sameTocText, tocEntries, tocTitle } from './toc'

const targets: ReferenceTarget[] = [
  { kind: 'heading', anchor: '_Ref1', pos: 0, text: 'Introducción', level: 1 },
  { kind: 'heading', anchor: '_Ref2', pos: 30, text: 'Contexto', level: 2 },
  {
    kind: 'caption',
    anchor: '_Ref3',
    pos: 60,
    text: 'Figura 1: Mapa',
    label: 'Figura',
    number: 1,
    captionText: 'Mapa'
  },
  { kind: 'heading', anchor: '_Ref4', pos: 90, text: 'Detalle', level: 4 },
  {
    kind: 'caption',
    anchor: '_Ref5',
    pos: 120,
    text: 'Tabla 1: Datos',
    label: 'Tabla',
    number: 1,
    captionText: 'Datos'
  }
]

describe('títulos y referencias cruzadas', () => {
  it('numera cada rótulo por separado', () => {
    expect(sequenceNumbers(['Figura', 'Tabla', 'Figura', 'Figura'])).toEqual([1, 1, 2, 3])
  })

  it('rótulos válidos para Word', () => {
    expect(isValidCaptionLabel('Gráfico')).toBe(true)
    expect(isValidCaptionLabel('Mi rótulo')).toBe(false)
    expect(isValidCaptionLabel('3D')).toBe(false)
  })

  it('escribe la referencia según lo que se pide', () => {
    const figure = targets[2]
    const context = { referencePos: 100, page: 4 }
    expect(crossReferenceText('text', figure, context)).toBe('Figura 1: Mapa')
    expect(crossReferenceText('labelNumber', figure, context)).toBe('Figura 1')
    expect(crossReferenceText('captionText', figure, context)).toBe('Mapa')
    expect(crossReferenceText('page', figure, context)).toBe('4')
    expect(crossReferenceText('position', figure, context)).toBe('más arriba')
    expect(crossReferenceText('position', figure, { referencePos: 10, page: 1 })).toBe('más abajo')
    expect(crossReferenceText('text', null, context)).toMatch(/^¡Error!/)
  })

  it('marcadores ocultos como los de Word, sin repetir', () => {
    const values = [0.5, 0.5, 0.25]
    const anchor = newReferenceAnchor(new Set(['_Ref500000000']), () => values.shift()!)
    expect(anchor).toBe('_Ref250000000')
    expect(isReferenceAnchor(anchor)).toBe(true)
    expect(isReferenceAnchor('_GoBack')).toBe(false)
  })
})

describe('tabla de contenido', () => {
  const pageOf = (pos: number) => 1 + Math.floor(pos / 50)

  it('encabezados hasta el nivel pedido, con su página', () => {
    expect(tocEntries(targets, 'headings', 3, pageOf)).toEqual([
      { level: 1, text: 'Introducción', anchor: '_Ref1', page: 1 },
      { level: 2, text: 'Contexto', anchor: '_Ref2', page: 1 }
    ])
  })

  it('índice de ilustraciones: los títulos de un rótulo', () => {
    expect(tocEntries(targets, 'Figura', 3, pageOf)).toEqual([
      { level: 1, text: 'Figura 1: Mapa', anchor: '_Ref3', page: 2 }
    ])
    expect(tocTitle('Figura')).toBe('Índice de figuras')
    expect(tocTitle('headings')).toBe('Contenido')
  })

  it('las páginas no cuentan para saber si está al día', () => {
    const now = tocEntries(targets, 'headings', 3, pageOf)
    expect(
      sameTocText(
        now,
        now.map((entry) => ({ ...entry, page: 9 }))
      )
    ).toBe(true)
    expect(sameTocText(now, now.slice(1))).toBe(false)
  })
})
