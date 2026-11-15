// @vitest-environment jsdom
// jsdom y no happy-dom: happy-dom pierde atributos con prefijo cuando coinciden con otro
// (en <p:sldId id="256" r:id="rId1"/> se queda solo con uno), y el lector depende de ambos.
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { createShapeElement, createSlide, createTextElement } from '../factories'
import { plainText } from '../richText'
import type { Presentation, ShapeElement, TextElement } from '../types'
import { exportPptx } from './exportPptx'
import { importPptx } from './importPptx'

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const EMU = 9525 // por píxel

const rels = (items: [id: string, type: string, target: string][]) =>
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items
    .map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`)
    .join('')}</Relationships>`

const xfrm = (x: number, y: number, w: number, h: number) =>
  `<a:xfrm><a:off x="${x * EMU}" y="${y * EMU}"/><a:ext cx="${w * EMU}" cy="${h * EMU}"/></a:xfrm>`

/**
 * .pptx mínimo escrito a mano: el título de la diapositiva NO tiene posición ni tamaño de letra,
 * así que debe heredarlos del diseño (posición) y del patrón (44 pt, centrado).
 */
async function handmadePptx(slideShapes: string): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    'ppt/presentation.xml',
    `<p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="${1280 * EMU}" cy="${720 * EMU}"/></p:presentation>`
  )
  zip.file('ppt/_rels/presentation.xml.rels', rels([['rId1', 'slide', 'slides/slide1.xml']]))
  zip.file('ppt/slides/slide1.xml', `<p:sld ${NS}><p:cSld><p:spTree>${slideShapes}</p:spTree></p:cSld></p:sld>`)
  zip.file('ppt/slides/_rels/slide1.xml.rels', rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']]))
  zip.file(
    'ppt/slideLayouts/slideLayout1.xml',
    `<p:sldLayout ${NS}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="t"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr>${xfrm(100, 50, 1080, 120)}</p:spPr></p:sp></p:spTree></p:cSld></p:sldLayout>`
  )
  zip.file(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']])
  )
  zip.file(
    'ppt/slideMasters/slideMaster1.xml',
    `<p:sldMaster ${NS}><p:cSld><p:spTree/></p:cSld><p:txStyles><p:titleStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:buChar char="•"/><a:defRPr sz="2800"/></a:lvl1pPr></p:bodyStyle></p:txStyles></p:sldMaster>`
  )
  return zip.generateAsync({ type: 'uint8array' })
}

const titlePlaceholder = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Título"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>Resultados</a:t></a:r></a:p></p:txBody></p:sp>`

