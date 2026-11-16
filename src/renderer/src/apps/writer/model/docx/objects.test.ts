// @vitest-environment jsdom
import JSZip from 'jszip'
import type { JSONContent } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { createWriterExtensions } from '../../editor/extensions'
import { exportDocx } from './exportDocx'
import { importDocx } from './importDocx'

/** Fase 16: objetos y vínculos en el .docx (ida y vuelta con nuestro propio exportador). */

const text = (value: string, marks: JSONContent['marks'] = []): JSONContent => ({ type: 'text', text: value, marks })
const paragraph = (content: JSONContent[], attrs: Record<string, unknown> = {}): JSONContent => ({
  type: 'paragraph',
  attrs,
  content
})

async function exported(content: JSONContent[]) {
  const bytes = await exportDocx({ doc: { type: 'doc', content } })
  const zip = await JSZip.loadAsync(bytes)
  return { bytes, xml: await zip.file('word/document.xml')!.async('string') }
}

/** Todos los nodos de un tipo, a cualquier profundidad. */
function nodesOfType(node: JSONContent, type: string): JSONContent[] {
  return [...(node.type === type ? [node] : []), ...(node.content ?? []).flatMap((child) => nodesOfType(child, type))]
}

describe('vínculos y marcadores en .docx', () => {
  it('escribe el marcador y el vínculo interno, y los recupera al importar', async () => {
    const { bytes, xml } = await exported([
      paragraph([{ type: 'bookmark', attrs: { name: 'Conclusiones' } }, text('Conclusiones')]),
      paragraph([
        text('Ver las conclusiones', [{ type: 'link', attrs: { href: '#Conclusiones' } }]),
        text(' y la web', [{ type: 'link', attrs: { href: 'https://tintero.app' } }])
      ])
    ])
    expect(xml).toContain('w:bookmarkStart')
    expect(xml).toContain('w:name="Conclusiones"')
    expect(xml).toContain('w:anchor="Conclusiones"')

    const { content } = await importDocx(bytes, createWriterExtensions())
    expect(nodesOfType(content.doc, 'bookmark').map((node) => node.attrs?.name)).toEqual(['Conclusiones'])
    const hrefs = nodesOfType(content.doc, 'text').flatMap((node) =>
      (node.marks ?? []).filter((mark) => mark.type === 'link').map((mark) => mark.attrs?.href)
    )
    expect(hrefs).toEqual(['#Conclusiones', 'https://tintero.app'])
  })
})

describe('campos en .docx', () => {
  it('escribe w:fldSimple con la instrucción de Word y los vuelve a leer como campos', async () => {
    const kinds = ['date', 'page', 'pages', 'fileName', 'author']
    const { bytes, xml } = await exported([
      paragraph(kinds.flatMap((kind) => [text(`${kind}: `), { type: 'field', attrs: { kind } }]))
    ])
    expect(xml).toContain('w:instr="PAGE"')
    expect(xml).toContain('w:instr="NUMPAGES"')
    expect(xml).toContain('w:instr="AUTHOR"')

    const { content } = await importDocx(bytes, createWriterExtensions())
    expect(nodesOfType(content.doc, 'field').map((node) => node.attrs?.kind)).toEqual(kinds)
  })

  it('reconoce los campos "complejos" que escribe Word (fldChar + instrText)', async () => {
    const { bytes } = await exported([paragraph([text('Página '), text('9')])])
    const zip = await JSZip.loadAsync(bytes)
    const xml = await zip.file('word/document.xml')!.async('string')
    const complex =
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>9</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>'
    zip.file('word/document.xml', xml.replace(/<w:r>(?:(?!<w:r>).)*?<w:t[^>]*>9<\/w:t><\/w:r>/, complex))
    const patched = await zip.generateAsync({ type: 'uint8array' })

    const { content } = await importDocx(patched, createWriterExtensions())
    const first = content.doc.content?.[0]
    expect(first?.content?.map((node) => node.type)).toEqual(['text', 'field'])
    expect(first?.content?.[1].attrs?.kind).toBe('page')
  })
})
