import { columnName } from '../address'
import type { ErrorCode } from '../types'
import type { FormulaNode, RefCoord } from './ast'
import { localizedFunctionName } from './functionNames'

/**
 * Convierte un AST otra vez en texto. Hay dos "dialectos":
 *   - 'canonical': inglés y "," (lo que se guarda en .tsheet y en .xlsx): SUM(A1:A3,2)
 *   - 'es': lo que ve el usuario en la barra de fórmulas:                 SUMA(A1:A3;2)
 *
 * Los números siempre se escriben con punto decimal dentro de las fórmulas. Si usáramos la coma
 * decimal española, "SUMA(1,5;2)" sería ambiguo para quien pegue fórmulas en inglés.
 */
export type FormulaDialect = 'canonical' | 'es'

const SPANISH_ERRORS: Record<ErrorCode, string> = {
  '#DIV/0!': '#¡DIV/0!',
  '#VALUE!': '#¡VALOR!',
  '#REF!': '#¡REF!',
  '#NAME?': '#¿NOMBRE?',
  '#N/A': '#N/D',
  '#NUM!': '#¡NUM!',
  '#CIRC!': '#¡CIRCULAR!'
}

export function localizedError(code: ErrorCode): string {
  return SPANISH_ERRORS[code]
}

export function printFormula(node: FormulaNode, dialect: FormulaDialect): string {
  const print = (child: FormulaNode) => printFormula(child, dialect)
  switch (node.type) {
    case 'number':
      return formatNumberLiteral(node.value)
    case 'string':
      return `"${node.value.replace(/"/g, '""')}"`
    case 'boolean':
      if (dialect === 'es') return node.value ? 'VERDADERO' : 'FALSO'
      return node.value ? 'TRUE' : 'FALSE'
    case 'error':
      return dialect === 'es' ? localizedError(node.code) : node.code
    case 'ref':
      return sheetPrefix(node.sheet) + printRef(node.ref)
    case 'range':
      return `${sheetPrefix(node.sheet)}${printRangeBody(node)}`
    case 'unary':
      return node.operator === '%' ? `${print(node.operand)}%` : `${node.operator}${print(node.operand)}`
    case 'binary':
      return `${print(node.left)}${node.operator}${print(node.right)}`
    case 'call': {
      const name = dialect === 'es' ? localizedFunctionName(node.name) : node.name
      return `${name}(${node.args.map(print).join(dialect === 'es' ? ';' : ',')})`
    }
    case 'group':
      return `(${print(node.inner)})`
    case 'name':
      return node.value
    case 'empty':
      return ''
  }
}

export function printRef(ref: RefCoord): string {
  return `${ref.colAbsolute ? '$' : ''}${columnName(ref.col)}${ref.rowAbsolute ? '$' : ''}${ref.row + 1}`
}

function printRangeBody(node: Extract<FormulaNode, { type: 'range' }>): string {
  if (node.span === 'columns') {
    const column = (ref: RefCoord) => `${ref.colAbsolute ? '$' : ''}${columnName(ref.col)}`
    return `${column(node.start)}:${column(node.end)}`
  }
  if (node.span === 'rows') {
    const row = (ref: RefCoord) => `${ref.rowAbsolute ? '$' : ''}${ref.row + 1}`
    return `${row(node.start)}:${row(node.end)}`
  }
  return `${printRef(node.start)}:${printRef(node.end)}`
}

/** Las hojas con espacios o símbolos van entre comillas simples: 'Mis datos'!A1 */
export function sheetPrefix(sheet: string | undefined): string {
  if (sheet === undefined) return ''
  if (/^[\p{L}_][\p{L}\d_.]*$/u.test(sheet) && !/^[A-Za-z]{1,3}\d+$/.test(sheet)) return `${sheet}!`
  return `'${sheet.replace(/'/g, "''")}'!`
}

function formatNumberLiteral(value: number): string {
  // 15 cifras significativas, como Excel: evita escribir 0.30000000000000004.
  return String(Number(value.toPrecision(15)))
}
