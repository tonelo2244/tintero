import { describe, expect, it } from 'vitest'
import { createTextElement } from './factories'
import {
  clearRunFormat,
  fromEditorDoc,
  hasText,
  normalizeParagraphs,
  paragraphsFromText,
  plainText,
  resolveRunFormat,
  toEditorDoc
} from './richText'
import type { TextParagraph, TextStyle } from './types'

const style = (overrides: Partial<TextStyle> = {}): TextStyle => ({
  ...createTextElement('free', { x: 0, y: 0, width: 100, height: 100 }).style,
  ...overrides
})

describe('texto plano', () => {
  it('pasa de texto a párrafos y vuelve', () => {
    const paragraphs = paragraphsFromText('uno\n\ntres')
    expect(paragraphs).toEqual([{ runs: [{ text: 'uno' }] }, { runs: [] }, { runs: [{ text: 'tres' }] }])
    expect(plainText(paragraphs)).toBe('uno\n\ntres')
  })

  it('un texto vacío no tiene párrafos', () => {
    expect(paragraphsFromText('')).toEqual([])
    expect(hasText([{ runs: [] }, { runs: [{ text: '' }] }])).toBe(false)
  })
})

describe('normalizeParagraphs', () => {
  it('une trozos con el mismo formato y quita los vacíos', () => {
    const paragraphs: TextParagraph[] = [
      {
        runs: [{ text: 'Ho' }, { text: 'la ' }, { text: '' }, { text: 'mundo', bold: true }, { text: '!', bold: true }]
      }
    ]
    expect(normalizeParagraphs(paragraphs)).toEqual([{ runs: [{ text: 'Hola ' }, { text: 'mundo!', bold: true }] }])
  })

  it('un contenido sin texto se queda sin párrafos', () => {
    expect(normalizeParagraphs([{ runs: [] }, { runs: [] }])).toEqual([])
  })
})

describe('formato del cuadro frente al de cada trozo', () => {
  it('lo que no tiene el trozo se hereda del cuadro', () => {
    const resolved = resolveRunFormat(style({ bold: true, fontSize: 30 }), { italic: true, fontSize: 40 })
    expect(resolved).toMatchObject({ bold: true, italic: true, fontSize: 40 })
  })

  it('dar formato al cuadro entero borra ese formato en los trozos', () => {
    const paragraphs: TextParagraph[] = [{ runs: [{ text: 'a', bold: false, color: '#f00' }, { text: 'b' }] }]
    expect(clearRunFormat(paragraphs, ['bold'])).toEqual([{ runs: [{ text: 'a', color: '#f00' }, { text: 'b' }] }])
  })
})

describe('ida y vuelta con el documento del editor', () => {
  it('conserva el formato por palabra', () => {
    const box = style()
    const paragraphs: TextParagraph[] = [
      {
        runs: [{ text: 'Una ' }, { text: 'palabra', bold: true, color: '#c00000' }, { text: ' grande', fontSize: 48 }]
      },
      { runs: [{ text: 'segunda línea', italic: true, underline: true, fontFamily: 'Georgia, serif' }] }
    ]
    expect(fromEditorDoc(toEditorDoc(paragraphs, box), box)).toEqual(paragraphs)
  })

  it('en un cuadro en negrita, una palabra sin negrita se guarda como "bold: false"', () => {
    const box = style({ bold: true })
    const doc = toEditorDoc([{ runs: [{ text: 'fuerte ' }, { text: 'suave', bold: false }] }], box)
    // En el editor la negrita del cuadro se ve como marca en cada trozo que la tiene.
    expect(doc.content?.[0].content?.[0].marks).toEqual([{ type: 'bold' }])
    expect(doc.content?.[0].content?.[1].marks).toBeUndefined()
    expect(fromEditorDoc(doc, box)).toEqual([{ runs: [{ text: 'fuerte ' }, { text: 'suave', bold: false }] }])
  })

  it('no guarda como propio un formato igual al del cuadro', () => {
    const box = style({ fontSize: 24, color: '#333333' })
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'x', marks: [{ type: 'textStyle', attrs: { fontSize: '24px', color: '#333333' } }] }
          ]
        }
      ]
    }
    expect(fromEditorDoc(doc, box)).toEqual([{ runs: [{ text: 'x' }] }])
  })

  it('un cuadro vacío es un párrafo vacío en el editor y ninguno al volver', () => {
    const doc = toEditorDoc([], style())
    expect(doc).toEqual({ type: 'doc', content: [{ type: 'paragraph', content: [] }] })
    expect(fromEditorDoc(doc, style())).toEqual([])
  })
})
