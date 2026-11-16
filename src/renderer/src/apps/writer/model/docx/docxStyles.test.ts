// @vitest-environment jsdom
import type { JSONContent } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { createWriterExtensions } from '../../editor/extensions'
import type { WriterContent } from '../content'
import { DEFAULT_STYLES, findStyle, upsertStyle, type WriterStyle } from '../styles'
import { exportDocx } from './exportDocx'
import { importDocx } from './importDocx'

/** Fase 13: estilos, formato de párrafo, tabulaciones y listas de ida y vuelta por el .docx. */

const text = (value: string, marks: JSONContent['marks'] = []): JSONContent => ({ type: 'text', text: value, marks })
const paragraph = (content: JSONContent[], attrs: Record<string, unknown> = {}): JSONContent => ({
  type: 'paragraph',
  attrs,
  content
})
const item = (label: string): JSONContent => ({ type: 'listItem', content: [paragraph([text(label)])] })

async function roundTrip(content: Partial<WriterContent> & { doc: JSONContent }) {
  const bytes = await exportDocx(content as WriterContent)
  return (await importDocx(bytes, createWriterExtensions())).content
}

const NOTE: WriterStyle = {
  id: 'custom-nota',
  name: 'Nota',
  type: 'paragraph',
  basedOn: 'quote',
  quick: true,
  props: { italic: false, color: '#c0392b', spaceAfter: 4 }
}
const KEY: WriterStyle = { id: 'custom-clave', name: 'Clave', type: 'character', quick: true, props: { bold: true } }

describe('estilos en .docx', () => {
  it('los estilos de partida no se guardan al volver: el archivo queda como antes de la fase 13', async () => {
    const content = await roundTrip({ doc: { type: 'doc', content: [paragraph([text('Hola')])] } })
    expect(content.styles).toBeUndefined()
    expect(content.numberedHeadings).toBeUndefined()
  })

  it('un título modificado, un estilo propio de párrafo y uno de carácter vuelven iguales', async () => {
    const heading = findStyle(DEFAULT_STYLES, 'heading-1')!
    const styles = upsertStyle([...DEFAULT_STYLES, NOTE, KEY], {
      ...heading,
      props: { ...heading.props, fontSize: 20, color: '#7b1fa2' }
    })
    const content = await roundTrip({
      styles,
      numberedHeadings: true,
      doc: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [text('Introducción')] },
          paragraph([text('Ojo: '), text('importante', [{ type: 'charStyle', attrs: { styleId: 'custom-clave' } }])], {
            blockStyle: 'custom-nota'
          }),
          { type: 'heading', attrs: { level: 5 }, content: [text('Detalle')] }
        ]
      }
    })
    expect(findStyle(content.styles!, 'heading-1')?.props).toMatchObject({ fontSize: 20, color: '#7b1fa2' })
    expect(findStyle(content.styles!, 'custom-nota')).toEqual(NOTE)
    expect(findStyle(content.styles!, 'custom-clave')).toEqual(KEY)
    expect(content.numberedHeadings).toBe(true)
    const [title, note, detail] = content.doc.content ?? []
    expect(title).toMatchObject({ type: 'heading', attrs: { level: 1 } })
    expect(note.attrs?.blockStyle).toBe('custom-nota')
    expect(note.content?.[1].marks).toEqual([{ type: 'charStyle', attrs: { styleId: 'custom-clave' } }])
    expect(detail).toMatchObject({ type: 'heading', attrs: { level: 5 } })
  })
})

describe('formato de párrafo en .docx', () => {
  it('espaciado, sangría derecha, sombreado, bordes y tabulaciones', async () => {
    const attrs = {
      spaceBefore: 6,
      spaceAfter: 0,
      indentRight: 2,
      shading: '#ffeeaa',
      border: 'box',
      tabStops: [{ position: 8, align: 'right', leader: 'dot' }]
    }
    const content = await roundTrip({
      doc: { type: 'doc', content: [paragraph([text('Capítulo'), { type: 'tab' }, text('12')], attrs)] }
    })
    const [block] = content.doc.content ?? []
    expect(block.attrs).toMatchObject(attrs)
    expect(block.content?.map((node) => node.type)).toEqual(['text', 'tab', 'text'])
  })

  it('biblioteca de viñetas y formatos de número', async () => {
    const content = await roundTrip({
      doc: {
        type: 'doc',
        content: [
          { type: 'bulletList', attrs: { bulletStyle: 'check' }, content: [item('uno')] },
          paragraph([text('·')]),
          { type: 'orderedList', attrs: { numberFormat: 'lower-roman' }, content: [item('dos')] },
          paragraph([text('·')]),
          { type: 'orderedList', attrs: { numberFormat: 'decimal-paren' }, content: [item('tres')] },
          paragraph([text('·')]),
          { type: 'orderedList', attrs: { numberFormat: 'legal' }, content: [item('cuatro')] }
        ]
      }
    })
    const lists = (content.doc.content ?? []).filter((block) => block.type !== 'paragraph')
    expect(lists.map((list) => list.attrs?.bulletStyle ?? list.attrs?.numberFormat)).toEqual([
      'check',
      'lower-roman',
      'decimal-paren',
      'legal'
    ])
  })
})
