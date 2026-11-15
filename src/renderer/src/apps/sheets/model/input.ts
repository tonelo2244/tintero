import { dateToSerial, formatDate } from './format'
import { toCanonicalFormula, toLocalizedFormula } from './formula/transform'
import type { Cell, NumberFormat, Scalar } from './types'

/**
 * Lo que el usuario escribe en una celda -> lo que se guarda. Es el paso inverso de format.ts.
 * Igual que Excel, reconocemos el tipo al escribir: "12,5" es un número, "50%" un porcentaje,
 * "15/11/2026" una fecha y "=SUMA(A1:A3)" una fórmula. Un apóstrofo inicial fuerza texto.
 */
export type ParsedInput =
  { kind: 'empty' } | { kind: 'formula'; formula: string } | { kind: 'value'; value: Scalar; format?: NumberFormat }

/**
 * Número escrito a la española o a la inglesa. Reglas, en este orden:
 *   - con coma: la coma es decimal y los puntos son miles ("1.234,5" -> 1234.5)
 *   - solo puntos en grupos de 3 ("1.234.567"): son miles
 *   - un único punto ("3.5"): decimal, para no castigar a quien escribe a la inglesa
 */
export function parseNumberText(text: string): number | null {
  const clean = text.trim().replace(/\s/g, '')
  if (clean === '') return null
  let normalized: string
  if (clean.includes(',')) {
    if (!/^[+-]?(\d{1,3}(\.\d{3})+|\d*),\d*$/.test(clean)) return null
    normalized = clean.replace(/\./g, '').replace(',', '.')
  } else if (/^[+-]?\d{1,3}(\.\d{3}){2,}$/.test(clean) || /^[+-]?\d{1,3}\.\d{3}$/.test(clean)) {
    normalized = clean.replace(/\./g, '')
  } else {
    normalized = clean
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(normalized)) return null
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

export function parseUserInput(text: string): ParsedInput {
  if (text.trim() === '') return { kind: 'empty' }
  if (text.startsWith("'")) return { kind: 'value', value: text.slice(1) }
  if (text.startsWith('=') && text.length > 1) return { kind: 'formula', formula: text.slice(1) }

  const trimmed = text.trim()
  const upper = trimmed.toUpperCase()
  if (upper === 'VERDADERO' || upper === 'TRUE') return { kind: 'value', value: true }
  if (upper === 'FALSO' || upper === 'FALSE') return { kind: 'value', value: false }

  const percent = /^(.*)%$/.exec(trimmed)
  if (percent) {
    const number = parseNumberText(percent[1])
    if (number !== null)
      return { kind: 'value', value: number / 100, format: { kind: 'percent', decimals: decimalsOf(percent[1]) } }
  }

  const currency = /^€\s*(.+)$|^(.+?)\s*€$/.exec(trimmed)
  if (currency) {
    const number = parseNumberText(currency[1] ?? currency[2])
    if (number !== null) return { kind: 'value', value: number, format: { kind: 'currency', decimals: 2 } }
  }

  const date = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(trimmed)
  if (date) {
    const day = Number(date[1])
    const month = Number(date[2])
    const year = date[3].length === 2 ? 2000 + Number(date[3]) : Number(date[3])
    if (isValidDate(year, month, day)) {
      return { kind: 'value', value: dateToSerial(year, month, day), format: { kind: 'date' } }
    }
  }

  const number = parseNumberText(trimmed)
  if (number !== null) return { kind: 'value', value: number }
  return { kind: 'value', value: text }
}

function decimalsOf(text: string): number {
  const match = /[.,](\d+)\s*$/.exec(text)
  return match ? match[1].length : 0
}

function isValidDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * Convierte lo escrito en la celda que se guardará, conservando su formato.
 * Devuelve null si la celda queda vacía y sin formato (se borra del mapa disperso).
 *
 * Si la fórmula no se puede entender, se guarda tal cual: el usuario ve #¿NOMBRE? en la celda
 * y puede corregirla, en vez de perder lo que escribió.
 */
export function cellFromInput(text: string, previous: Cell | undefined): Cell | null {
  const parsed = parseUserInput(text)
  const style = previous?.style
  if (parsed.kind === 'empty') return style ? { style } : null
  if (parsed.kind === 'formula') {
    let formula: string
    try {
      formula = toCanonicalFormula(parsed.formula)
    } catch {
      formula = parsed.formula
    }
    return withStyle({ formula }, style)
  }
  // El formato reconocido ("50%") solo se aplica si la celda no tenía ya uno elegido por el usuario.
  const hasFormat = style?.numberFormat && style.numberFormat.kind !== 'general'
  const nextStyle = parsed.format && !hasFormat ? { ...style, numberFormat: parsed.format } : style
  return withStyle({ value: parsed.value }, nextStyle)
}

function withStyle(cell: Cell, style: Cell['style']): Cell {
  return style && Object.keys(style).length > 0 ? { ...cell, style } : cell
}

/** Lo que se ve al editar una celda (F2, doble clic o la barra de fórmulas). */
export function cellEditText(cell: Cell | undefined): string {
  if (!cell) return ''
  if (cell.formula !== undefined) return `=${toLocalizedFormula(cell.formula)}`
  const value = cell.value
  if (value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'VERDADERO' : 'FALSO'
  if (typeof value === 'string') {
    // Un texto que parece número ("007") necesita el apóstrofo para seguir siendo texto al confirmar.
    const reparsed = parseUserInput(value)
    const staysText = reparsed.kind === 'value' && typeof reparsed.value === 'string'
    return staysText ? value : `'${value}`
  }
  const format = cell.style?.numberFormat
  if (format?.kind === 'date') return formatDate(value)
  if (format?.kind === 'percent') return `${editableNumber(value * 100)}%`
  return editableNumber(value)
}

/** Número completo (15 cifras, sin miles) con coma decimal: lo que se puede volver a escribir tal cual. */
function editableNumber(value: number): string {
  const text = String(Number(value.toPrecision(15)))
  return text.includes('e') ? text : text.replace('.', ',')
}
