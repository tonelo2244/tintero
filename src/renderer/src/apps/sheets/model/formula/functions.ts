import type { CellValue, Scalar } from '../types'
import {
  compareValues,
  err,
  flatten,
  isError,
  isMatrix,
  toBoolean,
  toNumber,
  toScalar,
  toText,
  type EvalValue,
  type Matrix
} from './values'

/**
 * Implementación de las funciones, indexadas por su nombre canónico (inglés).
 * Todas son puras: reciben los argumentos ya evaluados y devuelven un valor.
 * Un error de un argumento se propaga, como en Excel (=SUMA(1;#¡DIV/0!) da #¡DIV/0!).
 *
 * Añadir una función = añadirla aquí y su nombre en español en functionNames.ts.
 */
type FormulaFunction = (args: EvalValue[]) => CellValue

interface FunctionSpec {
  minArgs: number
  maxArgs: number
  run: FormulaFunction
}

const MANY = Infinity

/** Números de los argumentos. En rangos se ignoran textos y booleanos; sueltos, se convierten. */
function collectNumbers(args: EvalValue[]): number[] | CellValue {
  const numbers: number[] = []
  for (const { value, fromRange } of flatten(args)) {
    if (isError(value)) return value
    if (fromRange) {
      if (typeof value === 'number') numbers.push(value)
      continue
    }
    const number = toNumber(value)
    if (isError(number)) return number
    numbers.push(number)
  }
  return numbers
}

function withNumbers(args: EvalValue[], reduce: (numbers: number[]) => CellValue): CellValue {
  const numbers = collectNumbers(args)
  return Array.isArray(numbers) ? reduce(numbers) : numbers
}

/** Aplica `run` a argumentos numéricos sueltos, propagando el primer error. */
function numeric(run: (...numbers: number[]) => CellValue): FormulaFunction {
  return (args) => {
    const numbers: number[] = []
    for (const arg of args) {
      const number = toNumber(arg)
      if (isError(number)) return number
      numbers.push(number)
    }
    return run(...numbers)
  }
}

function textual(run: (text: string, ...rest: number[]) => CellValue): FormulaFunction {
  return ([first, ...rest]) => {
    const text = toText(first)
    if (isError(text)) return text
    const numbers: number[] = []
    for (const arg of rest) {
      const number = toNumber(arg)
      if (isError(number)) return number
      numbers.push(number)
    }
    return run(text, ...numbers)
  }
}

/** Redondeo "a la mitad, lejos del cero" de Excel. Math.round(-2.5) da -2; Excel da -3. */
function roundHalfAwayFromZero(value: number, digits: number): number {
  const factor = 10 ** Math.trunc(digits)
  const rounded = Math.round(Math.abs(value) * factor * (1 + Number.EPSILON)) / factor
  return Math.sign(value) * rounded
}

/**
 * Criterio de SUMAR.SI / CONTAR.SI: ">5", "<>listo", "=0", "ma*" o un valor a secas.
 * Devuelve una función que dice si una celda cumple el criterio.
 */
export function buildCriterion(criterion: CellValue): (value: CellValue) => boolean {
  if (typeof criterion !== 'string')
    return (value) => value !== null && compareValues(toPlain(value), criterion as Scalar) === 0
  const match = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(criterion)!
  const operator = match[1] ?? '='
  const operandText = match[2]
  const operandNumber = operandText.trim() === '' ? null : Number(operandText.replace(',', '.'))
  const operand: Scalar = operandNumber !== null && Number.isFinite(operandNumber) ? operandNumber : operandText

  if (typeof operand === 'string' && (operator === '=' || operator === '<>') && /[*?]/.test(operand)) {
    const pattern = new RegExp(
      `^${operand
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')}$`,
      'i'
    )
    const test = (value: CellValue) => typeof value === 'string' && pattern.test(value)
    return operator === '=' ? test : (value) => !test(value)
  }

  return (value) => {
    if (isError(value)) return false
    if (operandText === '' && operator === '=') return value === null || value === ''
    if (operandText === '' && operator === '<>') return value !== null && value !== ''
    // Solo se comparan valores del mismo tipo: ">5" no cuenta los textos.
    if (operator !== '<>' && (value === null || typeof value !== typeof operand)) return false
    const order = value === null ? -1 : compareValues(value as Scalar, operand)
    switch (operator) {
      case '=':
        return order === 0
      case '<>':
        return value === null || order !== 0
      case '<':
        return order < 0
      case '>':
        return order > 0
      case '<=':
        return order <= 0
      default:
        return order >= 0
    }
  }
}

