import { localizedError } from './formula/printer'
import type { CellValue, HorizontalAlign, NumberFormat } from './types'

/**
 * De valor a texto visible, con las convenciones de España: coma decimal, punto de miles,
 * "€" detrás y fechas dd/mm/aaaa. Puro: la cuadrícula, la impresión y el CSV lo comparten.
 */

const formatters = new Map<string, Intl.NumberFormat>()

/** Crear un Intl.NumberFormat es caro; la cuadrícula formatea cientos de celdas por fotograma. */
function numberFormatter(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat('es-ES', options)
    formatters.set(key, formatter)
  }
  return formatter
}

// En es-ES, Intl no agrupa los miles de los números de 4 cifras ("1234,50") salvo con 'always'.
const ALWAYS_GROUP = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions

/** Formato "General" de Excel: sin miles, hasta 10 cifras significativas y notación científica si no cabe. */
export function formatGeneralNumber(value: number): string {
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1e11 || abs < 1e-9) {
    const [mantissa, exponent] = value.toExponential(5).split('e')
    const cleanMantissa = mantissa.replace(/\.?0+$/, '').replace('.', ',')
    const sign = exponent.startsWith('-') ? '-' : '+'
    return `${cleanMantissa}E${sign}${exponent.replace(/^[+-]/, '').padStart(2, '0')}`
  }
  return numberFormatter('general', { useGrouping: false, maximumFractionDigits: 10 }).format(
    Number(value.toPrecision(10))
  )
}

/** Número de serie de Excel -> fecha. El día 0 es el 30/12/1899 (la convención de Excel y .xlsx). */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30)
const DAY_MS = 86_400_000

export function serialToDate(serial: number): Date {
  return new Date(EXCEL_EPOCH_MS + Math.round(serial * DAY_MS))
}

export function dateToSerial(year: number, month: number, day: number): number {
  return (Date.UTC(year, month - 1, day) - EXCEL_EPOCH_MS) / DAY_MS
}

export function formatDate(serial: number): string {
  const date = serialToDate(serial)
  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${date.getUTCFullYear()}`
}

export function formatNumber(value: number, format: NumberFormat | undefined): string {
  const decimals = format?.decimals ?? 2
  switch (format?.kind ?? 'general') {
    case 'number':
      return numberFormatter(`number-${decimals}`, {
        ...ALWAYS_GROUP,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(value)
    case 'currency':
      return numberFormatter(`currency-${decimals}`, {
        ...ALWAYS_GROUP,
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(value)
    case 'percent':
      return numberFormatter(`percent-${decimals}`, {
        style: 'percent',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(value)
    case 'date':
      return formatDate(value)
    default:
      return formatGeneralNumber(value)
  }
}

export function formatCellValue(value: CellValue, format?: NumberFormat): string {
  if (value === null) return ''
  if (typeof value === 'number') return formatNumber(value, format)
  if (typeof value === 'boolean') return value ? 'VERDADERO' : 'FALSO'
  if (typeof value === 'string') return value
  return localizedError(value.error)
}

/** Alineación "General": números a la derecha, texto a la izquierda, booleanos y errores al centro. */
export function defaultAlignment(value: CellValue): HorizontalAlign {
  if (typeof value === 'number') return 'right'
  if (typeof value === 'string' || value === null) return 'left'
  return 'center'
}
