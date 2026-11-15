import type { ErrorCode } from '../types'

/**
 * Árbol de sintaxis (AST) de una fórmula. El parser lo construye a partir del texto y el
 * evaluador lo recorre. Trabajar con un árbol, y no con el texto, es lo que permite traducir,
 * mover referencias al copiar o renombrar hojas sin expresiones regulares frágiles.
 */

/** Referencia a una celda. `rowAbsolute`/`colAbsolute` son los "$" de $A$1: no cambian al copiar. */
export interface RefCoord {
  row: number
  col: number
  rowAbsolute: boolean
  colAbsolute: boolean
}

export type FormulaNode =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'error'; code: ErrorCode }
  | { type: 'ref'; sheet?: string; ref: RefCoord }
  /**
   * Rango rectangular. `span` marca las columnas o filas enteras (A:A, 2:5): se guardan como un
   * rango normal que cubre toda la hoja, y `span` solo decide cómo se vuelve a imprimir.
   */
  | { type: 'range'; sheet?: string; start: RefCoord; end: RefCoord; span?: RangeSpan }
  | { type: 'unary'; operator: '-' | '+' | '%'; operand: FormulaNode }
  | { type: 'binary'; operator: BinaryOperator; left: FormulaNode; right: FormulaNode }
  | { type: 'call'; name: string; args: FormulaNode[] }
  /** Paréntesis escritos por el usuario: los conservamos para volver a imprimir la fórmula tal cual. */
  | { type: 'group'; inner: FormulaNode }
  /** Argumento omitido: =BUSCARX(A1;B:B;C:C;;-1). La función lo trata como si no estuviera. */
  | { type: 'empty' }
  /** Nombre que no es ni función ni celda (p. ej. un nombre definido, que aún no soportamos). */
  | { type: 'name'; value: string }

/** 'columns' = A:C (todas las filas), 'rows' = 2:5 (todas las columnas). */
export type RangeSpan = 'columns' | 'rows'

export type BinaryOperator = '+' | '-' | '*' | '/' | '^' | '&' | '=' | '<>' | '<' | '>' | '<=' | '>='
