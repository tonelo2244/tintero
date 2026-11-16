import type { SlideTheme } from './themes'

/** Tamaño lógico de una diapositiva (16:9). Todo se guarda en estas unidades y se escala al pintar. */
export const SLIDE_WIDTH = 1280
export const SLIDE_HEIGHT = 720

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Lo que comparten todos los elementos además de su caja. El giro es opcional (fase 10) para que
 * las presentaciones anteriores se abran igual sin migración: ausente = sin girar.
 */
interface ElementBase extends Box {
  id: string
  /** Giro en grados, en el sentido de las agujas del reloj, alrededor del centro de la caja. */
  rotation?: number
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

/**
 * Un párrafo. La alineación y la viñeta son del cuadro (`TextStyle`) salvo que el párrafo diga
 * otra cosa (fase 11). Son opcionales, como el formato de los trozos: ausente = lo del cuadro.
 */
export interface TextParagraph {
  runs: TextRun[]
  align?: HorizontalAlign
  bullets?: boolean
}

export interface TextElement extends ElementBase {
  type: 'text'
  role: TextRole
  /** Contenido con formato por palabra. Un cuadro vacío no tiene párrafos. */
  paragraphs: TextParagraph[]
  /** Texto gris que se ve solo en el editor cuando el cuadro está vacío. */
  placeholder: string | null
  style: TextStyle
}

export interface ImageElement extends ElementBase {
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

export interface ShapeElement extends ElementBase {
  type: 'shape'
  shape: ShapeKind
  style: ShapeStyle
}

/** Celda de una tabla: texto plano con un poco de formato, lo que más se usa en una diapositiva. */
export interface TableCell {
  text: string
  bold?: boolean
  /** "#rrggbb"; ausente = color de texto del tema. */
  color?: string
  /** "#rrggbb"; ausente = sin relleno (o el de la fila de encabezado). */
  fill?: string
}

export interface TableElement extends ElementBase {
  type: 'table'
  /** Filas x columnas. Todas las filas tienen el mismo número de celdas. */
  rows: TableCell[][]
  /** Ancho de cada columna como fracción del ancho de la tabla (suman 1): así redimensionar no recalcula nada. */
  columnWidths: number[]
  /** La primera fila se pinta como encabezado (color de acento del tema). */
  headerRow: boolean
  fontSize: number
}

/**
 * Grupo: se mueve, gira y redimensiona como un solo elemento. Los hijos guardan su caja en
 * coordenadas de la diapositiva (no relativas al grupo): así desagrupar no tiene que recalcular
 * nada y el importador de .pptx, que ya resuelve los grupos a coordenadas absolutas, encaja tal cual.
 * Su caja es siempre la que envuelve a los hijos.
 */
export interface GroupElement extends ElementBase {
  type: 'group'
  children: SlideElement[]
}

export type SlideElement = TextElement | ImageElement | ShapeElement | TableElement | GroupElement

/** Transición al llegar a la diapositiva en el modo presentación. */
export type SlideTransition = 'none' | 'fade' | 'push'

export type SlideLayoutId = 'title' | 'titleContent' | 'sectionHeader' | 'titleOnly' | 'blank'

export interface Slide {
  id: string
  layout: SlideLayoutId
  elements: SlideElement[]
  notes: string
  /** Fondo propio de esta diapositiva (valor CSS de `background`). Ausente = el del tema. */
  background?: string
  /** Transición al entrar en la diapositiva. Ausente = ninguna. */
  transition?: SlideTransition
}

export interface Presentation {
  themeId: string
  slides: Slide[]
  /** Tema leído de un .pptx (colores, fuentes y fondo del patrón). Se usa si `themeId` es su id. */
  importedTheme?: SlideTheme
}
