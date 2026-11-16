import type { JSONContent } from '@tiptap/core'
import {
  AlignmentType,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Paragraph,
  TextWrappingSide,
  TextWrappingType,
  VerticalPositionRelativeFrom,
  type IFloating,
  type ParagraphChild
} from 'docx'
import { ShapeRun, type ShapeFloating } from 'docx/shapes'
import { ChartRun } from 'docx/charts'
import { cssColorToHex } from '@/core/office/cssValues'
import { decodeImageDataUrl, fitWidth, imageSize } from '@/core/office/images'
import type { ShapeKind } from '@/apps/slides/model/types'
import { DEFAULT_CHART_SIZE, normalizeChartData } from '../chart'
import { hasCrop, normalizeCrop, placementOf, WRAP_DISTANCE_PX, type ObjectPlacement } from '../floating'

/**
 * Objetos de la fase 16 en Word: imágenes con tamaño, recorte, giro y ajuste de texto, y formas y
 * cuadros de texto como formas nativas de Word (DrawingML, `docx/shapes`), que allí se siguen editando.
 *
 * Tintero ancla cada objeto al bloque donde está y lo desplaza desde el borde izquierdo de la
 * columna: en Word es "relativo a la columna" en horizontal y "al párrafo" en vertical.
 */

/** Word mide las posiciones en EMU: 914400 por pulgada, 9525 por px a 96 ppp. */
const EMU_PER_PX = 9525

const HORIZONTAL_ALIGN = {
  left: HorizontalPositionAlign.LEFT,
  center: HorizontalPositionAlign.CENTER,
  right: HorizontalPositionAlign.RIGHT
} as const

const PARAGRAPH_ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT } as const

/** Colocación de Tintero -> `wp:anchor` de Word. En línea no lleva (va en el renglón). */
export function floatingFor(placement: ObjectPlacement): IFloating | undefined {
  const distance = WRAP_DISTANCE_PX * EMU_PER_PX
  const besideText = {
    horizontalPosition: { relative: HorizontalPositionRelativeFrom.COLUMN, align: HORIZONTAL_ALIGN[placement.align] },
    verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: 0 }
  }
  switch (placement.wrap) {
    case 'inline':
      return undefined
    case 'square':
      return {
        ...besideText,
        wrap: { type: TextWrappingType.SQUARE, side: TextWrappingSide.BOTH_SIDES },
        margins: { left: distance, right: distance }
      }
    case 'topBottom':
      return {
        ...besideText,
        wrap: { type: TextWrappingType.TOP_AND_BOTTOM },
        margins: { top: distance / 2, bottom: distance / 2 }
      }
    case 'behind':
    case 'front':
      return {
        horizontalPosition: {
          relative: HorizontalPositionRelativeFrom.COLUMN,
          offset: Math.round(placement.offsetX * EMU_PER_PX)
        },
        verticalPosition: {
          relative: VerticalPositionRelativeFrom.PARAGRAPH,
          offset: Math.round(placement.offsetY * EMU_PER_PX)
        },
        wrap: { type: TextWrappingType.NONE },
        behindDocument: placement.wrap === 'behind',
        allowOverlap: true,
        // Word no admite órdenes negativos: se sube todo para que "enviar al fondo" siga siendo el menor.
        zIndex: Math.max(0, placement.zIndex + 1000)
      }
  }
}

/** Párrafo que lleva un objeto: en línea, con la alineación del objeto; flotante, el ancla. */
export function objectParagraph(node: JSONContent, child: ParagraphChild | null): Paragraph {
  const placement = placementOf(node.attrs ?? {})
  return new Paragraph({
    alignment: placement.wrap === 'inline' && placement.align !== 'left' ? PARAGRAPH_ALIGN[placement.align] : undefined,
    children: child ? [child] : []
  })
}

/** Imagen con su tamaño, recorte, giro, texto alternativo y colocación. */
export function imageRun(node: JSONContent, maxWidthPx: number): ImageRun | null {
  const attrs = node.attrs ?? {}
  const decoded = typeof attrs.src === 'string' ? decodeImageDataUrl(attrs.src) : null
  if (!decoded) return null // imagen enlazada o formato que Word no entiende (SVG, WebP)
  const declaredWidth = Number(attrs.width)
  const declaredHeight = Number(attrs.height)
  const natural = imageSize(decoded) ?? { width: maxWidthPx, height: Math.round(maxWidthPx * 0.75) }
  const size =
    declaredWidth > 0 && declaredHeight > 0
      ? { width: declaredWidth, height: declaredHeight }
      : declaredWidth > 0
        ? { width: declaredWidth, height: Math.round((natural.height * declaredWidth) / natural.width) }
        : natural
  const placement = placementOf(attrs)
  // Un objeto libre puede salirse de la columna; uno en el texto, no.
  const frame = placement.wrap === 'behind' || placement.wrap === 'front' ? size : fitWidth(size, maxWidthPx)
  const rotation = Number(attrs.rotation) || 0
  const crop = normalizeCrop(attrs.crop)
  const alt = typeof attrs.alt === 'string' ? attrs.alt : ''
  return new ImageRun({
    type: decoded.kind,
    data: decoded.bytes,
    transformation: { ...frame, ...(rotation && { rotation }) },
    ...(hasCrop(crop) && { crop }),
    floating: floatingFor(placement),
    altText: { name: alt || 'Imagen', description: alt, title: alt }
  })
}

