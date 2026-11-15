/**
 * Primer paso del motor de fórmulas: convertir el texto en "tokens" (piezas con significado).
 * "SUMA(A1:B2;3)" -> [FUNC SUMA] [(] [REF A1] [:] [REF B2] [,] [NUM 3] [)]
 *
 * Separar el análisis léxico (qué piezas hay) del sintáctico (cómo se combinan, parser.ts)
 * es la forma clásica de escribir un lenguaje: cada parte es pequeña y se prueba por separado.
 */

export type Token =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'error'; value: string }
  /** Celda como "B3" o "$B$3", con prefijo de hoja opcional ("Ventas!B3", "'Mi hoja'!B3"). */
  | { type: 'ref'; sheet?: string; value: string }
  /** Columnas o filas enteras: "A:C", "$B:$B", "2:5", con prefijo de hoja opcional. */
  | { type: 'span'; sheet?: string; value: string; axis: 'columns' | 'rows' }
  /** Nombre seguido de "(": una función. */
  | { type: 'func'; name: string }
  /** Cualquier otro nombre: VERDADERO, FALSO o un nombre desconocido. */
  | { type: 'name'; value: string }
  | { type: 'operator'; value: string }
  | { type: 'paren'; value: '(' | ')' }
  /** Separador de argumentos. Aceptamos "," y ";" porque en español Excel usa ";". */
  | { type: 'separator' }
  | { type: 'colon' }

export class FormulaSyntaxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FormulaSyntaxError'
  }
}

const ERROR_LITERALS = ['#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#N/A', '#NUM!', '#CIRC!']
const TWO_CHAR_OPERATORS = ['<=', '>=', '<>']
const ONE_CHAR_OPERATORS = '+-*/^&=<>%'
const CELL_REF = /^\$?[A-Za-z]{1,3}\$?\d+$/
// Lo que sigue a un rango de columnas o filas no puede ser parte de un nombre ni de una celda.
const COLUMN_SPAN = /^\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}(?![\p{L}\d_.$(!])/u
const ROW_SPAN = /^\$?\d+:\$?\d+(?![\p{L}\d_.$(!])/u
// Letras (incluidas las acentuadas), dígitos, "_" y "." (SUMAR.SI, SI.ERROR).
const NAME_CHAR = /[\p{L}\d_.$]/u

export function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < source.length) {
    const char = source[i]

    if (/\s/.test(char)) {
      i++
      continue
    }

    if (char === '"') {
      // Las comillas dentro de un texto se escriben dobles: "Dijo ""hola""".
      let value = ''
      i++
      for (;;) {
        if (i >= source.length) throw new FormulaSyntaxError('Falta cerrar unas comillas.')
        if (source[i] === '"') {
          if (source[i + 1] === '"') {
            value += '"'
            i += 2
            continue
          }
          i++
          break
        }
        value += source[i++]
      }
      tokens.push({ type: 'string', value })
      continue
    }

    if (char === "'") {
      // Nombre de hoja con espacios: 'Mis datos'!A1
      const end = source.indexOf("'!", i + 1)
      if (end < 0) throw new FormulaSyntaxError('Falta cerrar el nombre de la hoja.')
      const sheet = source.slice(i + 1, end).replace(/''/g, "'")
      const token = readReferenceAfterSheet(source, end + 2, sheet)
      tokens.push(token)
      i = end + 2 + token.value.length
      continue
    }

    const span = readSpan(source, i)
    if (span) {
      tokens.push(span)
      i += span.value.length
      continue
    }

    if (/\d/.test(char) || (char === '.' && /\d/.test(source[i + 1] ?? ''))) {
      const match = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(source.slice(i))!
      // "1A" no es un número seguido de un nombre: es un error que detecta el bloque de nombres.
      if (!/\p{L}/u.test(source[i + match[0].length] ?? '')) {
        tokens.push({ type: 'number', value: Number(match[0]) })
        i += match[0].length
        continue
      }
    }

    if (char === '#') {
      const literal = ERROR_LITERALS.find((code) => source.startsWith(code, i))
      if (!literal) throw new FormulaSyntaxError(`Error desconocido en la posición ${i + 1}.`)
      tokens.push({ type: 'error', value: literal })
      i += literal.length
      continue
    }

    const twoChars = source.slice(i, i + 2)
    if (TWO_CHAR_OPERATORS.includes(twoChars)) {
      tokens.push({ type: 'operator', value: twoChars })
      i += 2
      continue
    }
    if (ONE_CHAR_OPERATORS.includes(char)) {
      tokens.push({ type: 'operator', value: char })
      i++
      continue
    }
    if (char === '(' || char === ')') {
      tokens.push({ type: 'paren', value: char })
      i++
      continue
    }
    if (char === ',' || char === ';') {
      tokens.push({ type: 'separator' })
      i++
      continue
    }
    if (char === ':') {
      tokens.push({ type: 'colon' })
      i++
      continue
    }

    if (NAME_CHAR.test(char)) {
      let end = i
      while (end < source.length && NAME_CHAR.test(source[end])) end++
      const word = source.slice(i, end)
      i = end
      if (source[i] === '!') {
        // Hoja sin comillas: Ventas!A1
        i++
        const token = readReferenceAfterSheet(source, i, word)
        tokens.push(token)
        i += token.value.length
      } else if (source[i] === '(') {
        tokens.push({ type: 'func', name: word.toUpperCase() })
      } else if (CELL_REF.test(word)) {
        tokens.push({ type: 'ref', value: word.toUpperCase() })
      } else {
        tokens.push({ type: 'name', value: word.toUpperCase() })
      }
      continue
    }

    throw new FormulaSyntaxError(`Carácter inesperado "${char}" en la posición ${i + 1}.`)
  }

  return tokens
}

function readSpan(source: string, start: number, sheet?: string): Extract<Token, { type: 'span' }> | null {
  const rest = source.slice(start)
  const columns = COLUMN_SPAN.exec(rest)
  if (columns)
    return { type: 'span', ...(sheet === undefined ? {} : { sheet }), value: columns[0].toUpperCase(), axis: 'columns' }
  const rows = ROW_SPAN.exec(rest)
  if (rows) return { type: 'span', ...(sheet === undefined ? {} : { sheet }), value: rows[0], axis: 'rows' }
  return null
}

function readReferenceAfterSheet(
  source: string,
  start: number,
  sheet: string
): Extract<Token, { type: 'ref' | 'span' }> {
  const span = readSpan(source, start, sheet)
  if (span) return span
  const match = /^\$?[A-Za-z]{1,3}\$?\d+/.exec(source.slice(start))
  if (!match) throw new FormulaSyntaxError(`Falta la celda después de "${sheet}!".`)
  return { type: 'ref', sheet, value: match[0].toUpperCase() }
}
