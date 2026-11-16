// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { JSONContent } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { cssColorToHex } from '@/core/office/cssValues'
import { createWriterExtensions } from '../../editor/extensions'
import { importDocx } from './importDocx'

/**
 * Corpus de fixtures/office: archivos escritos por otros programas (ver generar.py).
 * Cada archivo comprueba lo que ya sabemos conservar; si una mejora rompe algo, salta aquí.
 */
const fixture = (name: string) => new Uint8Array(readFileSync(resolve('fixtures/office', name)))

const textOf = (node: JSONContent): string => node.text ?? (node.content ?? []).map(textOf).join('')
const findBlock = (doc: JSONContent, text: string) => (doc.content ?? []).find((block) => textOf(block) === text)
const findText = (doc: JSONContent, text: string): JSONContent | undefined => {
  for (const block of doc.content ?? []) {
    const found = (block.content ?? []).find((node) => node.text === text)
    if (found) return found
  }
  return undefined
}
const markAttrs = (node: JSONContent | undefined, type: string) =>
  node?.marks?.find((mark) => mark.type === type)?.attrs

describe.each(['word-formato-directo.docx', 'libreoffice-formato-directo.docx'])('corpus: %s', (name) => {
  it('conserva la alineación de cada párrafo', async () => {
    const { content } = await importDocx(fixture(name), createWriterExtensions())
    expect(findBlock(content.doc, 'Texto centrado')?.attrs?.textAlign).toBe('center')
    expect(findBlock(content.doc, 'Texto justificado con varias palabras')?.attrs?.textAlign).toBe('justify')
    expect(findBlock(content.doc, 'Firma')?.attrs?.textAlign).toBe('right')
  })

  it('conserva fuente, tamaño, color y resaltado', async () => {
    const { content } = await importDocx(fixture(name), createWriterExtensions())
    const big = markAttrs(findText(content.doc, 'Arial 16 rojo'), 'textStyle')
    expect(big?.fontFamily).toMatch(/^Arial/)
    expect(big?.fontSize).toBe('16pt')
    expect(cssColorToHex(big?.color)).toBe('C0392B')
    expect(cssColorToHex(markAttrs(findText(content.doc, 'resaltado'), 'highlight')?.color)).toBe('FFFF00')
    // El texto sin formato no hereda nada.
    expect(findText(content.doc, 'Normal, ')?.marks ?? []).toEqual([])
  })

  it('lee encabezado, pie con número de página y comentarios', async () => {
    const { content, warnings } = await importDocx(fixture(name), createWriterExtensions())
    expect(warnings).toEqual([])
    expect(content.header).toEqual({ text: 'Informe trimestral', align: 'center' })
    expect(content.footer).toEqual({ text: 'Página {página} de {páginas}', align: 'right' })
    expect(content.comments).toEqual([expect.objectContaining({ author: 'Ana', text: '¿De dónde sale este dato?' })])
    const commented = findText(content.doc, 'ventas')
    expect(markAttrs(commented, 'comment')?.commentId).toBe(content.comments?.[0].id)
  })
})

describe.each(['word-pagina.docx', 'libreoffice-pagina.docx'])('corpus: %s (fase 12)', (name) => {
  it('lee el papel, la orientación y los márgenes de w:sectPr', async () => {
    const { content } = await importDocx(fixture(name), createWriterExtensions())
    expect(content.pageSetup).toEqual({
      size: { width: 21.59, height: 27.94 },
      orientation: 'landscape',
      margins: { top: 2, right: 1.5, bottom: 2, left: 3 }
    })
  })

  it('convierte el salto de página en su nodo, sin párrafos vacíos alrededor', async () => {
    const { content } = await importDocx(fixture(name), createWriterExtensions())
    const types = (content.doc.content ?? []).map((block) => block.type)
    const texts = (content.doc.content ?? []).map(textOf)
    expect(types.filter((type) => type === 'pageBreak')).toHaveLength(1)
    expect(texts[types.indexOf('pageBreak') + 1]).toBe('Segunda hoja')
  })

  it('lee la sangría izquierda, la de primera línea y la francesa', async () => {
    const { content } = await importDocx(fixture(name), createWriterExtensions())
    const indented = findBlock(content.doc, 'Sangría izquierda y primera línea')?.attrs
    expect(indented?.indent * 1.27).toBeCloseTo(2, 2)
    expect(indented?.firstLineIndent).toBe(1)
    expect(findBlock(content.doc, 'Sangría francesa')?.attrs).toMatchObject({ indent: 1, firstLineIndent: -1.27 })
  })
})

describe.each(['word-estilos.docx', 'libreoffice-estilos.docx'])('corpus: %s (fase 13)', (name) => {
  it('toma los estilos del archivo: el Título 1 modificado y los propios que se usan', async () => {
    const { content } = await importDocx(fixture(name), createWriterExtensions())
    const styles = content.styles ?? []
    expect(styles.find((style) => style.id === 'heading-1')?.props).toMatchObject({ fontSize: 20, color: '#7b1fa2' })
    const notice = styles.find((style) => style.name === 'Aviso')
    expect(notice).toMatchObject({ type: 'paragraph', props: { italic: true, color: '#c0392b', spaceAfter: 4 } })
    const key = styles.find((style) => style.name === 'Clave')
    expect(key).toMatchObject({ type: 'character', props: { bold: true } })
    const paragraph = findBlock(content.doc, 'Ojo: importante')
    expect(paragraph?.attrs?.blockStyle).toBe(notice?.id)
    const marked = paragraph?.content?.find((node) => node.text === 'importante')
    expect(markAttrs(marked, 'charStyle')?.styleId).toBe(key?.id)
    expect((content.doc.content ?? []).find((block) => textOf(block) === 'Detalle')).toMatchObject({
      type: 'heading',
      attrs: { level: 5 }
    })
  })

  it('lee tabulaciones con relleno, espaciado, sangría derecha, bordes y sombreado', async () => {
    const { content } = await importDocx(fixture(name), createWriterExtensions())
    const index = (content.doc.content ?? []).find((block) => block.content?.some((node) => node.type === 'tab'))
    expect(index?.attrs?.tabStops).toEqual([{ position: 8, align: 'right', leader: 'dot' }])
    expect(findBlock(content.doc, 'Párrafo con borde y sombreado')?.attrs).toMatchObject({
      spaceBefore: 6,
      spaceAfter: 0,
      indentRight: 2,
      border: 'box',
      shading: '#ffeeaa'
    })
  })
})
