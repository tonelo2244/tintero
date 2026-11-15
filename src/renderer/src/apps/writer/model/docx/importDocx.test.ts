// @vitest-environment jsdom
import type { JSONContent } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { cssColorToHex } from '@/core/office/cssValues'
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

  it('conserva fuente, tamaño, color, resaltado y alineación aplicados a mano', async () => {
    const { content, warnings } = await roundTrip([
      paragraph([text('centrado')], { textAlign: 'center' }),
      paragraph([text('a la derecha')], { textAlign: 'right' }),
      paragraph([
        text('normal '),
        text('grande', [
          { type: 'textStyle', attrs: { fontSize: '20pt', fontFamily: 'Georgia, serif', color: '#c0392b' } }
        ]),
        text(' y '),
        text('resaltado', [{ type: 'highlight', attrs: { color: '#fff176' } }])
      ])
    ])
    expect(warnings).toEqual([])
    const [centered, right, mixed] = blocks(content.doc)
    expect(centered.attrs?.textAlign).toBe('center')
    expect(right.attrs?.textAlign).toBe('right')
    expect(mixed.content?.map((node) => node.text)).toEqual(['normal ', 'grande', ' y ', 'resaltado'])
    expect(mixed.content?.[0].marks ?? []).toEqual([])
    const style = mixed.content?.[1].marks?.find((mark) => mark.type === 'textStyle')?.attrs
    expect(style).toMatchObject({ fontSize: '20pt', fontFamily: 'Georgia, serif' })
    expect(cssColorToHex(style?.color)).toBe('C0392B')
    const highlight = mixed.content?.[3].marks?.find((mark) => mark.type === 'highlight')?.attrs
    expect(cssColorToHex(highlight?.color)).toBe('FFF176')
  })

  it('conserva encabezado, pie con número de página y comentarios', async () => {
    const bytes = await exportDocx({
      doc: {
        type: 'doc',
        content: [
          paragraph([
            text('Antes '),
            text('comentado', [{ type: 'comment', attrs: { commentId: 'c1' } }]),
            text(' después')
          ])
        ]
      },
      header: { text: 'Informe anual', align: 'center' },
      footer: { text: 'Página {página} de {páginas}', align: 'right' },
      comments: [{ id: 'c1', author: 'Ana', date: '2026-11-15T10:00:00.000Z', text: 'Revisar esta cifra' }]
    })
    const { content, warnings } = await importDocx(bytes, createWriterExtensions())
    expect(warnings).toEqual([])
    expect(content.header).toEqual({ text: 'Informe anual', align: 'center' })
    expect(content.footer).toEqual({ text: 'Página {página} de {páginas}', align: 'right' })
    expect(content.comments).toHaveLength(1)
    const [comment] = content.comments ?? []
    expect(comment).toMatchObject({ author: 'Ana', text: 'Revisar esta cifra' })
    const [first] = blocks(content.doc)
    const commented = first.content?.find((node) => node.marks?.some((mark) => mark.type === 'comment'))
    expect(commented?.text).toBe('comentado')
    expect(commented?.marks?.find((mark) => mark.type === 'comment')?.attrs?.commentId).toBe(comment.id)
    expect(first.content?.map((node) => node.text).join('')).toBe('Antes comentado después')
  })

  it('un documento sin formato directo no genera avisos', async () => {
    const { warnings } = await roundTrip([paragraph([text('hola')])])
    expect(warnings).toEqual([])
  })

  it('redacta los avisos en plural cuando toca', () => {
    expect(describeLosses({ alignedParagraphs: 3, unsupportedImages: 2 })).toEqual([
      'la alineación de 3 párrafos dentro de listas',
      '2 imágenes en formatos que no se pueden mostrar'
    ])
  })

  it('reconstruye tablas con fila de encabezado y celdas combinadas', async () => {
    const cell = (type: string, label: string, attrs: Record<string, unknown> = {}): JSONContent => ({
      type,
      attrs,
      content: [paragraph([text(label)])]
    })
    const { content, warnings } = await roundTrip([
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: [cell('tableHeader', 'Producto'), cell('tableHeader', 'Precio')] },
          { type: 'tableRow', content: [cell('tableCell', 'Total', { colspan: 2 })] }
        ]
      }
    ])
    const [table] = blocks(content.doc)
    expect(table.type).toBe('table')
    const [header, total] = table.content ?? []
    expect(header.content?.map((item) => item.type)).toEqual(['tableHeader', 'tableHeader'])
    expect(total.content?.[0]).toMatchObject({ type: 'tableCell', attrs: { colspan: 2 } })
    expect(warnings).toEqual([])
  })
})
