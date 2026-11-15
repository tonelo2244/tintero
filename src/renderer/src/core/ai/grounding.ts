/**
 * "Los números nunca los inventa el modelo": utilidades para comprobarlo.
 *
 * Un modelo pequeño redacta bien pero calcula mal y, peor, se inventa cifras con aplomo. Cuando
 * una función de IA trabaja con datos (analizar una tabla, resumir un informe), el código calcula
 * o conoce los números de verdad y aquí se comprueba que cada cifra del texto generado es una de
 * ellas. Lo usan la app (para avisar al usuario) y el banco de evaluación (para medirlo).
 */

/**
 * Extrae los números de un texto escrito a la española o a la inglesa:
 * "1.234,5" -> 1234.5, "12,5 %" -> 12.5, "3.5" -> 3.5, "2026" -> 2026, "-4" -> -4.
 * Las fechas "15/11/2026" dan sus tres partes, que es lo que queremos: también se comprueban.
 */
export function extractNumbers(text: string): number[] {
  const numbers: number[] = []
  const pattern = /(?<![\p{L}\d])[-−]?\d+(?:[.,\u00a0 ]\d{3})*(?:[.,]\d+)?(?![\p{L}\d])/gu
  for (const match of text.matchAll(pattern)) {
    const value = parseLooseNumber(match[0])
    if (value !== null) numbers.push(value)
  }
  return numbers
}

function parseLooseNumber(raw: string): number | null {
  let text = raw.replace(/[\u00a0 ]/g, '').replace('−', '-')
  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    // El último separador es el decimal: "1.234,5" (español) o "1,234.5" (inglés).
    const decimal = lastComma > lastDot ? ',' : '.'
    const thousands = decimal === ',' ? '.' : ','
    text = text.split(thousands).join('').replace(decimal, '.')
  } else if (lastComma >= 0) {
    // Solo comas: "1,5" es decimal; "1,234,567" son miles.
    text = /^-?\d{1,3}(,\d{3}){2,}$/.test(text) ? text.replace(/,/g, '') : text.replace(',', '.')
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(text) && !/^-?0\./.test(text)) {
    // "1.234" o "1.234.567": miles a la española. (Ambiguo con 1.234 en inglés; en español es lo normal.)
    text = text.replace(/\./g, '')
  }
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

export interface GroundingOptions {
  /** Diferencia relativa admitida (redondeos al redactar: 1.234,56 -> "unos 1.235"). */
  relativeTolerance?: number
  /** Números con valor absoluto menor o igual que este se ignoran ("3 puntos", "la fase 2"). */
  ignoreAtOrBelow?: number
}

/** Cifras del texto que no corresponden a ningún número conocido. Vacío = todo fundamentado. */
export function ungroundedNumbers(text: string, known: number[], options: GroundingOptions = {}): number[] {
  const { relativeTolerance = 0.01, ignoreAtOrBelow = 10 } = options
  return extractNumbers(text).filter((value) => {
    if (Math.abs(value) <= ignoreAtOrBelow) return false
    return !known.some((candidate) => isClose(value, candidate, relativeTolerance))
  })
}

function isClose(value: number, candidate: number, tolerance: number): boolean {
  if (value === candidate) return true
  // Porcentajes: el código calcula 0,25 y el texto dice "25 %".
  if (isCloseRelative(value, candidate * 100, tolerance)) return true
  return isCloseRelative(value, candidate, tolerance)
}

function isCloseRelative(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance * Math.max(Math.abs(a), Math.abs(b))
}
