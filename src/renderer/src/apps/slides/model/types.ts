/** Tamaño lógico de una diapositiva (16:9). Todo se guarda en estas unidades y se escala al pintar. */
export const SLIDE_WIDTH = 1280
export const SLIDE_HEIGHT = 720

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export type TextRole = 'title' | 'subtitle' | 'body' | 'free'
export type HorizontalAlign = 'left' | 'center' | 'right' | 'justify'
export type VerticalAlign = 'top' | 'middle' | 'bottom'

export interface TextStyle {
  /** null = la fuente del tema. */
  fontFamily: string | null
  fontSize: number
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  /** null = el color del tema según el rol (título o texto). */
  color: string | null
  align: HorizontalAlign
  verticalAlign: VerticalAlign
  bullets: boolean
}

export interface TextElement extends Box {
  id: string
  type: 'text'
  role: TextRole
  text: string
  /** Texto gris que se ve solo en el editor cuando el cuadro está vacío. */
  placeholder: string | null
  style: TextStyle
}

export interface ImageElement extends Box {
  id: string
  type: 'image'
  src: string
  alt: string
}

export type ShapeKind = 'rect' | 'roundRect' | 'ellipse' | 'triangle' | 'diamond' | 'arrow' | 'star'

export interface ShapeStyle {
  /** null = color de acento del tema. */
  fill: string | null
  stroke: string | null
  strokeWidth: number
}

export interface ShapeElement extends Box {
  id: string
  type: 'shape'
  shape: ShapeKind
  style: ShapeStyle
}

export type SlideElement = TextElement | ImageElement | ShapeElement

export type SlideLayoutId = 'title' | 'titleContent' | 'sectionHeader' | 'titleOnly' | 'blank'

export interface Slide {
  id: string
  layout: SlideLayoutId
  elements: SlideElement[]
  notes: string
}

export interface Presentation {
  themeId: string
  slides: Slide[]
}
