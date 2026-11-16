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

/** PNG de 4×2 px (lo justo para que Word lo acepte). */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAEUlEQVR42mP8z8DwnwEJMOIUAAD+DgP9KYqPWQAAAABJRU5ErkJggg=='

describe('objetos en .docx', () => {
  it('imagen flotante con tamaño, recorte, giro y texto alternativo', async () => {
    const { xml } = await exported([
      {
        type: 'image',
        attrs: {
          src: PNG,
          alt: 'Gráfico de ventas',
          width: 200,
          height: 100,
          rotation: 90,
          crop: { top: 0, right: 25, bottom: 10, left: 0 },
          wrap: 'square',
          align: 'right'
        }
      },
      paragraph([text('Texto que rodea la imagen.')])
    ])
    expect(xml).toContain('<wp:anchor')
    expect(xml).toContain('<wp:wrapSquare')
    expect(xml).toContain('<wp:align>right</wp:align>')
    expect(xml).toContain('descr="Gráfico de ventas"')
    expect(xml).toContain('rot="5400000"')
    expect(xml).toMatch(/<a:srcRect[^>]*r="25000"/)
    // 200 px = 1905000 EMU
    expect(xml).toContain('cx="1905000"')
  })

  it('una imagen detrás del texto lleva su desplazamiento y behindDoc', async () => {
    const { xml } = await exported([
      { type: 'image', attrs: { src: PNG, width: 40, height: 20, wrap: 'behind', offsetX: 100, offsetY: 50 } }
    ])
    expect(xml).toContain('behindDoc="1"')
    expect(xml).toContain('<wp:wrapNone/>')
    expect(xml).toContain('<wp:posOffset>952500</wp:posOffset>')
    expect(xml).toContain('<wp:posOffset>476250</wp:posOffset>')
  })

  it('una imagen en línea centrada centra su párrafo', async () => {
    const { xml } = await exported([{ type: 'image', attrs: { src: PNG, align: 'center' } }])
    expect(xml).toContain('<wp:inline')
    expect(xml).toContain('<w:jc w:val="center"/>')
  })

  it('formas y cuadros de texto como formas nativas de Word', async () => {
    const { xml } = await exported([
      { type: 'shape', attrs: { kind: 'star', fill: '#5b8bd0', stroke: null, width: 160, height: 100 } },
      {
        type: 'textBox',
        attrs: { width: 240, wrap: 'square', align: 'right', border: '#444444' },
        content: [paragraph([text('Nota al margen')])]
      }
    ])
    expect(xml).toContain('prst="star5"')
    expect(xml).toContain('<a:srgbClr val="5B8BD0"/>')
    expect(xml).toContain('prst="rect"')
    expect(xml).toContain('<wps:txbx>')
    expect(xml).toContain('Nota al margen')
  })

  it('gráficos como gráficos nativos de Word, con sus datos', async () => {
    const data = { categories: ['Norte', 'Sur'], series: [{ name: 'Ventas', values: [12, -3] }] }
    const { bytes, xml } = await exported([
      { type: 'chart', attrs: { kind: 'bar', title: 'Por zona', data, width: 480, height: 300 } },
      { type: 'chart', attrs: { kind: 'pie', data, width: 300, height: 300 } }
    ])
    expect(xml.match(/<c:chart /g)?.length).toBe(2)
    const zip = await JSZip.loadAsync(bytes)
    const charts = Object.keys(zip.files)
      .filter((name) => /^word\/charts\/chart\d+\.xml$/.test(name))
      .sort()
    expect(charts).toHaveLength(2)
    const column = await zip.file(charts[0])!.async('string')
    expect(column).toContain('<c:barDir val="col"/>')
    expect(column).toContain('Por zona')
    expect(column).toContain('Norte')
    const pie = await zip.file(charts[1])!.async('string')
    expect(pie).toContain('c:pieChart')
  })
})

describe('estilos de tabla en .docx', () => {
  const cell = (value: string, attrs: Record<string, unknown> = {}, type = 'tableCell'): JSONContent => ({
    type,
    attrs,
    content: [paragraph([text(value)])]
  })

  it('el estilo pone bordes, encabezado en color y bandas; la celda, su sombreado y bordes', async () => {
    const { xml } = await exported([
      {
        type: 'table',
        attrs: { tableStyle: 'accent' },
        content: [
          { type: 'tableRow', content: [cell('Zona', {}, 'tableHeader'), cell('Ventas', {}, 'tableHeader')] },
          { type: 'tableRow', content: [cell('Norte', { background: '#ffeeaa', borders: 'bottom' }), cell('12')] }
        ]
      }
    ])
    expect(xml).toContain('w:color="8EAADB"') // bordes del estilo
    expect(xml).toContain('w:fill="4472C4"') // encabezado
    expect(xml).toMatch(/<w:color w:val="FFFFFF"\/>/) // texto blanco en el encabezado
    expect(xml).toContain('w:fill="FFEEAA"') // sombreado propio
    expect(xml).toMatch(/<w:tcBorders>.*<w:bottom w:val="single".*<\/w:tcBorders>/s)
  })

  it('"Sin bordes" no escribe líneas', async () => {
    const { xml } = await exported([
      { type: 'table', attrs: { tableStyle: 'plain' }, content: [{ type: 'tableRow', content: [cell('a')] }] }
    ])
    expect(xml).not.toContain('w:val="single"')
  })
})

describe('letra capital en .docx', () => {
  it('la letra va en su marco de Word (framePr dropCap) y el resto, en el párrafo', async () => {
    const { xml } = await exported([paragraph([text('Érase una vez')], { dropCap: 'drop' })])
    expect(xml).toMatch(/<w:framePr [^>]*w:dropCap="drop"[^>]*w:lines="3"/)
    expect(xml).toMatch(/<w:t xml:space="preserve">É<\/w:t>/)
    expect(xml).toContain('rase una vez')
  })
})
