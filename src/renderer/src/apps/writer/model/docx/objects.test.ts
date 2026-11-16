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