function toPlain(value: CellValue): Scalar | null {
  return isError(value) ? null : value
}

function asMatrix(value: EvalValue): Matrix {
  if (isMatrix(value)) return value
  return { kind: 'matrix', rows: 1, cols: 1, get: () => value }
}

function vlookup([lookup, table, column, approximate]: EvalValue[]): CellValue {
  const needle = toScalar(lookup)
  if (isError(needle)) return needle
  if (!isMatrix(table)) return err('#VALUE!')
  const columnNumber = toNumber(column)
  if (isError(columnNumber)) return columnNumber
  const columnIndex = Math.trunc(columnNumber) - 1
  if (columnIndex < 0) return err('#VALUE!')
  if (columnIndex >= table.cols) return err('#REF!')
  const isApproximate = approximate === undefined ? true : toBoolean(approximate)
  if (isError(isApproximate)) return isApproximate

  if (!isApproximate) {
    for (let row = 0; row < table.rows; row++) {
      const candidate = table.get(row, 0)
      if (!isError(candidate) && candidate !== null && compareValues(candidate, needle) === 0) {
        return table.get(row, columnIndex)
      }
    }
    return err('#N/A')
  }

  // Coincidencia aproximada: la tabla está ordenada y buscamos el mayor valor <= buscado.
  let found = -1
  for (let row = 0; row < table.rows; row++) {
    const candidate = table.get(row, 0)
    if (candidate === null || isError(candidate) || typeof candidate !== typeof needle) continue
    if (compareValues(candidate, needle) <= 0) found = row
    else break
  }
  return found < 0 ? err('#N/A') : table.get(found, columnIndex)
}

function conditional(args: EvalValue[], sum: boolean): CellValue {
  const [rangeArg, criterionArg, sumRangeArg] = args
  const range = asMatrix(rangeArg)
  const criterion = toScalar(criterionArg)
  if (isError(criterion)) return criterion
  const sumRange = sumRangeArg === undefined ? range : asMatrix(sumRangeArg)
  const matches = buildCriterion(criterion)
  let total = 0
  for (let row = 0; row < range.rows; row++) {
    for (let col = 0; col < range.cols; col++) {
      if (!matches(range.get(row, col))) continue
      if (!sum) {
        total++
        continue
      }
      const value = row < sumRange.rows && col < sumRange.cols ? sumRange.get(row, col) : null
      if (isError(value)) return value
      if (typeof value === 'number') total += value
    }
  }
  return total
}

function logical(args: EvalValue[], combine: 'and' | 'or'): CellValue {
  let seen = false
  let result = combine === 'and'
  for (const { value, fromRange } of flatten(args)) {
    if (isError(value)) return value
    if (fromRange && (value === null || typeof value === 'string')) continue
    const bool = toBoolean(value)
    if (isError(bool)) return bool
    seen = true
    result = combine === 'and' ? result && bool : result || bool
  }
  return seen ? result : err('#VALUE!')
}

