import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import type { JSONContent } from '@tiptap/core'
import { exportDocx } from './exportDocx'
import type { WriterContent } from '../content'
import type { Source } from '../citations'

const text = (value: string): JSONContent => ({ type: 'text', text: value })
const bookmark = (name: string): JSONContent => ({ type: 'bookmark', attrs: { name } })
const sequence = (label: string): JSONContent => ({ type: 'sequence', attrs: { label } })

async function exported(content: JSONContent[], extra: Partial<WriterContent> = {}) {
  const zip = await JSZip.loadAsync(await exportDocx({ doc: { type: 'doc', content }, ...extra }))
  const part = (path: string) => zip.file(path)?.async('string') ?? Promise.resolve('')
  return { document: await part('word/document.xml'), part, zip }
}

const caption = (anchor: string, label: string, caption: string): JSONContent => ({
  type: 'paragraph',
  attrs: { blockStyle: 'caption' },
  content: [bookmark(anchor), text(`${label} `), sequence(label), text(`: ${caption}`)]
})

describe('referencias en .docx (fase 17)', () => {
  it('las notas van a footnotes.xml y endnotes.xml', async () => {
    const { document, part } = await exported([
      {
        type: 'paragraph',
        content: [
          text('Texto'),
          { type: 'note', attrs: { id: 'a', kind: 'footnote', text: 'Una nota al pie' } },
          { type: 'note', attrs: { id: 'b', kind: 'endnote', text: 'Una nota al final' } }
        ]
      }
    ])
    expect(document).toContain('<w:footnoteReference w:id="1"/>')
    expect(document).toContain('<w:endnoteReference')
    expect(await part('word/footnotes.xml')).toContain('Una nota al pie')
    expect(await part('word/endnotes.xml')).toContain('Una nota al final')
  })

  it('los títulos son campos SEQ y el marcador envuelve rótulo y texto', async () => {
    const { document } = await exported([caption('_Ref1', 'Figura', 'Uno'), caption('_Ref2', 'Figura', 'Dos')])
    expect(document).toContain('SEQ Figura \\* ARABIC')
    // El segundo título vale 2 aunque el campo se escriba antes de que Word lo calcule.
    expect(document).toMatch(/SEQ Figura[^]*?>1<[^]*SEQ Figura[^]*?>2</)
    expect(document).toContain('w:name="_Ref1_n"')
    expect(document).toContain('w:name="_Ref1_c"')
  })

  it('las referencias cruzadas son REF y PAGEREF con su valor escrito', async () => {
    const { document, part } = await exported([
      caption('_Ref1', 'Tabla', 'Ventas'),
      {
        type: 'paragraph',
        content: [
          text('Ver '),
          { type: 'crossReference', attrs: { anchor: '_Ref1', show: 'labelNumber' } },
          text(' en la página '),
          { type: 'crossReference', attrs: { anchor: '_Ref1', show: 'page' } }
        ]
      }
    ])
    expect(document).toContain('REF _Ref1_n \\h')
    expect(document).toContain('Tabla 1')
    expect(document).toContain('PAGEREF _Ref1 \\h')
    expect(await part('word/settings.xml')).toContain('updateFields')
  })

  it('la tabla de contenido es un campo TOC con sus entradas', async () => {
    const { document } = await exported([
      {
        type: 'tableOfContents',
        attrs: {
          source: 'headings',
          levels: 2,
          entries: [{ level: 1, text: 'Introducción', anchor: '_Ref9', page: 3 }]
        }
      },
      { type: 'heading', attrs: { level: 1 }, content: [bookmark('_Ref9'), text('Introducción')] }
    ])
    expect(document).toContain('TOC \\h \\o &quot;1-2&quot;')
    expect(document).toContain('Introducción')
    expect(document).toContain('w:name="_Ref9"')
  })

  it('las citas y la bibliografía son las de Word, con las fuentes en el documento', async () => {
    const source: Source = {
      id: 'Gar20',
      type: 'book',
      authors: [{ family: 'García', given: 'Ana' }],
      title: 'Libro',
      year: '2020'
    }
    const { document, zip } = await exported(
      [
        {
          type: 'paragraph',
          content: [text('Dice '), { type: 'citation', attrs: { sourceId: 'Gar20', pages: '12' } }]
        },
        { type: 'paragraph', content: [{ type: 'citation', attrs: { sourceId: 'Borrada', pages: '' } }] },
        { type: 'bibliography', attrs: { title: 'Referencias' } }
      ],
      { sources: [source], citationStyle: 'apa' }
    )
    expect(document).toContain('CITATION Gar20')
    expect(document).toContain('BIBLIOGRAPHY')
    expect(document).toContain('(Fuente no encontrada)')
    const customXml = await Promise.all(
      Object.keys(zip.files)
        .filter((path) => path.startsWith('customXml/item') && !path.includes('Props'))
        .map((path) => zip.file(path)!.async('string'))
    )
    expect(customXml.join('')).toContain('García')
  })
})
