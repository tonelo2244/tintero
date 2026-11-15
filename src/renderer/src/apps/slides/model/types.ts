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

/** Formato del cuadro entero: es el valor por defecto de cada trozo de texto. */
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

/** Propiedades de carácter que un trozo de texto puede cambiar respecto al cuadro. */
export const RUN_FORMAT_KEYS = ['bold', 'italic', 'underline', 'strike', 'color', 'fontFamily', 'fontSize'] as const
export type RunFormatKey = (typeof RUN_FORMAT_KEYS)[number]

/**
 * Formato propio de un trozo de texto. Cada propiedad ausente se hereda del cuadro (`TextStyle`),
 * así un cuadro sin formato por palabra sigue siendo tan simple como antes.
 */
export interface RunFormat {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
  fontFamily?: string
  fontSize?: number
}

/** Un trozo de texto con el mismo formato (equivale a un <a:r> de PowerPoint o un <span>). */
export interface TextRun extends RunFormat {
  text: string
}

/** Un párrafo: una línea de viñeta cuando el cuadro lleva viñetas. */
export interface TextParagraph {
  runs: TextRun[]
}

export interface TextElement extends Box {
  id: string
  type: 'text'
  role: TextRole
  /** Contenido con formato por palabra. Un cuadro vacío no tiene párrafos. */
  paragraphs: TextParagraph[]
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
