import { columnIndex, MAX_COLUMNS, MAX_ROWS } from '../address'
import type { ErrorCode } from '../types'
import type { BinaryOperator, FormulaNode, RefCoord } from './ast'
import { canonicalFunctionName } from './functionNames'
import { FormulaSyntaxError, tokenize, type Token } from './tokenizer'

/**
 * Parser de descenso recursivo: una función por nivel de precedencia, de menor a mayor.
 * Es el tipo de parser más fácil de leer y de depurar, y sobra para el lenguaje de fórmulas.
 *
 *   comparación  =  <>  <  >  <=  >=
 *   concatenar   &
 *   suma         +  -
 *   producto     *  /
 *   potencia     ^
 *   porcentaje   %        (sufijo)
 *   signo        -  +     (prefijo; como en Excel, -2^2 = 4)
 *   primario     número, texto, celda, rango, función, (paréntesis)
 */
export function parseFormula(source: string): FormulaNode {
  const parser = new Parser(tokenize(source))
  const node = parser.parseExpression()
  if (!parser.atEnd()) throw new FormulaSyntaxError('Sobra algo al final de la fórmula.')
  return node
}

const COMPARISON = ['=', '<>', '<', '>', '<=', '>=']
const BOOLEAN_NAMES: Record<string, boolean> = { TRUE: true, FALSE: false, VERDADERO: true, FALSO: false }

class Parser {
  private position = 0

  constructor(private readonly tokens: Token[]) {}

  atEnd(): boolean {
    return this.position >= this.tokens.length
  }

  parseExpression(): FormulaNode {
    return this.parseComparison()
  }

  private parseComparison(): FormulaNode {
    let left = this.parseConcat()
    while (this.peekOperator(COMPARISON)) {
      const operator = this.next().value as BinaryOperator
      left = { type: 'binary', operator, left, right: this.parseConcat() }
    }
    return left
  }

  private parseConcat(): FormulaNode {
    let left = this.parseAdditive()
    while (this.peekOperator(['&'])) {
      this.next()
      left = { type: 'binary', operator: '&', left, right: this.parseAdditive() }
    }
    return left
  }

  private parseAdditive(): FormulaNode {
    let left = this.parseMultiplicative()
    while (this.peekOperator(['+', '-'])) {
      const operator = this.next().value as BinaryOperator
      left = { type: 'binary', operator, left, right: this.parseMultiplicative() }
    }
    return left
  }

  private parseMultiplicative(): FormulaNode {
    let left = this.parsePower()
    while (this.peekOperator(['*', '/'])) {
      const operator = this.next().value as BinaryOperator
      left = { type: 'binary', operator, left, right: this.parsePower() }
    }
    return left
  }

  private parsePower(): FormulaNode {
    // Excel evalúa 2^3^2 de izquierda a derecha: (2^3)^2 = 64.
    let left = this.parsePercent()
    while (this.peekOperator(['^'])) {
      this.next()
      left = { type: 'binary', operator: '^', left, right: this.parsePercent() }
    }
    return left
  }

  private parsePercent(): FormulaNode {
    let operand = this.parseUnary()
    while (this.peekOperator(['%'])) {
      this.next()
      operand = { type: 'unary', operator: '%', operand }
    }
    return operand
  }

