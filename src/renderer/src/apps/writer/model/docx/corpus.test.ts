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
