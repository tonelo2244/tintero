// @vitest-environment happy-dom
import type { JSONContent } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { createWriterExtensions } from '../../editor/extensions'
import { exportDocx } from './exportDocx'
import { describeLosses, importDocx } from './importDocx'

const text = (value: string, marks: JSONContent['marks'] = []): JSONContent => ({ type: 'text', text: value, marks })
const paragraph = (content: JSONContent[], attrs: Record<string, unknown> = {}): JSONContent => ({
  type: 'paragraph',
  attrs,
  content
})

/** Exporta y vuelve a importar: la mejor prueba de que ambos lados hablan el mismo "dialecto". */
async function roundTrip(content: JSONContent[]) {
  const bytes = await exportDocx({ doc: { type: 'doc', content } })
  return importDocx(bytes, createWriterExtensions())
}

const blocks = (doc: JSONContent) => doc.content ?? []
const marksOf = (node: JSONContent | undefined) => (node?.content?.[0]?.marks ?? []).map((mark) => mark.type)

describe('importDocx (ida y vuelta con exportDocx)', () => {
  it('conserva títulos y estilos de párrafo', async () => {
    const { content } = await roundTrip([
      paragraph([text('Informe')], { blockStyle: 'title' }),
      { type: 'heading', attrs: { level: 1 }, content: [text('Introducción')] },
      { type: 'heading', attrs: { level: 3 }, content: [text('Detalle')] },
      paragraph([text('Cita célebre')], { blockStyle: 'quote' })
    ])
    const [title, h1, h3, quote] = blocks(content.doc)
    expect(title).toMatchObject({ type: 'paragraph', attrs: { blockStyle: 'title' } })
    expect(h1).toMatchObject({ type: 'heading', attrs: { level: 1 } })
    expect(h3).toMatchObject({ type: 'heading', attrs: { level: 3 } })
    expect(quote).toMatchObject({ attrs: { blockStyle: 'quote' } })
  })

  it('conserva negrita, cursiva, subrayado, tachado y enlaces', async () => {
    const { content } = await roundTrip([
      paragraph([text('a', [{ type: 'bold' }, { type: 'italic' }])]),
      paragraph([text('b', [{ type: 'underline' }, { type: 'strike' }])]),
      paragraph([text('web', [{ type: 'link', attrs: { href: 'https://example.com' } }])])
    ])
    const [first, second, third] = blocks(content.doc)
    expect(marksOf(first)).toEqual(expect.arrayContaining(['bold', 'italic']))
    expect(marksOf(second)).toEqual(expect.arrayContaining(['underline', 'strike']))
    expect(third.content?.[0].marks?.[0]).toMatchObject({ type: 'link', attrs: { href: 'https://example.com' } })
  })

  it('reconstruye listas con viñetas y numeradas', async () => {
    const item = (label: string): JSONContent => ({ type: 'listItem', content: [paragraph([text(label)])] })
    const { content } = await roundTrip([
      { type: 'bulletList', content: [item('uno'), item('dos')] },
      { type: 'orderedList', attrs: { start: 1 }, content: [item('primero')] }
    ])
    const [bullets, numbers] = blocks(content.doc)
    expect(bullets.type).toBe('bulletList')
    expect(bullets.content).toHaveLength(2)
    expect(numbers.type).toBe('orderedList')
  })

  it('avisa del formato directo que no puede conservar', async () => {
    const { warnings } = await roundTrip([
      paragraph([text('centrado')], { textAlign: 'center' }),
      paragraph([text('grande', [{ type: 'textStyle', attrs: { fontSize: '20pt' } }])])
    ])
    expect(warnings).toEqual(['fuentes, tamaños, colores y resaltados aplicados a mano', 'la alineación de 1 párrafo'])
  })

  it('un documento sin formato directo no genera avisos', async () => {
    const { warnings } = await roundTrip([paragraph([text('hola')])])
    expect(warnings).toEqual([])
  })

  it('redacta los avisos en plural cuando toca', () => {
    expect(describeLosses({ alignedParagraphs: 0, formattedRuns: 0, tables: 2, unsupportedImages: 1 })).toEqual([
      '2 tablas (su texto se conserva como párrafos)',
      '1 imagen en formatos que no se pueden mostrar'
    ])
  })
})