export const FUNCTIONS: Record<string, FunctionSpec> = {
  SUM: { minArgs: 1, maxArgs: MANY, run: (args) => withNumbers(args, (n) => n.reduce((a, b) => a + b, 0)) },
  AVERAGE: {
    minArgs: 1,
    maxArgs: MANY,
    run: (args) => withNumbers(args, (n) => (n.length ? n.reduce((a, b) => a + b, 0) / n.length : err('#DIV/0!')))
  },
  MIN: { minArgs: 1, maxArgs: MANY, run: (args) => withNumbers(args, (n) => (n.length ? Math.min(...n) : 0)) },
  MAX: { minArgs: 1, maxArgs: MANY, run: (args) => withNumbers(args, (n) => (n.length ? Math.max(...n) : 0)) },
  PRODUCT: { minArgs: 1, maxArgs: MANY, run: (args) => withNumbers(args, (n) => n.reduce((a, b) => a * b, 1)) },
  COUNT: {
    minArgs: 1,
    maxArgs: MANY,
    run: (args) => {
      let count = 0
      for (const { value, fromRange } of flatten(args)) {
        if (typeof value === 'number') count++
        else if (!fromRange && value !== null && !isError(toNumber(value))) count++
      }
      return count
    }
  },
  COUNTA: {
    minArgs: 1,
    maxArgs: MANY,
    run: (args) => {
      let count = 0
      for (const { value } of flatten(args)) if (value !== null) count++
      return count
    }
  },
  SUMIF: { minArgs: 2, maxArgs: 3, run: (args) => conditional(args, true) },
  COUNTIF: { minArgs: 2, maxArgs: 2, run: (args) => conditional(args, false) },
  IF: {
    minArgs: 1,
    maxArgs: 3,
    run: ([condition, whenTrue, whenFalse]) => {
      const bool = toBoolean(condition)
      if (isError(bool)) return bool
      const chosen = bool ? whenTrue : whenFalse
      // =SI(A1>0;"sí") sin rama "si no" devuelve FALSO, como Excel.
      return chosen === undefined ? bool : toScalar(chosen)
    }
  },
  IFERROR: {
    minArgs: 2,
    maxArgs: 2,
    run: ([value, fallback]) => {
      const scalar = toScalar(value)
      return isError(scalar) ? toScalar(fallback) : scalar
    }
  },
  AND: { minArgs: 1, maxArgs: MANY, run: (args) => logical(args, 'and') },
  OR: { minArgs: 1, maxArgs: MANY, run: (args) => logical(args, 'or') },
  NOT: {
    minArgs: 1,
    maxArgs: 1,
    run: ([value]) => {
      const bool = toBoolean(value)
      return isError(bool) ? bool : !bool
    }
  },
  ROUND: { minArgs: 1, maxArgs: 2, run: numeric((value, digits = 0) => roundHalfAwayFromZero(value, digits)) },
  ABS: { minArgs: 1, maxArgs: 1, run: numeric(Math.abs) },
  INT: { minArgs: 1, maxArgs: 1, run: numeric(Math.floor) },
  MOD: {
    minArgs: 2,
    maxArgs: 2,
    // El resto de Excel tiene el signo del divisor: RESIDUO(-3;2) = 1 (en JS, -3 % 2 = -1).
    run: numeric((value, divisor) => (divisor === 0 ? err('#DIV/0!') : value - divisor * Math.floor(value / divisor)))
  },
  POWER: { minArgs: 2, maxArgs: 2, run: numeric((base, exponent) => base ** exponent) },
  SQRT: { minArgs: 1, maxArgs: 1, run: numeric((value) => (value < 0 ? err('#NUM!') : Math.sqrt(value))) },
  CONCATENATE: { minArgs: 1, maxArgs: MANY, run: (args) => concat(args, false) },
  CONCAT: { minArgs: 1, maxArgs: MANY, run: (args) => concat(args, true) },
  LEN: { minArgs: 1, maxArgs: 1, run: textual((text) => text.length) },
  UPPER: { minArgs: 1, maxArgs: 1, run: textual((text) => text.toLocaleUpperCase('es')) },
  LOWER: { minArgs: 1, maxArgs: 1, run: textual((text) => text.toLocaleLowerCase('es')) },
  TRIM: { minArgs: 1, maxArgs: 1, run: textual((text) => text.trim().replace(/ {2,}/g, ' ')) },
  LEFT: {
    minArgs: 1,
    maxArgs: 2,
    run: textual((text, count = 1) => (count < 0 ? err('#VALUE!') : text.slice(0, Math.trunc(count))))
  },
  RIGHT: {
    minArgs: 1,
    maxArgs: 2,
    run: textual((text, count = 1) =>
      count < 0 ? err('#VALUE!') : Math.trunc(count) === 0 ? '' : text.slice(-Math.trunc(count))
    )
  },
  VLOOKUP: { minArgs: 3, maxArgs: 4, run: vlookup }
}

function concat(args: EvalValue[], allowRanges: boolean): CellValue {
  let result = ''
  for (const arg of args) {
    if (isMatrix(arg) && !allowRanges) {
      const text = toText(arg)
      if (isError(text)) return text
      result += text
      continue
    }
    for (const { value } of flatten([arg])) {
      const text = toText(value)
      if (isError(text)) return text
      result += text
    }
  }
  return result
}

export function callFunction(name: string, args: EvalValue[]): CellValue {
  const spec = FUNCTIONS[name]
  if (!spec) return err('#NAME?')
  if (args.length < spec.minArgs || args.length > spec.maxArgs) return err('#VALUE!')
  return spec.run(args)
}
