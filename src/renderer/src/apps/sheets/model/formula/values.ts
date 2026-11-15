import { formatGeneralNumber } from '../format'
import { parseNumberText } from '../input'
import type { CellValue, ErrorCode, FormulaError, Scalar } from '../types'

/**
 * Reglas de conversión entre tipos, copiadas del comportamiento de Excel:
 * en una suma, una celda vacía vale 0, VERDADERO vale 1 y el texto "3" vale 3;
 * el texto "hola" da #¡VALOR!.
 */

/** Un rango ya evaluado. Se lee celda a celda con `get` para no copiar rangos enormes. */
export interface Matrix {
  kind: 'matrix'
  rows: number
  cols: number
  get(row: number, col: number): CellValue
}

/** Lo que puede producir una subexpresión: un valor o (solo como argumento de función) un rango. */
export type EvalValue = CellValue | Matrix

export function err(code: ErrorCode): FormulaError {
  return { error: code }
}

export function isError(value: EvalValue): value is FormulaError {
  return typeof value === 'object' && value !== null && 'error' in value
}

export function isMatrix(value: EvalValue): value is Matrix {
  return typeof value === 'object' && value !== null && 'kind' in value
}

/** Trata un valor suelto como un rango de 1x1, para las funciones que aceptan ambos. */
export function asMatrix(value: EvalValue): Matrix {
  if (isMatrix(value)) return value
  return { kind: 'matrix', rows: 1, cols: 1, get: () => value }
}

/** Un rango donde se esperaba un valor suelto (=A1:A3 en una celda) no tiene sentido: #¡VALOR!. */
export function toScalar(value: EvalValue): CellValue {
  // undefined = argumento omitido (ver evaluate.ts); en una posición obligatoria vale como vacío.
  if (value === undefined) return null
  if (!isMatrix(value)) return value
  if (value.rows === 1 && value.cols === 1) return value.get(0, 0)
  return err('#VALUE!')
}

export function toNumber(value: EvalValue): number | FormulaError {
  const scalar = toScalar(value)
  if (scalar === null) return 0
  if (typeof scalar === 'number') return scalar
  if (typeof scalar === 'boolean') return scalar ? 1 : 0
  if (typeof scalar === 'string') {
    if (scalar.trim() === '') return err('#VALUE!')
    const parsed = parseNumberText(scalar)
    return parsed === null ? err('#VALUE!') : parsed
  }
  return scalar
}

export function toText(value: EvalValue): string | FormulaError {
  const scalar = toScalar(value)
  if (scalar === null) return ''
  if (typeof scalar === 'string') return scalar
  if (typeof scalar === 'number') return formatGeneralNumber(scalar)
  if (typeof scalar === 'boolean') return scalar ? 'VERDADERO' : 'FALSO'
  return scalar
}

export function toBoolean(value: EvalValue): boolean | FormulaError {
  const scalar = toScalar(value)
  if (scalar === null) return false
  if (typeof scalar === 'boolean') return scalar
  if (typeof scalar === 'number') return scalar !== 0
  if (typeof scalar === 'string') {
    const upper = scalar.trim().toUpperCase()
    if (upper === 'TRUE' || upper === 'VERDADERO') return true
    if (upper === 'FALSE' || upper === 'FALSO') return false
    return err('#VALUE!')
  }
  return scalar
}

/**
 * Comparación de Excel: números < textos < booleanos; el texto sin distinguir mayúsculas.
 * Una celda vacía se compara como 0 con números y como "" con textos.
 */
export function compareValues(left: Scalar | null, right: Scalar | null): number {
  const a = left ?? (typeof right === 'string' ? '' : typeof right === 'boolean' ? false : 0)
  const b = right ?? (typeof left === 'string' ? '' : typeof left === 'boolean' ? false : 0)
  const rank = (value: Scalar) => (typeof value === 'number' ? 0 : typeof value === 'string' ? 1 : 2)
  if (rank(a) !== rank(b)) return rank(a) - rank(b)
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b, 'es', { sensitivity: 'base' })
  }
  return Number(a) - Number(b)
}

/** Recorre todas las celdas de los argumentos (los rangos se expanden). */
export function* flatten(values: EvalValue[]): Generator<{ value: CellValue; fromRange: boolean }> {
  for (const value of values) {
    if (isMatrix(value)) {
      for (let row = 0; row < value.rows; row++) {
        for (let col = 0; col < value.cols; col++) yield { value: value.get(row, col), fromRange: true }
      }
    } else {
      yield { value, fromRange: false }
    }
  }
}
