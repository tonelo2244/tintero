import { parseCellAddress, rangeContains } from './address'
import type { CellStyle, CellValue, ConditionalFormat, Sheet } from './types'

/**
 * Formato condicional: decide, para cada celda, qué formato añadir según su valor. Lo que se ve
 * en pantalla es el formato propio de la celda con esto encima; lo guardado no cambia.
 */
export type ConditionalStyler = (address: string, value: CellValue) => Partial<CellStyle> | undefined

/** Mezcla de dos colores "#rrggbb" (t = 0 -> a, t = 1 -> b). */
export function mixColors(a: string, b: string, t: number): string {
  const channel = (hex: string, index: number) => parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16)
  const mixed = [0, 1, 2].map((index) => Math.round(channel(a, index) + (channel(b, index) - channel(a, index)) * t))
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

function matches(format: ConditionalFormat, value: CellValue): boolean {
  const rule = format.rule
  switch (rule.kind) {
    case 'greaterThan':
      return typeof value === 'number' && value > rule.value
    case 'lessThan':
      return typeof value === 'number' && value < rule.value
    case 'between':
      return typeof value === 'number' && value >= Math.min(rule.min, rule.max) && value <= Math.max(rule.min, rule.max)
    case 'textContains':
      return typeof value === 'string' && value.toLowerCase().includes(rule.text.toLowerCase())
    case 'colorScale':
      return typeof value === 'number'
  }
}

/**
 * Prepara el "pintor" de una hoja. Las escalas de color necesitan el mínimo y el máximo de su rango,
 * así que se calculan una vez aquí (recorriendo las celdas que existen, no el rango entero).
 * Si varias reglas se cumplen, gana la primera de la lista, como en Excel.
 */
export function conditionalStyler(
  sheet: Sheet,
  valueAt: (address: string) => CellValue
): ConditionalStyler | undefined {
  const formats = sheet.conditionalFormats
  if (!formats?.length) return undefined
  const extremes = new Map<string, { min: number; max: number }>()
  for (const format of formats) {
    if (format.rule.kind !== 'colorScale') continue
    let min = Infinity
    let max = -Infinity
    for (const address of Object.keys(sheet.cells)) {
      const coord = parseCellAddress(address)
      if (!coord || !rangeContains(format.range, coord)) continue
      const value = valueAt(address)
      if (typeof value !== 'number') continue
      min = Math.min(min, value)
      max = Math.max(max, value)
    }
    if (min <= max) extremes.set(format.id, { min, max })
  }

  return (address, value) => {
    const coord = parseCellAddress(address)
    if (!coord) return undefined
    for (const format of formats) {
      if (!rangeContains(format.range, coord) || !matches(format, value)) continue
      if (format.rule.kind === 'colorScale') {
        const range = extremes.get(format.id)
        if (!range || typeof value !== 'number') continue
        const t = range.max === range.min ? 0.5 : (value - range.min) / (range.max - range.min)
        return { fill: mixColors(format.rule.minColor, format.rule.maxColor, t) }
      }
      return format.style
    }
    return undefined
  }
}
