/**
 * Estilos de tabla y bordes de celda (fase 16). Un estilo de tabla dice qué bordes lleva y cómo se
 * pintan el encabezado y las filas en bandas; una celda puede cambiar sus bordes y su sombreado,
 * que pasan por encima del estilo (igual que en Word). Lo mismo sirve para la pantalla (CSS) y para
 * el .docx, así que vive aquí y no en el editor.
 */

export type TableStyleId = 'grid' | 'plain' | 'lines' | 'accent' | 'banded'

/** Qué bordes lleva la tabla: todos, ninguno o solo las líneas horizontales. */
export type TableBorders = 'all' | 'none' | 'horizontal'

export interface TableStyle {
  id: TableStyleId
  label: string
  borders: TableBorders
  /** Color de los bordes, "#rrggbb". */
  borderColor: string
  /** Fondo y color del texto de la fila de encabezado (null: los de las celdas normales). */
  headerFill: string | null
  headerColor: string | null
  headerBold: boolean
  /** Fondo de una de cada dos filas del cuerpo (null: sin bandas). */
  bandFill: string | null
}

export const DEFAULT_TABLE_STYLE: TableStyleId = 'grid'

export const TABLE_STYLES: TableStyle[] = [
  {
    id: 'grid',
    label: 'Cuadrícula',
    borders: 'all',
    borderColor: '#bfbfbf',
    headerFill: '#f2f2f2',
    headerColor: null,
    headerBold: false,
    bandFill: null
  },
  {
    id: 'plain',
    label: 'Sin bordes',
    borders: 'none',
    borderColor: '#bfbfbf',
    headerFill: null,
    headerColor: null,
    headerBold: true,
    bandFill: null
  },
  {
    id: 'lines',
    label: 'Líneas horizontales',
    borders: 'horizontal',
    borderColor: '#7f7f7f',
    headerFill: null,
    headerColor: null,
    headerBold: true,
    bandFill: null
  },
  {
    id: 'accent',
    label: 'Encabezado en color',
    borders: 'all',
    borderColor: '#8eaadb',
    headerFill: '#4472c4',
    headerColor: '#ffffff',
    headerBold: true,
    bandFill: null
  },
  {
    id: 'banded',
    label: 'Filas en bandas',
    borders: 'horizontal',
    borderColor: '#a5a5a5',
    headerFill: null,
    headerColor: null,
    headerBold: true,
    bandFill: '#f2f2f2'
  }
]

export const isTableStyleId = (value: unknown): value is TableStyleId =>
  TABLE_STYLES.some((style) => style.id === value)

export const tableStyle = (id: unknown): TableStyle => TABLE_STYLES.find((style) => style.id === id) ?? TABLE_STYLES[0]

/** Una de cada dos filas del cuerpo, contando la primera fila de la tabla como 0 (como `nth-child(even)` en CSS). */
export const isBandedRow = (style: TableStyle, rowIndex: number): boolean =>
  style.bandFill !== null && rowIndex % 2 === 1

// --- Bordes de celda ---

export type CellSide = 'top' | 'right' | 'bottom' | 'left'
export const CELL_SIDES: CellSide[] = ['top', 'right', 'bottom', 'left']

/** Bordes propios de una celda: los lados que llevan línea. Sin valor (null), los del estilo de la tabla. */
export type CellBorders = CellSide[] | null

export type CellBorderAction = 'all' | 'none' | 'reset' | CellSide

export const CELL_BORDER_ACTIONS: { action: CellBorderAction; label: string }[] = [
  { action: 'all', label: 'Todos los bordes' },
  { action: 'none', label: 'Sin borde' },
  { action: 'top', label: 'Borde superior' },
  { action: 'bottom', label: 'Borde inferior' },
  { action: 'left', label: 'Borde izquierdo' },
  { action: 'right', label: 'Borde derecho' },
  { action: 'reset', label: 'Bordes del estilo' }
]

/** Lee los bordes guardados ("top bottom", "" = ninguno); cualquier otra cosa, los del estilo. */
export function parseCellBorders(raw: unknown): CellBorders {
  if (typeof raw !== 'string') return null
  return CELL_SIDES.filter((side) => raw.split(/\s+/).includes(side))
}

export const formatCellBorders = (borders: CellBorders): string | null => (borders === null ? null : borders.join(' '))

/** Los lados con línea que tiene de verdad una celda: los suyos o, sin ellos, los de su tabla. */
export function effectiveCellBorders(style: TableStyle, borders: CellBorders): CellSide[] {
  if (borders !== null) return borders
  if (style.borders === 'all') return CELL_SIDES
  if (style.borders === 'horizontal') return ['top', 'bottom']
  return []
}

/**
 * Lo que hace un botón de Bordes sobre una celda. Los lados sueltos se activan o desactivan (como
 * en Word, pulsar "Borde inferior" dos veces lo quita), partiendo de lo que se ve ahora.
 */
export function applyCellBorderAction(style: TableStyle, current: CellBorders, action: CellBorderAction): CellBorders {
  if (action === 'reset') return null
  if (action === 'all') return [...CELL_SIDES]
  if (action === 'none') return []
  const visible = effectiveCellBorders(style, current)
  const next = visible.includes(action) ? visible.filter((side) => side !== action) : [...visible, action]
  return CELL_SIDES.filter((side) => next.includes(side))
}

/** Estilo en línea de una celda con bordes o sombreado propios (lo demás lo pone el estilo de la tabla). */
export function cellInlineStyle(borders: CellBorders, background: string | null, borderColor = '#000000'): string {
  const parts: string[] = []
  if (background) parts.push(`background-color: ${background}`)
  if (borders !== null)
    for (const side of CELL_SIDES)
      parts.push(`border-${side}: ${borders.includes(side) ? `1px solid ${borderColor}` : 'hidden'}`)
  return parts.join('; ')
}
