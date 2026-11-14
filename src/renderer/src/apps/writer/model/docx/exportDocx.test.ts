import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import type { JSONContent } from '@tiptap/core'
import { exportDocx } from './exportDocx'

const text = (value: string, marks: JSONContent['marks'] = []): JSONContent => ({ type: 'text', text: value, marks })
const paragraph = (content: JSONContent[], attrs: Record<string, unknown> = {}): JSONContent => ({
  type: 'paragraph',
  attrs,
  content
})

async function documentXml(content: JSONContent[]): Promise<string> {
  const bytes = await exportDocx({ doc: { type: 'doc', content } })
  const zip = await JSZip.loadAsync(bytes)
  return zip.file('word/document.xml')!.async('string')
}

describe('exportDocx', () => {
  it('genera un .docx válido aunque el documento esté vacío', async () => {
    const bytes = await exportDocx({ doc: { type: 'doc', content: [] } })
    // Un .docx es un zip: empieza por "PK".
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK')
    const zip = await JSZip.loadAsync(bytes)
    expect(zip.file('word/document.xml')).not.toBeNull()
  })

  it('conserva el formato de carácter', async () => {
    const xml = await documentXml([
      paragraph([
        text('negrita', [{ type: 'bold' }]),
        text('roja', [
          { type: 'textStyle', attrs: { color: '#ff0000', fontSize: '18pt', fontFamily: 'Georgia, serif' } }
        ]),
        text('resaltado', [{ type: 'highlight', attrs: { color: '#fff176' } }])
      ])
    ])
    expect(xml).toContain('<w:b/>')
    expect(xml).toContain('<w:color w:val="FF0000"/>')
    expect(xml).toContain('<w:sz w:val="36"/>')
    expect(xml).toContain('w:ascii="Georgia"')
    expect(xml).toContain('w:fill="FFF176"')
  })

  it('mapea títulos y estilos de párrafo a los estilos de Word', async () => {
    const xml = await documentXml([
      { type: 'heading', attrs: { level: 2 }, content: [text('Sección')] },
      paragraph([text('Gran título')], { blockStyle: 'title' }),
      paragraph([text('Una cita')], { blockStyle: 'quote', textAlign: 'center' })
    ])
    expect(xml).toContain('<w:pStyle w:val="Heading2"/>')
    expect(xml).toContain('<w:pStyle w:val="Title"/>')
    expect(xml).toContain('<w:pStyle w:val="Quote"/>')
    expect(xml).toContain('<w:jc w:val="center"/>')
  })

  it('convierte listas anidadas en niveles de numeración', async () => {
    const item = (label: string, nested?: JSONContent): JSONContent => ({
      type: 'listItem',
      content: [paragraph([text(label)]), ...(nested ? [nested] : [])]
    })
    const xml = await documentXml([
      {
        type: 'orderedList',
        attrs: { start: 3 },
        content: [item('uno', { type: 'orderedList', attrs: { start: 1 }, content: [item('uno.a')] })]
      }
    ])
    expect(xml.match(/<w:numPr>/g)).toHaveLength(2)
    expect(xml).toContain('<w:ilvl w:val="0"/>')
    expect(xml).toContain('<w:ilvl w:val="1"/>')
  })

  it('incluye enlaces e imágenes', async () => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const bytes = await exportDocx({
      doc: {
        type: 'doc',
        content: [
          paragraph([text('web', [{ type: 'link', attrs: { href: 'https://example.com' } }])]),
          { type: 'image', attrs: { src: png, alt: 'punto' } }
        ]
      }
    })
    const zip = await JSZip.loadAsync(bytes)
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('<w:hyperlink')
    expect(xml).toContain('<pic:pic')
    expect(Object.keys(zip.files).some((name) => name.startsWith('word/media/'))).toBe(true)
  })
})
