/**
 * Formato de párrafo y de listas que no es un estilo: bordes, sombreado, tabulaciones, viñetas y
 * formatos de número. Solo datos y su traducción a CSS; los comandos están en editor/ParagraphFormat.ts.
 */

/** La sangría se guarda en pasos de 1,27 cm (el del botón Aumentar sangría; ver editor/ParagraphFormat.ts). */
export const INDENT_STEP_CM = 1.27

export type ParagraphBorder = 'bottom' | 'top' | 'left' | 'box'

const LINE = '1px solid #595959'

export const BORDER_CSS: Record<ParagraphBorder, string> = {
  bottom: `border-bottom: ${LINE}; padding-bottom: 2pt`,
  top: `border-top: ${LINE}; padding-top: 2pt`,
  left: `border-left: 3px solid #595959; padding-left: 6pt`,
  box: `border: ${LINE}; padding: 2pt 4pt`
}

export const PARAGRAPH_BORDERS: { id: ParagraphBorder | 'none'; label: string }[] = [
  { id: 'bottom', label: 'Borde inferior' },
  { id: 'top', label: 'Borde superior' },
  { id: 'left', label: 'Borde izquierdo' },
  { id: 'box', label: 'Todos los bordes' },
  { id: 'none', label: 'Sin borde' }
]

export type TabAlign = 'left' | 'center' | 'right' | 'decimal'
export type TabLeader = 'none' | 'dot'

/** Tope de tabulación: posición en cm desde el margen izquierdo. */
export interface TabStop {
  position: number
  align: TabAlign
  leader?: TabLeader
}

/** Sin topes propios, el tabulador salta al siguiente múltiplo de 1,25 cm (como en Word). */
export const DEFAULT_TAB_STEP_CM = 1.25

export const TAB_ALIGNS: { id: TabAlign; label: string }[] = [
  { id: 'left', label: 'Izquierda' },
  { id: 'center', label: 'Centro' },
  { id: 'right', label: 'Derecha' },
  { id: 'decimal', label: 'Decimal' }
]

/** Biblioteca de viñetas: id -> símbolo (el valor de `list-style-type` y de Word). */
export const BULLET_STYLES: { id: string; label: string; symbol: string }[] = [
  { id: 'disc', label: 'Círculo relleno', symbol: '•' },
  { id: 'circle', label: 'Círculo', symbol: '◦' },
  { id: 'square', label: 'Cuadrado', symbol: '▪' },
  { id: 'dash', label: 'Guion', symbol: '–' },
  { id: 'arrow', label: 'Flecha', symbol: '➢' },
  { id: 'check', label: 'Marca de verificación', symbol: '✓' }
]

export type NumberFormat =
  | 'decimal'
  | 'decimal-paren'
  | 'lower-alpha'
  | 'lower-alpha-paren'
  | 'upper-alpha'
  | 'lower-roman'
  | 'upper-roman'
  | 'legal'

/** Formatos de número: cómo se ven y cómo se dicen en Word (numFmt + texto del nivel). */
export const NUMBER_FORMATS: { id: NumberFormat; label: string; example: string }[] = [
  { id: 'decimal', label: '1. 2. 3.', example: '1.' },
  { id: 'decimal-paren', label: '1) 2) 3)', example: '1)' },
  { id: 'lower-alpha', label: 'a. b. c.', example: 'a.' },
  { id: 'lower-alpha-paren', label: 'a) b) c)', example: 'a)' },
  { id: 'upper-alpha', label: 'A. B. C.', example: 'A.' },
  { id: 'lower-roman', label: 'i. ii. iii.', example: 'i.' },
  { id: 'upper-roman', label: 'I. II. III.', example: 'I.' },
  { id: 'legal', label: '1. 1.1. 1.1.1.', example: '1.1.' }
]

/**
 * Número con el que debe empezar una lista para "continuar" la anterior: el inicio de la anterior
 * más sus elementos. (Reiniciar es empezar en 1.)
 */
export function continuedStart(previousStart: number, previousItems: number): number {
  return Math.max(1, previousStart) + Math.max(0, previousItems)
}