/** Formas de Tintero -> formas predefinidas de Word (`a:prstGeom`), por el nombre de la librería. */
const PRESET_SHAPES: Record<ShapeKind, string> = {
  rect: 'rectangle',
  roundRect: 'roundedRectangle',
  ellipse: 'ellipse',
  triangle: 'triangle',
  diamond: 'diamond',
  arrow: 'rightArrow',
  star: 'star5'
}

/** "#5b8bd0" -> "5B8BD0"; sin color, "none" (sin relleno o sin contorno). */
const hexOrNone = (value: unknown): string => {
  const hex = typeof value === 'string' ? cssColorToHex(value) : null
  return hex ?? 'none'
}

/** La colocación de una forma: la de las imágenes (Word admite además porcentajes, que no usamos). */
const shapeFloating = (placement: ObjectPlacement) => floatingFor(placement) as ShapeFloating | undefined

/** Forma -> forma nativa de Word (DrawingML), que se puede seguir editando allí. */
export function shapeRun(node: JSONContent): ShapeRun {
  const attrs = node.attrs ?? {}
  const rotation = Number(attrs.rotation) || 0
  return new ShapeRun({
    type: (PRESET_SHAPES[attrs.kind as ShapeKind] ?? 'rectangle') as 'rectangle',
    transformation: {
      width: Number(attrs.width) || 160,
      height: Number(attrs.height) || 100,
      ...(rotation && { rotation })
    },
    fill: hexOrNone(attrs.fill),
    line: hexOrNone(attrs.stroke),
    floating: shapeFloating(placementOf(attrs)),
    altText: { name: 'Forma', description: '', title: '' }
  })
}

/**
 * Cuadro de texto -> rectángulo de Word con párrafos dentro (`wps:txbx`), como los que crea
 * Insertar > Cuadro de texto en Word. El alto se ajusta al texto.
 */
export function textBoxRun(node: JSONContent, paragraphs: Paragraph[]): ShapeRun {
  const attrs = node.attrs ?? {}
  return new ShapeRun({
    type: 'rectangle',
    transformation: { width: Number(attrs.width) || 240, height: 'fitText' },
    fill: hexOrNone(attrs.fill),
    line: hexOrNone(attrs.border),
    children: paragraphs.length > 0 ? paragraphs : [new Paragraph({})],
    floating: shapeFloating(placementOf(attrs)),
    altText: { name: 'Cuadro de texto', description: '', title: '' }
  })
}

/**
 * Gráfico -> gráfico nativo de Word (`c:chart` con su libro incrustado): en Word, "Editar datos"
 * lo abre en Excel. Columnas, líneas o circular; el circular, como en Hojas, solo con la primera serie.
 * Si los datos no forman un gráfico válido para Word (sin categorías, por ejemplo), null.
 */
export function chartRun(node: JSONContent, maxWidthPx: number): ChartRun | null {
  const attrs = node.attrs ?? {}
  const data = normalizeChartData(attrs.data)
  if (data.categories.length === 0) return null
  const placement = placementOf(attrs)
  const declared = {
    width: Number(attrs.width) || DEFAULT_CHART_SIZE.width,
    height: Number(attrs.height) || DEFAULT_CHART_SIZE.height
  }
  const common = {
    title: typeof attrs.title === 'string' && attrs.title ? attrs.title : undefined,
    transformation:
      placement.wrap === 'behind' || placement.wrap === 'front' ? declared : fitWidth(declared, maxWidthPx),
    floating: floatingFor(placement),
    altText: { name: 'Gráfico', description: typeof attrs.alt === 'string' ? attrs.alt : '', title: '' }
  }
  try {
    if (attrs.kind === 'pie') {
      const [first] = data.series
      // Word no admite porciones negativas: cuentan como vacías, igual que en la vista.
      const values = first.values.map((value) => (value !== null && value > 0 ? value : null))
      return new ChartRun({
        type: 'pie',
        ...common,
        categories: data.categories,
        series: [{ name: first.name, values }]
      })
    }
    return new ChartRun({
      type: attrs.kind === 'line' ? 'line' : 'column',
      ...common,
      categories: data.categories,
      series: data.series
    })
  } catch {
    return null
  }
}