describe('importPptx con un archivo escrito a mano', () => {
  it('hereda posición del diseño y tamaño/alineación del patrón', async () => {
    const { content, warnings } = await importPptx(await handmadePptx(titlePlaceholder))
    const [title] = content.slides[0].elements as TextElement[]
    expect(title).toMatchObject({
      type: 'text',
      role: 'title',
      paragraphs: [{ runs: [{ text: 'Resultados' }] }],
      x: 100,
      y: 50,
      width: 1080,
      height: 120
    })
    // 44 pt = 58,7 px
    expect(title.style).toMatchObject({ fontSize: 59, align: 'center', verticalAlign: 'middle' })
    expect(warnings).toEqual([])
  })

  it('coloca las formas de un grupo según la transformación del grupo', async () => {
    // El grupo ocupa (200,100) con 400x200 y sus hijos están en un espacio de 200x100: escala x2.
    const group = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="5" name="g"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${200 * EMU}" y="${100 * EMU}"/><a:ext cx="${400 * EMU}" cy="${200 * EMU}"/><a:chOff x="0" y="0"/><a:chExt cx="${200 * EMU}" cy="${100 * EMU}"/></a:xfrm></p:grpSpPr>
      <p:sp><p:nvSpPr><p:cNvPr id="6" name="e"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(50, 25, 50, 50)}<a:prstGeom prst="ellipse"/><a:solidFill><a:srgbClr val="228844"/></a:solidFill></p:spPr></p:sp></p:grpSp>`
    const { content } = await importPptx(await handmadePptx(group))
    const [ellipse] = content.slides[0].elements as ShapeElement[]
    expect(ellipse).toMatchObject({ type: 'shape', shape: 'ellipse', x: 300, y: 150, width: 100, height: 100 })
    expect(ellipse.style.fill).toBe('#228844')
  })

  it('avisa de lo que no puede importar', async () => {
    const rotated = `<p:sp><p:nvSpPr><p:cNvPr id="3" name="r"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm rot="1800000"><a:off x="0" y="0"/><a:ext cx="${EMU * 10}" cy="${EMU * 10}"/></a:xfrm><a:prstGeom prst="heart"/><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></p:spPr></p:sp>`
    const table = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="t"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr></p:graphicFrame>`
    const mixed = `<p:sp><p:nvSpPr><p:cNvPr id="7" name="m"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 300, 400, 80)}</p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:t>normal </a:t></a:r><a:r><a:rPr b="1"/><a:t>negrita</a:t></a:r></a:p></p:txBody></p:sp>`
    const { content, warnings } = await importPptx(await handmadePptx(rotated + table + mixed))
    expect(content.slides[0].elements.map((element) => element.type)).toEqual(['shape', 'text'])
    expect(warnings).toEqual([
      '1 tabla, gráfico o SmartArt',
      '1 forma o línea sin equivalente (se omiten o pasan a rectángulo)',
      'el giro de 1 elemento'
    ])
  })

  it('conserva el formato por palabra (negrita, color, tamaño) y los saltos de línea', async () => {
    const runs =
      '<a:r><a:rPr sz="2000"/><a:t>Precio: </a:t></a:r>' +
      '<a:r><a:rPr sz="2000" b="1"><a:solidFill><a:srgbClr val="C00000"/></a:solidFill></a:rPr><a:t>gratis</a:t></a:r>' +
      '<a:br/><a:r><a:rPr sz="3000" i="1"/><a:t>oferta</a:t></a:r>'
    const shape = `<p:sp><p:nvSpPr><p:cNvPr id="8" name="w"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 0, 400, 120)}</p:spPr><p:txBody><a:bodyPr/><a:p>${runs}</a:p></p:txBody></p:sp>`
    const { content, warnings } = await importPptx(await handmadePptx(shape))
    const [text] = content.slides[0].elements as TextElement[]
    // El primer trozo marca el formato del cuadro; el resto guarda solo lo que cambia.
    expect(text.style).toMatchObject({ bold: false, fontSize: 27 })
    expect(text.paragraphs).toEqual([
      { runs: [{ text: 'Precio: ' }, { text: 'gratis', bold: true, color: '#C00000' }] },
      { runs: [{ text: 'oferta', italic: true, fontSize: 40 }] }
    ])
    expect(warnings).toEqual([])
  })

  it('rechaza un zip que no es una presentación', async () => {
    const zip = new JSZip()
    zip.file('hola.txt', 'hola')
    await expect(importPptx(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/no es una presentación/)
  })
})

describe('importPptx (ida y vuelta con exportPptx)', () => {
  it('recupera posiciones, textos, viñetas, formas y notas', async () => {
    const slide = createSlide('blank')
    const star = createShapeElement('star', { x: 900, y: 400, width: 200, height: 180 })
    star.style = { fill: '#3366cc', stroke: null, strokeWidth: 0 }
    slide.elements = [
      createTextElement(
        'free',
        { x: 80, y: 60, width: 700, height: 200 },
        { text: 'uno\ndos', style: { bullets: true, fontSize: 32, bold: true } }
      ),
      star
    ]
    slide.notes = 'Recordar la demo'
    const original: Presentation = { themeId: 'blank', slides: [slide] }

    const { content, warnings } = await importPptx(await exportPptx(original))
    const [text, shape] = content.slides[0].elements as [TextElement, ShapeElement]
    expect(text).toMatchObject({ x: 80, y: 60, width: 700, height: 200 })
    expect(plainText(text.paragraphs)).toBe('uno\ndos')
    expect(text.style).toMatchObject({ bullets: true, fontSize: 32, bold: true })
    expect(shape).toMatchObject({ shape: 'star', x: 900, y: 400, width: 200, height: 180 })
    expect(shape.style.fill).toBe('#3366CC')
    expect(content.slides[0].notes).toBe('Recordar la demo')
    expect(warnings).toEqual([])
  })

  it('recupera el formato por palabra exportado', async () => {
    const slide = createSlide('blank')
    const paragraphs = [
      { runs: [{ text: 'Tintero ' }, { text: 'es', italic: true }, { text: ' local', bold: true, color: '#C00000' }] },
      { runs: [{ text: 'sin nube', underline: true, fontSize: 40 }] }
    ]
    slide.elements = [createTextElement('free', { x: 80, y: 60, width: 700, height: 200 }, { paragraphs })]
    const { content } = await importPptx(await exportPptx({ themeId: 'blank', slides: [slide] }))
    const [text] = content.slides[0].elements as TextElement[]
    expect(text.paragraphs).toEqual(paragraphs)
  })

  it('un tema con fondo de color avisa de que el fondo no se importa', async () => {
    const slide = createSlide('blank')
    const { warnings } = await importPptx(await exportPptx({ themeId: 'pizarra', slides: [slide] }))
    expect(warnings).toContain('el fondo y los colores del tema (se aplica el tema Blanco)')
  })
})
