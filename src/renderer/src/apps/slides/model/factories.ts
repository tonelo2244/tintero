import { createId } from '@/core/ids'
import { cloneElement } from './arrange'
import { paragraphsFromText } from './richText'
import {
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type Box,
  type ImageElement,
  type ShapeElement,
  type ShapeKind,
  type Slide,
  type SlideElement,
  type SlideLayoutId,
  type TableElement,
  type TextElement,
  type TextParagraph,
  type TextRole,
  type TextStyle
} from './types'

const DEFAULT_TEXT_STYLE: Record<TextRole, TextStyle> = {
  title: textStyle({ fontSize: 60, align: 'center', verticalAlign: 'bottom' }),
  subtitle: textStyle({ fontSize: 28, align: 'center', verticalAlign: 'top' }),
  body: textStyle({ fontSize: 28, align: 'left', verticalAlign: 'top', bullets: true }),
  free: textStyle({ fontSize: 24, align: 'left', verticalAlign: 'top' })
}

function textStyle(overrides: Partial<TextStyle>): TextStyle {
  return {
    fontFamily: null,
    fontSize: 24,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    color: null,
    align: 'left',
    verticalAlign: 'top',
    bullets: false,
    ...overrides
  }
}

export function createTextElement(
  role: TextRole,
  box: Box,
  options: {
    /** Texto sin formato propio (atajo para plantillas); `paragraphs` permite formato por palabra. */
    text?: string
    paragraphs?: TextParagraph[]
    placeholder?: string | null
    style?: Partial<TextStyle>
  } = {}
): TextElement {
  return {
    id: createId('el'),
    type: 'text',
    role,
    ...box,
    paragraphs: options.paragraphs ?? paragraphsFromText(options.text ?? ''),
    placeholder: options.placeholder ?? null,
    style: { ...DEFAULT_TEXT_STYLE[role], ...options.style }
  }
}

export function createShapeElement(shape: ShapeKind, box?: Box): ShapeElement {
  return {
    id: createId('el'),
    type: 'shape',
    shape,
    ...(box ?? centeredBox(320, 220)),
    style: { fill: null, stroke: null, strokeWidth: 0 }
  }
}

/** Tabla vacía centrada, con fila de encabezado y columnas iguales. */
export function createTableElement(rowCount: number, colCount: number, box?: Box): TableElement {
  const rows = Math.max(1, rowCount)
  const cols = Math.max(1, colCount)
  return {
    id: createId('el'),
    type: 'table',
    ...(box ?? centeredBox(Math.min(1104, cols * 220), Math.min(520, rows * 56))),
    rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ text: '' }))),
    columnWidths: Array.from({ length: cols }, () => 1 / cols),
    headerRow: true,
    fontSize: 20
  }
}

/** Ajusta la imagen para que quepa en el 60 % de la diapositiva, centrada y sin deformar. */
export function createImageElement(
  src: string,
  alt: string,
  naturalWidth: number,
  naturalHeight: number
): ImageElement {
  const maxWidth = SLIDE_WIDTH * 0.6
  const maxHeight = SLIDE_HEIGHT * 0.6
  const scale = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight)
  return {
    id: createId('el'),
    type: 'image',
    src,
    alt,
    ...centeredBox(Math.round(naturalWidth * scale), Math.round(naturalHeight * scale))
  }
}

export function centeredBox(width: number, height: number): Box {
  return { x: Math.round((SLIDE_WIDTH - width) / 2), y: Math.round((SLIDE_HEIGHT - height) / 2), width, height }
}

const TITLE_PLACEHOLDER = 'Haga clic para agregar título'
const SUBTITLE_PLACEHOLDER = 'Haga clic para agregar subtítulo'
const BODY_PLACEHOLDER = 'Haga clic para agregar texto'

export const SLIDE_LAYOUTS: { id: SlideLayoutId; name: string }[] = [
  { id: 'title', name: 'Diapositiva de título' },
  { id: 'titleContent', name: 'Título y contenido' },
  { id: 'sectionHeader', name: 'Encabezado de sección' },
  { id: 'titleOnly', name: 'Solo el título' },
  { id: 'blank', name: 'En blanco' }
]

function layoutElements(layout: SlideLayoutId): SlideElement[] {
  switch (layout) {
    case 'title':
      return [
        createTextElement('title', { x: 160, y: 140, width: 960, height: 250 }, { placeholder: TITLE_PLACEHOLDER }),
        createTextElement(
          'subtitle',
          { x: 160, y: 400, width: 960, height: 180 },
          { placeholder: SUBTITLE_PLACEHOLDER }
        )
      ]
    case 'titleContent':
      return [
        createTextElement(
          'title',
          { x: 88, y: 40, width: 1104, height: 140 },
          { placeholder: TITLE_PLACEHOLDER, style: { fontSize: 44, align: 'left', verticalAlign: 'middle' } }
        ),
        createTextElement('body', { x: 88, y: 200, width: 1104, height: 460 }, { placeholder: BODY_PLACEHOLDER })
      ]
    case 'sectionHeader':
      return [
        createTextElement(
          'title',
          { x: 88, y: 180, width: 1104, height: 240 },
          { placeholder: TITLE_PLACEHOLDER, style: { align: 'left' } }
        ),
        createTextElement(
          'subtitle',
          { x: 88, y: 430, width: 1104, height: 120 },
          { placeholder: BODY_PLACEHOLDER, style: { align: 'left' } }
        )
      ]
    case 'titleOnly':
      return [
        createTextElement(
          'title',
          { x: 88, y: 40, width: 1104, height: 140 },
          { placeholder: TITLE_PLACEHOLDER, style: { fontSize: 44, align: 'left', verticalAlign: 'middle' } }
        )
      ]
    case 'blank':
      return []
  }
}

export function createSlide(layout: SlideLayoutId): Slide {
  return { id: createId('slide'), layout, elements: layoutElements(layout), notes: '' }
}

/** Copia profunda con ids nuevos (para "Duplicar diapositiva"). */
export function cloneSlide(slide: Slide): Slide {
  return {
    ...slide,
    id: createId('slide'),
    elements: slide.elements.map((element) => cloneElement(element))
  }
}
