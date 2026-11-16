import JSZip from 'jszip'
// @vitest-environment jsdom
import type { JSONContent } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { cssColorToHex } from '@/core/office/cssValues'
import { createWriterExtensions } from '../../editor/extensions'
import { DEFAULT_PAGE_SETUP, withMargins, withOrientation } from '../pageSetup'
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
  it('conserva tamaño de papel, orientación y márgenes (w:sectPr)', async () => {
    const pageSetup = withMargins(
      withOrientation({ ...DEFAULT_PAGE_SETUP, size: { width: 21.59, height: 27.94 } }, 'landscape'),
      {
        top: 1.27,
        left: 3
      }
    )
    const bytes = await exportDocx({ doc: { type: 'doc', content: [paragraph([text('Hola')])] }, pageSetup })
    const { content } = await importDocx(bytes, createWriterExtensions())
    expect(content.pageSetup).toEqual(pageSetup)
  })

  it('conserva los guiones automáticos (w:autoHyphenation)', async () => {
    const bytes = await exportDocx({ doc: { type: 'doc', content: [paragraph([text('Hola')])] }, hyphenation: true })
    const settings = await (await JSZip.loadAsync(bytes)).file('word/settings.xml')!.async('string')
    expect(settings).toContain('<w:autoHyphenation/>')
    expect((await importDocx(bytes, createWriterExtensions())).content.hyphenation).toBe(true)
    expect((await roundTrip([paragraph([text('Hola')])])).content.hyphenation).toBeUndefined()
  })

  it('cada salto de sección es una sección de Word y vuelve con su hoja', async () => {
    const landscape = withOrientation(DEFAULT_PAGE_SETUP, 'landscape')
    const bytes = await exportDocx({
      doc: {
        type: 'doc',
        content: [
          paragraph([text('Vertical')]),
          { type: 'sectionBreak', attrs: { pageSetup: landscape } },
          paragraph([text('Horizontal')])
        ]
      }
    })
    const xml = await (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string')
    // La primera sección termina en su último párrafo; la segunda, en el cuerpo.
    expect(xml.match(/<w:sectPr/g)).toHaveLength(2)
    expect(xml).toContain('<w:type w:val="nextPage"/>')
    const { content } = await importDocx(bytes, createWriterExtensions())
    expect(content.pageSetup).toBeUndefined()
    expect(blocks(content.doc).map((block) => block.type)).toEqual(['paragraph', 'sectionBreak', 'paragraph'])
    expect(blocks(content.doc)[1].attrs?.pageSetup).toEqual(landscape)
  })

  it('un bloque de columnas es una sección continua con w:cols y vuelve como bloque de columnas', async () => {
    const bytes = await exportDocx({
      doc: {
        type: 'doc',
        content: [
          paragraph([text('Título')]),
          {
            type: 'columns',
            attrs: { count: 2 },
            content: [paragraph([text('Uno')]), { type: 'columnBreak' }, paragraph([text('Dos')])]
          },
          paragraph([text('Final')])
        ]
      }
    })
    const xml = await (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string')
    expect(xml).toContain('<w:type w:val="continuous"/>')
    expect(xml).toMatch(/<w:cols [^>]*w:num="2"/)
    expect(xml).toContain('<w:br w:type="column"/>')
    const { content } = await importDocx(bytes, createWriterExtensions())
    const types = blocks(content.doc).map((block) => block.type)
    expect(types).toEqual(['paragraph', 'columns', 'paragraph'])
    expect(blocks(content.doc)[1].attrs?.count).toBe(2)
  })

  it('conserva primera página y pares distintas (w:titlePg, w:evenAndOddHeaders)', async () => {
    const footer = { text: 'Página {página}', align: 'center' as const }
    const bytes = await exportDocx({
      doc: { type: 'doc', content: [paragraph([text('Hola')])] },
      footer,
      firstPage: {},
      evenPages: { footer: { text: 'Par {página}', align: 'left' } }
    })
    const zip = await JSZip.loadAsync(bytes)
    expect(await zip.file('word/document.xml')!.async('string')).toContain('<w:titlePg/>')
    expect(await zip.file('word/settings.xml')!.async('string')).toContain('<w:evenAndOddHeaders/>')
    const { content } = await importDocx(bytes, createWriterExtensions())
    expect(content.footer).toEqual(footer)
    expect(content.firstPage).toEqual({})
    expect(content.evenPages).toEqual({ footer: { text: 'Par {página}', align: 'left' } })
  })

  it('un A4 con márgenes normales no guarda configuración (es la de siempre)', async () => {
    const { content } = await roundTrip([paragraph([text('Hola')])])
    expect(content.pageSetup).toBeUndefined()
  })

  it('conserva los saltos de página sin añadir párrafos vacíos', async () => {
    const { content } = await roundTrip([
      paragraph([text('Hoja 1')]),
      { type: 'pageBreak' },
      paragraph([text('Hoja 2')])
    ])
    expect(blocks(content.doc).map((block) => block.type)).toEqual(['paragraph', 'pageBreak', 'paragraph'])
  })

  it('conserva la sangría izquierda, la de primera línea y la francesa', async () => {
    const { content } = await roundTrip([
      paragraph([text('Sangrado')], { indent: 1.5, firstLineIndent: 0.75 }),
      paragraph([text('Francesa')], { indent: 1, firstLineIndent: -1.27 })
    ])
    const [indented, hanging] = blocks(content.doc)
    expect(indented.attrs).toMatchObject({ indent: 1.5, firstLineIndent: 0.75 })
    expect(hanging.attrs).toMatchObject({ indent: 1, firstLineIndent: -1.27 })
  })

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
