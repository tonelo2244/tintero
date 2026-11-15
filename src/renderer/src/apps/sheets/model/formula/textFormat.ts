import { formatGeneralNumber, serialToDate } from '../format'
import type { CellValue, Scalar } from '../types'
import { err } from './values'

/**
 * TEXTO(valor; formato): los formatos más usados de Excel, con el resultado a la española
 * (coma decimal y punto de miles). Se aceptan los códigos en inglés y en español:
 *   números:  "0", "0.00", "#,##0.00", "#.##0,00", "0%", "0.0%", "0.00 €"
 *   fechas:   "dd/mm/yyyy", "dd/mm/aaaa", "d-mmm-aa", "mmmm", "dddd", "yyyy"
 *   horas:    "hh:mm", "hh:mm:ss"
 * Lo que no se reconoce se devuelve como número "General", que es lo menos sorprendente.
 */

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre'
]
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export function formatText(value: Scalar | null, pattern: string): CellValue {
  if (value === null) value = 0
  if (typeof value === 'boolean') return value ? 'VERDADERO' : 'FALSO'
  if (typeof value === 'string') {
    const number = Number(value.replace(',', '.'))
    if (value.trim() === '' || !Number.isFinite(number)) return value
    value = number
  }
  if (isDatePattern(pattern)) return value < 0 ? err('#VALUE!') : formatDatePattern(value, pattern)
  return formatNumberPattern(value, pattern)
}

function isDatePattern(pattern: string): boolean {
  // Sin lo que va entre comillas, ¿quedan códigos de fecha u hora?
  return /[dmyahs]/i.test(pattern.replace(/"[^"]*"/g, ''))
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

function formatDatePattern(serial: number, pattern: string): string {
  const date = serialToDate(serial)
  const seconds = Math.round((serial - Math.floor(serial)) * 86_400)
  const hours = Math.floor(seconds / 3600) % 24
  const minutes = Math.floor(seconds / 60) % 60
  const day = date.getUTCDate()
  const month = date.getUTCMonth()
  const year = date.getUTCFullYear()
  // "mm" es mes salvo detrás de horas o delante de segundos, la misma ambigüedad que resuelve Excel.
  const tokens = /"[^"]*"|yyyy|aaaa|yy|aa|dddd|ddd|dd|d|mmmm|mmm|mm|m|hh|h|ss|s|./gi
  const parts = pattern.match(tokens) ?? []
  return parts
    .map((part, index) => {
      const lower = part.toLowerCase()
      const previous = parts
        .slice(0, index)
        .reverse()
        .find((token) => /^[a-z]/i.test(token))
        ?.toLowerCase()
      const next = parts
        .slice(index + 1)
        .find((token) => /^[a-z]/i.test(token))
        ?.toLowerCase()
      const isMinutes = (lower === 'mm' || lower === 'm') && (previous?.startsWith('h') || next?.startsWith('s'))
      if (part.startsWith('"')) return part.slice(1, -1)
      if (isMinutes) return lower === 'mm' ? pad(minutes) : String(minutes)
      switch (lower) {
        case 'yyyy':
        case 'aaaa':
          return String(year)
        case 'yy':
        case 'aa':
          return pad(year % 100)
        case 'dddd':
          return WEEKDAYS[date.getUTCDay()]
        case 'ddd':
          return WEEKDAYS[date.getUTCDay()].slice(0, 3)
        case 'dd':
          return pad(day)
        case 'd':
          return String(day)
        case 'mmmm':
          return MONTHS[month]
        case 'mmm':
          return MONTHS[month].slice(0, 3)
        case 'mm':
          return pad(month + 1)
        case 'm':
          return String(month + 1)
        case 'hh':
          return pad(hours)
        case 'h':
          return String(hours)
        case 'ss':
          return pad(seconds % 60)
        case 's':
          return String(seconds % 60)
        default:
          return part
      }
    })
    .join('')
}

/**
 * Formato numérico: se busca el bloque de dígitos ("#,##0.00") y se decide cuál de "." y "," es
 * el decimal. Con los dos, el último es el decimal. Con uno solo, es de miles si se repite o si
 * va como en "#,##0" (detrás de "#" y seguido de tres marcadores); si no, es el decimal.
 * Lo de alrededor (texto, "€", "%") se copia tal cual.
 */
function formatNumberPattern(value: number, pattern: string): string {
  const match = /[#0][#0.,]*/.exec(pattern)
  if (!match) return pattern.trim() === '' ? '' : formatGeneralNumber(value)
  const body = match[0]
  const prefix = pattern.slice(0, match.index)
  const suffix = pattern.slice(match.index + body.length)

  const { grouping, fraction } = splitNumberBody(body)
  const scaled = suffix.includes('%') ? value * 100 : value
  const formatted = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: (fraction.match(/0/g) ?? []).length,
    maximumFractionDigits: fraction.length,
    // En es-ES, Intl no agrupa los números de 4 cifras salvo con 'always' (ver format.ts).
    useGrouping: (grouping ? 'always' : false) as unknown as boolean
  }).format(scaled)
  return `${unquote(prefix)}${formatted}${unquote(suffix)}`
}

function splitNumberBody(body: string): { grouping: boolean; fraction: string } {
  const separators = [...new Set(body.match(/[.,]/g) ?? [])]
  if (separators.length === 0) return { grouping: false, fraction: '' }
  if (separators.length === 2) {
    const decimal = body.lastIndexOf('.') > body.lastIndexOf(',') ? '.' : ','
    return { grouping: true, fraction: body.slice(body.lastIndexOf(decimal) + 1).replace(/[.,]/g, '') }
  }
  const [separator] = separators
  const count = body.split(separator).length - 1
  const at = body.indexOf(separator)
  const after = body.slice(at + 1)
  const looksLikeThousands = body[at - 1] === '#' && /^[#0]{3}$/.test(after)
  if (count > 1 || looksLikeThousands) return { grouping: true, fraction: '' }
  return { grouping: false, fraction: after }
}

function unquote(text: string): string {
  return text.replace(/"([^"]*)"/g, '$1').replace(/\\(.)/g, '$1')
}
