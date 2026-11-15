/**
 * Modelo de datos de Tintero Hojas de cálculo, tal y como se guarda en disco (.tsheet).
 *
 * Decisión clave: las celdas se guardan en un mapa disperso ("A1" -> celda) con SOLO las celdas
 * que tienen algo. Una hoja de 10.000 x 702 celdas casi vacía ocupa lo que ocupan sus datos,
 * no millones de huecos. Es lo mismo que hacen Excel (.xlsx) y LibreOffice por dentro.
 *
 * Los valores calculados de las fórmulas NO se guardan aquí: se derivan con el motor de cálculo
 * (calc.ts). Guardar solo la fuente evita que lo guardado y lo calculado se contradigan.
 */

/** Valor literal que el usuario escribe en una celda. */
export type Scalar = number | string | boolean

/** Códigos de error en su forma canónica (la de Excel en inglés, la misma que usa .xlsx). */
export type ErrorCode = '#DIV/0!' | '#VALUE!' | '#REF!' | '#NAME?' | '#N/A' | '#NUM!' | '#CIRC!'

export interface FormulaError {
  error: ErrorCode
}

/** Resultado de evaluar una celda: vacía (null), un valor o un error. */
export type CellValue = Scalar | FormulaError | null

export type HorizontalAlign = 'left' | 'center' | 'right'

export type NumberFormatKind = 'general' | 'number' | 'currency' | 'percent' | 'date' | 'text'

export interface NumberFormat {
  kind: NumberFormatKind
  /** Decimales para número, moneda y porcentaje. */
  decimals?: number
}

export interface CellBorders {
  top?: boolean
  right?: boolean
  bottom?: boolean
  left?: boolean
}

export interface CellStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  /** Color del texto, "#rrggbb". */
  color?: string
  /** Color de relleno, "#rrggbb". */
  fill?: string
  align?: HorizontalAlign
  numberFormat?: NumberFormat
  borders?: CellBorders
}

export interface Cell {
  /** Literal (número, texto o booleano). No se usa si la celda tiene fórmula. */
  value?: Scalar
  /**
   * Fórmula sin el "=", en forma canónica: nombres de función en inglés y "," como separador
   * ("SUM(A1:A3,2)"). La interfaz la muestra traducida ("SUMA(A1:A3;2)"). Así el archivo no
   * depende del idioma y la exportación a .xlsx es directa.
   */
  formula?: string
  style?: CellStyle
}

export interface Sheet {
  id: string
  name: string
  /** Mapa disperso: dirección "B3" -> celda. */
  cells: Record<string, Cell>
  /** Ancho en píxeles de las columnas que no tienen el de por defecto (índice desde 0). */
  columnWidths: Record<number, number>
}

export interface Workbook {
  sheets: Sheet[]
  /** Hoja que estaba a la vista al guardar; al abrir el archivo se vuelve a ella. */
  activeSheetId: string
}

/** Coordenadas de una celda, desde 0. La "A1" es { row: 0, col: 0 }. */
export interface CellCoord {
  row: number
  col: number
}

/** Rango rectangular normalizado (start <= end en filas y columnas). */
export interface CellRange {
  start: CellCoord
  end: CellCoord
}