  private parseUnary(): FormulaNode {
    if (this.peekOperator(['-', '+'])) {
      const operator = this.next().value as '-' | '+'
      return { type: 'unary', operator, operand: this.parseUnary() }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): FormulaNode {
    const token = this.tokens[this.position]
    if (!token) throw new FormulaSyntaxError('La fórmula está incompleta.')
    this.position++

    switch (token.type) {
      case 'number':
        return { type: 'number', value: token.value }
      case 'string':
        return { type: 'string', value: token.value }
      case 'error':
        return { type: 'error', code: token.value as ErrorCode }
      case 'ref':
        return this.parseReference(token)
      case 'span':
        return parseSpan(token)
      case 'func':
        return this.parseCall(token.name)
      case 'name':
        if (token.value in BOOLEAN_NAMES) return { type: 'boolean', value: BOOLEAN_NAMES[token.value] }
        return { type: 'name', value: token.value }
      case 'paren':
        if (token.value === '(') {
          const inner = this.parseExpression()
          this.expectParen(')')
          return { type: 'group', inner }
        }
        throw new FormulaSyntaxError('Sobra un paréntesis de cierre.')
      default:
        throw new FormulaSyntaxError('Falta un valor en la fórmula.')
    }
  }

  private parseReference(token: Extract<Token, { type: 'ref' }>): FormulaNode {
    const start = parseRefCoord(token.value)
    if (this.tokens[this.position]?.type !== 'colon') return { type: 'ref', sheet: token.sheet, ref: start }
    this.position++
    const endToken = this.tokens[this.position++]
    if (endToken?.type !== 'ref') throw new FormulaSyntaxError('Falta la celda final del rango.')
    return { type: 'range', sheet: token.sheet, start, end: parseRefCoord(endToken.value) }
  }

  private parseCall(rawName: string): FormulaNode {
    this.expectParen('(')
    const args: FormulaNode[] = []
    if (this.peekParen(')')) {
      this.position++
      return { type: 'call', name: canonicalFunctionName(rawName), args }
    }
    for (;;) {
      args.push(this.peekArgumentEnd() ? { type: 'empty' } : this.parseExpression())
      const token = this.tokens[this.position++]
      if (token?.type === 'separator') continue
      if (token?.type === 'paren' && token.value === ')') break
      throw new FormulaSyntaxError(`Falta cerrar el paréntesis de ${rawName}.`)
    }
    return { type: 'call', name: canonicalFunctionName(rawName), args }
  }

  private peekOperator(operators: string[]): boolean {
    const token = this.tokens[this.position]
    return token?.type === 'operator' && operators.includes(token.value)
  }

  /** ¿Empieza aquí un argumento vacío? (un ";" o el ")" final justo detrás de otro ";"). */
  private peekArgumentEnd(): boolean {
    const token = this.tokens[this.position]
    return token?.type === 'separator' || (token?.type === 'paren' && token.value === ')')
  }

  private peekParen(value: '(' | ')'): boolean {
    const token = this.tokens[this.position]
    return token?.type === 'paren' && token.value === value
  }

  private expectParen(value: '(' | ')'): void {
    if (!this.peekParen(value)) throw new FormulaSyntaxError(`Falta un "${value}".`)
    this.position++
  }

  private next(): Extract<Token, { type: 'operator' }> {
    return this.tokens[this.position++] as Extract<Token, { type: 'operator' }>
  }
}

function parseRefCoord(text: string): RefCoord {
  const match = /^(\$?)([A-Z]{1,3})(\$?)(\d+)$/.exec(text)!
  if (Number(match[4]) < 1) throw new FormulaSyntaxError(`"${text}" no es una celda: las filas empiezan en 1.`)
  return {
    col: columnIndex(match[2]),
    row: Number(match[4]) - 1,
    colAbsolute: match[1] === '$',
    rowAbsolute: match[3] === '$'
  }
}

/**
 * "A:C" -> rango de A1 a C10000; "2:5" -> de A2 a ZZ5. La dimensión que no se escribe se marca
 * como absoluta: así copiar =SUMA(A:A) una fila abajo no la convierte en A2:A10001.
 */
function parseSpan(token: Extract<Token, { type: 'span' }>): FormulaNode {
  const [first, second] = token.value.split(':')
  const sheet = token.sheet === undefined ? {} : { sheet: token.sheet }
  if (token.axis === 'columns') {
    const column = (text: string, row: number): RefCoord => ({
      col: columnIndex(text.replace('$', '')),
      row,
      colAbsolute: text.startsWith('$'),
      rowAbsolute: true
    })
    const start = column(first, 0)
    const end = column(second, MAX_ROWS - 1)
    if (start.col < 0 || end.col < 0 || start.col >= MAX_COLUMNS || end.col >= MAX_COLUMNS) {
      throw new FormulaSyntaxError(`"${token.value}" no es un rango de columnas válido.`)
    }
    return { type: 'range', ...sheet, start, end, span: 'columns' }
  }
  const row = (text: string, col: number): RefCoord => ({
    row: Number(text.replace('$', '')) - 1,
    col,
    rowAbsolute: text.startsWith('$'),
    colAbsolute: true
  })
  const start = row(first, 0)
  const end = row(second, MAX_COLUMNS - 1)
  if (start.row < 0 || end.row < 0 || start.row >= MAX_ROWS || end.row >= MAX_ROWS) {
    throw new FormulaSyntaxError(`"${token.value}" no es un rango de filas válido.`)
  }
  return { type: 'range', ...sheet, start, end, span: 'rows' }
}
