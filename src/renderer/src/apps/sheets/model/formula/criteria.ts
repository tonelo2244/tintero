import type { CellValue, Scalar } from '../types'
import { compareValues, isError } from './values'

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
