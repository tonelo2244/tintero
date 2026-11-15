import { describe, expect, it } from 'vitest'
import type { JSONContent } from '@tiptap/core'
import {
  blocksToMarked,
  commonUnmarkedMarks,
  hasPartialUnmarkedFormat,
  inlineToMarked,
  markedToInline,
  markedToPlain
} from './inlineMarks'

const text = (value: string, ...marks: string[]): JSONContent =>
  marks.length ? { type: 'text', text: value, marks: marks.map((type) => ({ type })) } : { type: 'text', text: value }

describe('inlineToMarked', () => {
  it('escribe cada formato con su marca y deja los espacios fuera', () => {
    const nodes = [
      text('Hola '),
      text('mundo ', 'bold'),
      text('feliz', 'bold', 'italic'),
      text(', '),
      text('viejo', 'strike'),
      text(' y '),
      text('nuevo', 'underline'),
      text(' con '),
      text('npm', 'code')
    ]
    expect(inlineToMarked(nodes)).toBe('Hola **mundo** ***feliz***, ~~viejo~~ y <u>nuevo</u> con `npm`')
  })

  it('une nodos seguidos con la misma marca', () => {
    expect(inlineToMarked([text('a', 'bold'), text('b', 'bold')])).toBe('**ab**')
  })
})

describe('markedToInline', () => {
  it('reconstruye los marks de Tiptap', () => {
    expect(markedToInline('Es **muy** *importante*.')).toEqual([
      text('Es '),
      text('muy', 'bold'),
      text(' '),
      text('importante', 'italic'),
      text('.')
    ])
  })

  it('anida marcas y respeta el código literal', () => {
    expect(markedToInline('***las dos*** y `a*b*c`')).toEqual([
      text('las dos', 'bold', 'italic'),
      text(' y '),
      text('a*b*c', 'code')
    ])
  })

  it('no inventa formato con asteriscos sueltos o sin pareja', () => {
    expect(markedToInline('2 * 3 * 4 = 24')).toEqual([text('2 * 3 * 4 = 24')])
    expect(markedToInline('**sin cerrar')).toEqual([text('**sin cerrar')])
  })

  it('aplica las marcas comunes a todo el resultado', () => {
    const red = { type: 'textStyle', attrs: { color: '#ff0000' } }
    expect(markedToInline('Uno **dos**', [red])).toEqual([
      { type: 'text', text: 'Uno ', marks: [red] },
      { type: 'text', text: 'dos', marks: [red, { type: 'bold' }] }
    ])
  })
})

describe('ida y vuelta', () => {
  it.each([
    [[text('Texto '), text('en negrita', 'bold'), text(' y '), text('cursiva', 'italic'), text('.')]],
    [[text('Todo subrayado y tachado', 'strike', 'underline')]],
    [[text('Usa '), text('git status', 'code'), text(' antes.')]]
  ])('conserva el formato %#', (nodes) => {
    expect(markedToInline(inlineToMarked(nodes))).toEqual(nodes)
  })
})

describe('selecciones de varios párrafos', () => {
  const content: JSONContent[] = [
    { type: 'heading', attrs: { level: 2 }, content: [text('Título')] },
    { type: 'paragraph', content: [text('Primer '), text('párrafo', 'bold')] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('Punto')] }] }] }
  ]

  it('cada bloque es un párrafo separado por una línea en blanco', () => {
    expect(blocksToMarked(content)).toBe('Título\n\nPrimer **párrafo**\n\nPunto')
    expect(blocksToMarked([text('dentro de '), text('una línea', 'italic')])).toBe('dentro de *una línea*')
  })

  it('quita las marcas para copiar el texto', () => {
    expect(markedToPlain('Primer **párrafo**\n\n*Dos*')).toBe('Primer párrafo\n\nDos')
  })
})

describe('formato sin marca de texto', () => {
  const red = { type: 'textStyle', attrs: { color: '#ff0000' } }
  const yellow = { type: 'highlight', attrs: { color: '#ffff00' } }

  it('detecta el formato común (se conserva) y el parcial (se pierde)', () => {
    const content: JSONContent[] = [
      { type: 'text', text: 'rojo ', marks: [red] },
      { type: 'text', text: 'y resaltado', marks: [red, yellow, { type: 'bold' }] }
    ]
    expect(commonUnmarkedMarks(content)).toEqual([red])
    expect(hasPartialUnmarkedFormat(content)).toBe(true)
    expect(hasPartialUnmarkedFormat([{ type: 'text', text: 'solo negrita', marks: [{ type: 'bold' }] }])).toBe(false)
  })
})
