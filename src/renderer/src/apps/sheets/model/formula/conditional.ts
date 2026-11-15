import type { CellValue } from '../types'
import { buildCriterion } from './criteria'
import { MANY, type FunctionSpec } from './spec'
import { asMatrix, err, isError, toBoolean, toScalar, type EvalValue, type Matrix } from './values'

/**
 * Funciones condicionales: las de un criterio (SUMAR.SI, CONTAR.SI, PROMEDIO.SI), las de varios
 * (…CONJUNTO) y SI.CONJUNTO. Todas comparten la misma pieza: `matchingCells` devuelve qué
 * posiciones cumplen TODOS los criterios, y cada función decide qué hacer con ellas.
 */

/** Pares (rango, criterio). Todos los rangos deben tener la misma forma, como exige Excel. */
type CriteriaPairs = { range: Matrix; matches: (value: CellValue) => boolean }[]

function readPairs(args: EvalValue[]): CriteriaPairs | CellValue {
  if (args.length === 0 || args.length % 2 !== 0) return err('#VALUE!')
  const pairs: CriteriaPairs = []
  for (let index = 0; index < args.length; index += 2) {
    const criterion = toScalar(args[index + 1])
    if (isError(criterion)) return criterion
    pairs.push({ range: asMatrix(args[index]), matches: buildCriterion(criterion) })
  }
  const [first] = pairs
  if (pairs.some(({ range }) => range.rows !== first.range.rows || range.cols !== first.range.cols)) {
    return err('#VALUE!')
  }
  return pairs
}

/** Recorre las posiciones del primer rango que cumplen todos los criterios. */
function* matchingCells(pairs: CriteriaPairs): Generator<{ row: number; col: number }> {
  const { rows, cols } = pairs[0].range
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (pairs.every(({ range, matches }) => matches(range.get(row, col)))) yield { row, col }
    }
  }
}

/** Suma (o promedia) `values` en las posiciones que cumplen. Los textos y vacíos se ignoran. */
function aggregate(values: Matrix, pairs: CriteriaPairs, mode: 'sum' | 'average'): CellValue {
  let total = 0
  let count = 0
  for (const { row, col } of matchingCells(pairs)) {
    const value = row < values.rows && col < values.cols ? values.get(row, col) : null
    if (isError(value)) return value
    if (typeof value !== 'number') continue
    total += value
    count++
  }
  if (mode === 'sum') return total
  return count === 0 ? err('#DIV/0!') : total / count
}

function countMatches(pairs: CriteriaPairs): number {
  let count = 0
  for (const _ of matchingCells(pairs)) count++
  return count
}

/** SUMAR.SI(rango; criterio; [rango_suma]) y PROMEDIO.SI con la misma forma. */
function singleCriterion(mode: 'sum' | 'average'): FunctionSpec['run'] {
  return ([range, criterion, valuesArg]) => {
    const pairs = readPairs([range, criterion])
    if (!Array.isArray(pairs)) return pairs
    return aggregate(valuesArg === undefined ? pairs[0].range : asMatrix(valuesArg), pairs, mode)
  }
}

/** SUMAR.SI.CONJUNTO(rango_suma; rango1; criterio1; …): el rango de valores va PRIMERO. */
function multipleCriteria(mode: 'sum' | 'average'): FunctionSpec['run'] {
  return ([valuesArg, ...rest]) => {
    const pairs = readPairs(rest)
    if (!Array.isArray(pairs)) return pairs
    const values = asMatrix(valuesArg)
    if (values.rows !== pairs[0].range.rows || values.cols !== pairs[0].range.cols) return err('#VALUE!')
    return aggregate(values, pairs, mode)
  }
}

export const CONDITIONAL_FUNCTIONS: Record<string, FunctionSpec> = {
  SUMIF: { minArgs: 2, maxArgs: 3, run: singleCriterion('sum') },
  AVERAGEIF: { minArgs: 2, maxArgs: 3, run: singleCriterion('average') },
  COUNTIF: {
    minArgs: 2,
    maxArgs: 2,
    run: (args) => {
      const pairs = readPairs(args)
      return Array.isArray(pairs) ? countMatches(pairs) : pairs
    }
  },
  SUMIFS: { minArgs: 3, maxArgs: MANY, run: multipleCriteria('sum') },
  AVERAGEIFS: { minArgs: 3, maxArgs: MANY, run: multipleCriteria('average') },
  COUNTIFS: {
    minArgs: 2,
    maxArgs: MANY,
    run: (args) => {
      const pairs = readPairs(args)
      return Array.isArray(pairs) ? countMatches(pairs) : pairs
    }
  },
  /** SI.CONJUNTO(cond1; valor1; cond2; valor2; …): el valor de la primera condición cierta. */
  IFS: {
    minArgs: 2,
    maxArgs: MANY,
    run: (args) => {
      if (args.length % 2 !== 0) return err('#VALUE!')
      for (let index = 0; index < args.length; index += 2) {
        const condition = toBoolean(args[index])
        if (isError(condition)) return condition
        if (condition) return toScalar(args[index + 1])
      }
      return err('#N/A')
    }
  }
}
