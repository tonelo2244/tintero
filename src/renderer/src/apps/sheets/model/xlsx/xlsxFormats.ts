import type { NumberFormat } from '../types'

/**
 * Traducción entre nuestros formatos de número y los "códigos de formato" de Excel
 * ('#,##0.00', '0%', 'dd/mm/yyyy'...). Pura y sin ExcelJS, para poder probarla aislada.
 */

export function toExcelNumberFormat(format: NumberFormat | undefined): string | undefined {
  if (!format || format.kind === 'general') return undefined
  const decimals = format.decimals ?? 2
  const fraction = decimals > 0 ? `.${'0'.repeat(decimals)}` : ''
  switch (format.kind) {
    case 'number':
      return `#,##0${fraction}`
    case 'currency':
      return `#,##0${fraction} "€"`
    case 'percent':
      return `0${fraction}%`
    case 'date':
      return 'dd/mm/yyyy'
    case 'text':
      return '@'
  }
}

/**
 * Código de Excel -> formato nuestro. Los formatos personalizados que no sabemos representar
 * devuelven `lossy: true`, para avisar al usuario de que se ven distintos.
 */
export function fromExcelNumberFormat(code: string | undefined): { format?: NumberFormat; lossy: boolean } {
  if (!code || code === 'General') return { lossy: false }
  // Lo que va entre comillas o corchetes es texto literal o una configuración regional, no el patrón.
  const pattern = code.split(';')[0].replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')
  const decimals = /\.(0+)/.exec(pattern)?.[1].length ?? 0

  if (code === '@') return { format: { kind: 'text' }, lossy: false }
  if (pattern.includes('%')) return { format: { kind: 'percent', decimals }, lossy: false }
  if (/€|EUR/.test(code)) return { format: { kind: 'currency', decimals }, lossy: false }
  if (/[$£¥]/.test(code)) return { format: { kind: 'currency', decimals }, lossy: true }
  if (/[dy]/i.test(pattern) || /m{1,4}.*[/-]|[/-].*m{1,4}/i.test(pattern)) {
    return { format: { kind: 'date' }, lossy: !/^d{1,2}[/-]m{1,2}[/-]y{2,4}$/i.test(pattern.trim()) }
  }
  if (/^#,##0(\.0+)?$/.test(pattern.trim())) return { format: { kind: 'number', decimals }, lossy: false }
  if (/^0(\.0+)?$/.test(pattern.trim())) return { format: { kind: 'number', decimals }, lossy: true }
  return { lossy: true }
}

/** Ancho de columna: Excel lo mide en "caracteres" de la fuente por defecto; nosotros en píxeles. */
export function pixelsToExcelWidth(pixels: number): number {
  return Math.max(1, Math.round(((pixels - 5) / 7) * 100) / 100)
}

export function excelWidthToPixels(width: number): number {
  return Math.round(width * 7 + 5)
}

/** 'FF1F7A4D' (ARGB de Excel) <-> '#1f7a4d'. */
export function argbToHex(argb: string | undefined): string | undefined {
  if (!argb || !/^[0-9a-f]{8}$/i.test(argb)) return undefined
  return `#${argb.slice(2).toLowerCase()}`
}

export function hexToArgb(hex: string): string {
  return `FF${hex.replace('#', '').toUpperCase()}`
}
