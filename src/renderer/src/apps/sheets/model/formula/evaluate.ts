import type { CellValue } from '../types'
import type { BinaryOperator, FormulaNode, RefCoord } from './ast'
import { callFunction } from './functions'
import { compareValues, err, isError, toNumber, toScalar, toText, type EvalValue, type Matrix } from './values'

/**
 * Lo que el evaluador necesita saber del libro: leer celdas y rangos.
 * `sheet` es el nombre escrito en la fórmula, o undefined para "la hoja de la fórmula".
 * Devolver null en `range` significa que la hoja no existe (-> #¡REF!).
 */
export interface EvaluationContext {
  cell(sheet: string | undefined, row: number, col: number): CellValue
  range(sheet: string | undefined, start: RefCoord, end: RefCoord): Matrix | null
}

/** Evalúa una fórmula completa. Una celda que solo apunta a una vacía muestra 0, como en Excel. */
export function evaluateFormula(node: FormulaNode, context: EvaluationContext): CellValue {
  const value = toScalar(evaluateNode(node, context))
  if (value === null) return 0
  if (typeof value === 'number' && !Number.isFinite(value)) return err('#NUM!')
  return value
}

export function evaluateNode(node: FormulaNode, context: EvaluationContext): EvalValue {
  switch (node.type) {
    case 'number':
    case 'string':
    case 'boolean':
      return node.value
    case 'error':
      return err(node.code)
    case 'name':
      return err('#NAME?')
    case 'empty':
      return null
    case 'ref':
      return context.cell(node.sheet, node.ref.row, node.ref.col)
    case 'range':
      return context.range(node.sheet, node.start, node.end) ?? err('#REF!')
    case 'group':
      return evaluateNode(node.inner, context)
    case 'call':
      // Un argumento omitido llega como undefined: para la función es igual que no escribirlo.
      return callFunction(
        node.name,
        node.args.map((arg) =>
          arg.type === 'empty' ? (undefined as unknown as EvalValue) : evaluateNode(arg, context)
        )
      )
    case 'unary': {
      const operand = toNumber(evaluateNode(node.operand, context))
      if (isError(operand)) return operand
      if (node.operator === '-') return -operand
      if (node.operator === '%') return operand / 100
      return operand
    }
    case 'binary':
      return evaluateBinary(node.operator, evaluateNode(node.left, context), evaluateNode(node.right, context))
  }
}

function evaluateBinary(operator: BinaryOperator, leftValue: EvalValue, rightValue: EvalValue): CellValue {
  if (operator === '&') {
    const left = toText(leftValue)
    if (isError(left)) return left
    const right = toText(rightValue)
    if (isError(right)) return right
    return left + right
  }

  if (['=', '<>', '<', '>', '<=', '>='].includes(operator)) {
    const left = toScalar(leftValue)
    if (isError(left)) return left
    const right = toScalar(rightValue)
    if (isError(right)) return right
    const order = compareValues(left, right)
    switch (operator) {
      case '=':
        return order === 0
      case '<>':
        return order !== 0
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

  const left = toNumber(leftValue)
  if (isError(left)) return left
  const right = toNumber(rightValue)
  if (isError(right)) return right
  switch (operator) {
    case '+':
      return left + right
    case '-':
      return left - right
    case '*':
      return left * right
    case '/':
      return right === 0 ? err('#DIV/0!') : left / right
    default: {
      const power = left ** right
      return Number.isFinite(power) ? power : err('#NUM!')
    }
  }
}
