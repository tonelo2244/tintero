import PptxGenJS from 'pptxgenjs'
import { cssColorToHex, cssFontToName } from '@/core/office/cssValues'
import { getTheme, type SlideTheme } from '../themes'
import {
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type ImageElement,
  type Presentation,
  type ShapeElement,
  type ShapeKind,
  type TextElement
} from '../types'
import { parseBackground } from './background'

/**
 * Convierte una presentación de Tintero en un .pptx.
 *
 * El modelo de Tintero (cajas con posición absoluta sobre una diapositiva de 1280x720) encaja
 * casi 1:1 con el de PowerPoint, así que la conversión es sobre todo un cambio de unidades:
 * nuestras unidades son píxeles a 96 ppp, y 1280 px = 13,33 pulgadas = el formato panorámico.
 */
const PX_PER_INCH = 96
const PT_PER_PX = 0.75
const inches = (px: number) => px / PX_PER_INCH
const points = (px: number) => Math.round(px * PT_PER_PX * 10) / 10

/** Relleno interior de los cuadros de texto (CSS: padding 8px 12px), en puntos. */
const TEXT_MARGIN_PT: [number, number, number, number] = [points(12), points(12), points(8), points(8)]

const SHAPES: Record<ShapeKind, PptxGenJS.SHAPE_NAME> = {
  rect: 'rect',
  roundRect: 'roundRect',
  ellipse: 'ellipse',
  triangle: 'triangle',
  diamond: 'diamond',
  arrow: 'rightArrow',
  star: 'star5'
}

export async function exportPptx(presentation: Presentation): Promise<Uint8Array> {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'TINTERO_16x9', width: inches(SLIDE_WIDTH), height: inches(SLIDE_HEIGHT) })
  pptx.layout = 'TINTERO_16x9'
  pptx.author = 'Tintero'

  const theme = getTheme(presentation.themeId)
  // El fondo del tema va en un "patrón" (master): así no se puede mover por accidente en PowerPoint.
  const master = `Tintero · ${theme.name}`
  pptx.defineSlideMaster({ title: master, ...masterBackground(theme) })

  for (const slide of presentation.slides) {
    const pptxSlide = pptx.addSlide({ masterName: master })
    for (const element of slide.elements) {
      switch (element.type) {
        case 'text':
          addText(pptxSlide, element, theme)
          break
        case 'image':
          addImage(pptxSlide, element)
          break
        case 'shape':
          addShape(pptxSlide, element, theme)
          break
      }
    }
    if (slide.notes.trim()) pptxSlide.addNotes(slide.notes)
  }

  const output = await pptx.write({ outputType: 'uint8array' })
  return output as Uint8Array
}

function masterBackground(theme: SlideTheme): Pick<PptxGenJS.SlideMasterProps, 'background' | 'objects'> {
  const { axis, bands } = parseBackground(theme.background)
  const [base, ...rest] = bands
  return {
    background: { color: base.color },
    objects: rest.map((band) => ({
      rect:
        axis === 'x'
          ? {
              x: inches(SLIDE_WIDTH * band.start),
              y: 0,
              w: inches(SLIDE_WIDTH * (band.end - band.start)),
              h: inches(SLIDE_HEIGHT),
              fill: { color: band.color }
            }
          : {
              x: 0,
              y: inches(SLIDE_HEIGHT * band.start),
              w: inches(SLIDE_WIDTH),
              h: inches(SLIDE_HEIGHT * (band.end - band.start)),
              fill: { color: band.color }
            }
    }))
  }
}

function position(element: { x: number; y: number; width: number; height: number }) {
  return { x: inches(element.x), y: inches(element.y), w: inches(element.width), h: inches(element.height) }
}

function addText(slide: PptxGenJS.Slide, element: TextElement, theme: SlideTheme): void {
  // Un cuadro vacío solo muestra su texto de ayuda en el editor; en PowerPoint sería ruido.
  if (!element.text) return
  const { style } = element
  const isTitle = element.role === 'title'
  const fontSize = points(style.fontSize)

  const options: PptxGenJS.TextPropsOptions = {
    ...position(element),
    fontFace: cssFontToName(style.fontFamily ?? (isTitle ? theme.titleFontFamily : theme.fontFamily)) ?? undefined,
    fontSize,
    bold: style.bold,
    italic: style.italic,
    underline: style.underline ? { style: 'sng' } : undefined,
    strike: style.strike ? 'sngStrike' : undefined,
    color: cssColorToHex(style.color ?? (isTitle ? theme.titleColor : theme.textColor)) ?? undefined,
    align: style.align,
    valign: style.verticalAlign,
    margin: TEXT_MARGIN_PT,
    fit: 'none'
  }

  if (!style.bullets) {
    slide.addText(element.text, options)
    return
  }
  // Con viñetas, cada línea es un párrafo propio (como los <li> del editor).
  const lines = element.text.split('\n')
  slide.addText(
    lines.map((line, index) => ({
      text: line,
      options: { bullet: true, breakLine: index < lines.length - 1, paraSpaceAfter: fontSize * 0.35 }
    })),
    options
  )
}

function addImage(slide: PptxGenJS.Slide, element: ImageElement): void {
  if (!element.src.startsWith('data:')) return
  // pptxgenjs espera "image/png;base64,..." (sin el prefijo "data:").
  slide.addImage({ ...position(element), data: element.src.slice('data:'.length), altText: element.alt })
}

function addShape(slide: PptxGenJS.Slide, element: ShapeElement, theme: SlideTheme): void {
  const { fill, stroke, strokeWidth } = element.style
  const strokeColor = cssColorToHex(stroke)
  slide.addShape(SHAPES[element.shape], {
    ...position(element),
    fill: { color: cssColorToHex(fill ?? theme.accentColor) ?? 'C2410C' },
    line: strokeColor && strokeWidth > 0 ? { color: strokeColor, width: points(strokeWidth) } : { type: 'none' }
  })
}
