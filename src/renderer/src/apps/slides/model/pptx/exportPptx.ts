import PptxGenJS from 'pptxgenjs'
import { cssColorToHex, cssFontToName } from '@/core/office/cssValues'
import { hasText, resolveRunFormat } from '../richText'
import { getTheme, type SlideTheme } from '../themes'
import {
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type ImageElement,
  type RunFormat,
  type Presentation,
  type ShapeElement,
  type ShapeKind,
  type TextElement,
  type TextStyle
} from '../types'
import { parseBackground } from './background'
import { fixSlideParagraphs } from './fixParagraphXml'

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

  const output = (await pptx.write({ outputType: 'uint8array' })) as Uint8Array
  return fixSlideParagraphs(output)
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
  if (!hasText(element.paragraphs)) return
  const { style } = element
  const isTitle = element.role === 'title'
  const defaults = {
    fontFamily: style.fontFamily ?? (isTitle ? theme.titleFontFamily : theme.fontFamily),
    color: style.color ?? (isTitle ? theme.titleColor : theme.textColor)
  }

  const options: PptxGenJS.TextPropsOptions = {
    ...position(element),
    ...runOptions(style, {}, defaults),
    align: style.align,
    valign: style.verticalAlign,
    margin: TEXT_MARGIN_PT,
    fit: 'none'
  }

  // Cada trozo lleva su formato completo (no solo lo que cambia): así no dependemos de cómo
  // combina pptxgenjs las opciones del cuadro con las de cada trozo.
  const paragraphs = element.paragraphs
  const runs = paragraphs.flatMap((paragraph, paragraphIndex) => {
    const isLastParagraph = paragraphIndex === paragraphs.length - 1
    const pieces = paragraph.runs.length > 0 ? paragraph.runs : [{ text: '' }]
    return pieces.map((run, runIndex) => ({
      text: run.text,
      options: {
        ...runOptions(style, run, defaults),
        // El último trozo de cada párrafo cierra la línea (salvo el del último párrafo).
        breakLine: runIndex === pieces.length - 1 && !isLastParagraph,
        ...(style.bullets ? { bullet: true, paraSpaceAfter: points(style.fontSize) * 0.35 } : {})
      }
    }))
  })
  slide.addText(runs, options)
}

/** Formato final de un trozo (el suyo o, si no lo tiene, el del cuadro y el tema) en unidades de pptxgenjs. */
function runOptions(
  style: TextStyle,
  run: RunFormat,
  defaults: { fontFamily: string; color: string }
): PptxGenJS.TextPropsOptions {
  const format = resolveRunFormat(style, run)
  return {
    fontFace: cssFontToName(format.fontFamily ?? defaults.fontFamily) ?? undefined,
    fontSize: points(format.fontSize),
    bold: format.bold,
    italic: format.italic,
    underline: format.underline ? { style: 'sng' } : undefined,
    strike: format.strike ? 'sngStrike' : undefined,
    color: cssColorToHex(format.color ?? defaults.color) ?? undefined
  }
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
