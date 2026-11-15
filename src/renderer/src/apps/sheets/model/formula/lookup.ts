import type { CellValue, Scalar } from '../types'
import { buildCriterion } from './criteria'
import type { FunctionSpec } from './spec'
import { compareValues, err, isError, isMatrix, toNumber, toScalar, type EvalValue, type Matrix } from './values'

/**
 * Búsqueda: COINCIDIR, INDICE y BUSCARX. BUSCARV sigue en functions.ts.
 *
 * Tintero no tiene matrices dinámicas: si BUSCARX tiene que devolver una fila entera, devuelve su
 * primera celda. Es una limitación conocida (Excel la "derramaría" sobre las celdas vecinas).
 */

/** Un rango de una fila o una columna, leído como lista. Un rango 2D no vale para buscar. */
function asVector(value: EvalValue): CellValue[] | null {
  if (!isMatrix(value)) return [toScalar(value)]
  if (value.rows !== 1 && value.cols !== 1) return null
  const length = Math.max(value.rows, value.cols)
  return Array.from({ length }, (_, index) => (value.rows === 1 ? value.get(0, index) : value.get(index, 0)))
}

function comparable(value: CellValue): value is Scalar {
  return value !== null && !isError(value)
}

/** Primera posición igual (sin distinguir mayúsculas) o que encaja con comodines * y ?. */
function exactIndex(values: CellValue[], needle: Scalar, wildcards: boolean, order: number[]): number {
  const matches = wildcards && typeof needle === 'string' ? buildCriterion(`=${needle}`) : null
  for (const index of order) {
    const candidate = values[index]
    if (matches ? matches(candidate) : comparable(candidate) && compareValues(candidate, needle) === 0) return index
  }
  return -1
}

/** Coincidencia exacta o, si no hay, la más cercana por debajo (-1) o por encima (1). */
function nearestIndex(values: CellValue[], needle: Scalar, direction: -1 | 1, order: number[]): number {
  let best = -1
  for (const index of order) {
    const candidate = values[index]
    if (!comparable(candidate) || typeof candidate !== typeof needle) continue
    const difference = compareValues(candidate, needle)
    if (difference === 0) return index
    if (Math.sign(difference) !== direction) continue
    if (best < 0 || compareValues(candidate, values[best] as Scalar) * direction < 0) best = index
  }
  return best
}

/**
 * COINCIDIR con tipo 1 o -1 asume una lista ordenada y recorre hasta pasarse (lo que hace Excel):
 * en una lista desordenada el resultado es el de Excel, no el "correcto".
 */
function sortedIndex(values: CellValue[], needle: Scalar, type: 1 | -1): number {
  let found = -1
  for (let index = 0; index < values.length; index++) {
    const candidate = values[index]
    if (!comparable(candidate) || typeof candidate !== typeof needle) continue
    const difference = compareValues(candidate, needle)
    if (type === 1 ? difference <= 0 : difference >= 0) found = index
    else break
  }
  return found
}

function cellOf(matrix: Matrix, row: number, col: number): CellValue {
  if (row < 0 || col < 0 || row >= matrix.rows || col >= matrix.cols) return err('#REF!')
  return matrix.get(row, col)
}

export const LOOKUP_FUNCTIONS: Record<string, FunctionSpec> = {
  /** COINCIDIR(valor; rango; [tipo]): posición (desde 1). Tipo 1 por defecto, como en Excel. */
  MATCH: {
    minArgs: 2,
    maxArgs: 3,
    run: ([lookup, range, typeArg]) => {
      const needle = toScalar(lookup)
      if (isError(needle)) return needle
      if (needle === null) return err('#N/A')
      const values = asVector(range)
      if (!values) return err('#N/A')
      const type = typeArg === undefined ? 1 : toNumber(typeArg)
      if (isError(type)) return type
      const order = values.map((_, index) => index)
      const index =
        type === 0 ? exactIndex(values, needle, true, order) : sortedIndex(values, needle, type > 0 ? 1 : -1)
      return index < 0 ? err('#N/A') : index + 1
    }
  },
  /** INDICE(rango; fila; [columna]). En un rango de una sola fila, el segundo argumento es la columna. */
  INDEX: {
    minArgs: 2,
    maxArgs: 3,
    run: ([range, rowArg, colArg]) => {
      if (!isMatrix(range)) return colArg === undefined ? toScalar(range) : err('#REF!')
      const row = toNumber(rowArg)
      if (isError(row)) return row
      const col = colArg === undefined ? 1 : toNumber(colArg)
      if (isError(col)) return col
      // Fila o columna 0 = "entera": sin matrices dinámicas solo vale si el resultado es una celda.
      if (colArg === undefined && range.rows === 1) return cellOf(range, 0, Math.trunc(row) - 1)
      const rowIndex = row === 0 && range.rows === 1 ? 0 : Math.trunc(row) - 1
      const colIndex = col === 0 && range.cols === 1 ? 0 : Math.trunc(col) - 1
      if (row === 0 || col === 0) {
        if (rowIndex !== 0 && range.rows !== 1) return err('#VALUE!')
        if (colIndex !== 0 && range.cols !== 1) return err('#VALUE!')
      }
      return cellOf(range, rowIndex, colIndex)
    }
  },
  /**
   * BUSCARX(valor; rango_búsqueda; rango_resultado; [si_no_se_encuentra]; [coincidencia]; [búsqueda])
   * coincidencia: 0 exacta, -1 exacta o menor, 1 exacta o mayor, 2 comodines.
   * búsqueda: 1 desde el principio, -1 desde el final (2 y -2, binarias, se tratan como 1 y -1).
   */
  XLOOKUP: {
    minArgs: 3,
    maxArgs: 6,
    run: ([lookup, lookupRange, returnRange, notFound, modeArg, searchArg]) => {
      const needle = toScalar(lookup)
      if (isError(needle)) return needle
      const values = asVector(lookupRange)
      if (!values) return err('#VALUE!')
      const mode = modeArg === undefined ? 0 : toNumber(modeArg)
      if (isError(mode)) return mode
      const search = searchArg === undefined ? 1 : toNumber(searchArg)
      if (isError(search)) return search
      if (![0, -1, 1, 2].includes(mode) || ![1, -1, 2, -2].includes(search)) return err('#VALUE!')

      const order = values.map((_, index) => index)
      if (search < 0) order.reverse()
      const target = needle ?? ''
      const index =
        mode === 0 || mode === 2
          ? exactIndex(values, target, mode === 2, order)
          : nearestIndex(values, target, mode as -1 | 1, order)
      if (index < 0) return notFound === undefined ? err('#N/A') : toScalar(notFound)

      const result = isMatrix(returnRange) ? returnRange : null
      if (!result) return toScalar(returnRange)
      // El rango de resultado se recorre en la misma dirección que el de búsqueda.
      const vertical = isMatrix(lookupRange) ? lookupRange.cols === 1 && lookupRange.rows > 1 : result.cols === 1
      if (vertical) return result.rows === values.length ? result.get(index, 0) : err('#VALUE!')
      return result.cols === values.length ? result.get(0, index) : err('#VALUE!')
    }
  }
}
