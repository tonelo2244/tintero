import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { createShapeElement, createSlide, createTextElement } from '../factories'
import { SLIDE_THEMES } from '../themes'
import type { Presentation } from '../types'
import { mixColors, parseBackground } from './background'
import { exportPptx } from './exportPptx'

async function unzip(presentation: Presentation) {
  return JSZip.loadAsync(await exportPptx(presentation))
}

const read = (zip: JSZip, path: string) => zip.file(path)!.async('string')

describe('fondos de tema -> franjas', () => {
  it('un color sólido es una sola franja', () => {
    expect(parseBackground('#8796a0')).toEqual({ axis: 'x', bands: [{ start: 0, end: 1, color: '8796A0' }] })
  })

  it('respeta los cortes bruscos y promedia los tramos con degradado', () => {
    const bosque = parseBackground('linear-gradient(90deg, #1c2a22 0%, #1f3326 78%, #6fa35a 78%, #b6d98c 100%)')
    expect(bosque.axis).toBe('x')
    expect(bosque.bands).toEqual([
      { start: 0, end: 0.78, color: mixColors('1C2A22', '1F3326') },
      { start: 0.78, end: 1, color: mixColors('6FA35A', 'B6D98C') }
    ])
  })

  it('alarga la última parada hasta el final y detecta degradados verticales', () => {
    expect(parseBackground('linear-gradient(90deg, #c62f26 0%, #c62f26 2.5%, #ffffff 2.5%)').bands).toEqual([
      { start: 0, end: 0.025, color: 'C62F26' },
      { start: 0.025, end: 1, color: 'FFFFFF' }
    ])
    expect(parseBackground('linear-gradient(180deg, #f4efe6 0%, #e9dfcf 82%, #8a6a4a 82%)').axis).toBe('y')
  })

  it('entiende todos los temas incluidos', () => {
    for (const theme of SLIDE_THEMES) expect(parseBackground(theme.background).bands.length).toBeGreaterThan(0)
  })
})

describe('exportPptx', () => {
  it('crea una diapositiva por cada una del documento, con su texto y sus notas', async () => {
    const first = createSlide('title')
    first.elements = [createTextElement('title', { x: 80, y: 200, width: 1120, height: 160 }, { text: 'Hola' })]
    first.notes = 'Saludar al público'
    const second = createSlide('blank')
    second.elements = [createShapeElement('star')]

    const zip = await unzip({ themeId: 'bosque', slides: [first, second] })
    const slideFiles = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    expect(slideFiles).toHaveLength(2)

    const slide1 = await read(zip, 'ppt/slides/slide1.xml')
    expect(slide1).toContain('<a:t>Hola</a:t>')
    // Bosque: título en blanco y fuente Georgia.
    expect(slide1).toContain('<a:srgbClr val="FFFFFF"/>')
    expect(slide1).toContain('typeface="Georgia"')

    expect(await read(zip, 'ppt/slides/slide2.xml')).toContain('prst="star5"')
    const notes = Object.keys(zip.files).find((name) => name.startsWith('ppt/notesSlides/notesSlide1'))
    expect(await read(zip, notes!)).toContain('Saludar al público')
  })

  it('omite los cuadros vacíos (su texto de ayuda solo existe en el editor)', async () => {
    const slide = createSlide('title')
    const zip = await unzip({ themeId: 'blank', slides: [slide] })
    expect(await read(zip, 'ppt/slides/slide1.xml')).not.toContain('Haga clic')
  })

  it('las viñetas son un párrafo por línea', async () => {
    const slide = createSlide('blank')
    slide.elements = [
      createTextElement(
        'body',
        { x: 0, y: 0, width: 600, height: 300 },
        { text: 'uno\ndos\ntres', style: { bullets: true } }
      )
    ]
    const xml = await read(await unzip({ themeId: 'blank', slides: [slide] }), 'ppt/slides/slide1.xml')
    expect(xml.match(/<a:buChar/g)).toHaveLength(3)
  })
})
