import type ExcelJS from 'exceljs'
import { createId } from '@/core/ids'
import { rangeAddress } from '../address'
import type { CellRange, ConditionalFormat, ConditionalRule } from '../types'
import { argbToHex, hexToArgb } from './xlsxFormats'

/**
 * Formato condicional: reglas de Tintero <-> reglas de Excel (las que escribe y lee ExcelJS).
 * Tintero tiene cinco tipos de regla; Excel muchos más. Las que no tienen equivalente se cuentan
 * para avisar en vez de inventar una aproximación que se vería distinta.
 */

type ExcelRule = ExcelJS.ConditionalFormattingRule
type ExcelStyle = Partial<ExcelJS.Style>

export interface ImportedConditionalFormats {
  formats: ConditionalFormat[]
  unsupported: number
}

export function importConditionalFormats(
  options: ExcelJS.ConditionalFormattingOptions[] | undefined,
  parseRange: (text: string) => CellRange | null
): ImportedConditionalFormats {
  const formats: ConditionalFormat[] = []
  let unsupported = 0
  for (const option of options ?? []) {
    // Excel admite varias áreas separadas por espacios ("A1:A5 C1:C5"): una regla por área.
    const ranges = option.ref
      .split(/\s+/)
      .map(parseRange)
      .filter((range): range is CellRange => range !== null)
    for (const rule of option.rules) {
      const translated = fromExcelRule(rule)
      if (!translated || ranges.length === 0) {
        unsupported++
        continue
      }
      for (const range of ranges) formats.push({ id: createId('rule'), range, ...translated })
    }
  }
  return { formats, unsupported }
}

function fromExcelRule(rule: ExcelRule): Omit<ConditionalFormat, 'id' | 'range'> | null {
  const style = fromExcelStyle((rule as { style?: ExcelStyle }).style)
  switch (rule.type) {
    case 'cellIs': {
      const values = (rule.formulae ?? []).map((formula) => Number(formula))
      if (values.some((value) => !Number.isFinite(value))) return null // comparar con una fórmula o una celda
      if (rule.operator === 'greaterThan' && values.length >= 1)
        return withStyle({ kind: 'greaterThan', value: values[0] }, style)
      if (rule.operator === 'lessThan' && values.length >= 1)
        return withStyle({ kind: 'lessThan', value: values[0] }, style)
      if (rule.operator === 'between' && values.length >= 2) {
        return withStyle({ kind: 'between', min: Math.min(...values), max: Math.max(...values) }, style)
      }
      return null
    }
    case 'containsText': {
      const text = rule.text || searchedText((rule as { formulae?: string[] }).formulae?.[0])
      return rule.operator === 'containsText' && text ? withStyle({ kind: 'textContains', text }, style) : null
    }
    case 'colorScale': {
      const colors = (rule.color ?? []).map((color) => argbToHex(color.argb))
      const [first, last] = [colors[0], colors.at(-1)]
      // Solo la escala de dos colores entre el mínimo y el máximo; la de tres se vería distinta.
      if (colors.length !== 2 || !first || !last) return null
      const types = (rule.cfvo ?? []).map((cfvo) => cfvo.type)
      if (types[0] !== 'min' || types[1] !== 'max') return null
      return { rule: { kind: 'colorScale', minColor: first, maxColor: last } }
    }
    default:
      return null
  }
}

/**
 * El texto buscado también va dentro de la fórmula que Excel guarda para la regla
 * (`NOT(ISERROR(SEARCH("urgente",B2)))`). Algunos lectores, como ExcelJS, solo leen esa fórmula.
 */
function searchedText(formula: string | undefined): string | null {
  const match = formula ? /SEARCH\("((?:[^"]|"")*)"/i.exec(formula) : null
  return match ? match[1].replace(/""/g, '"') : null
}

function withStyle(rule: ConditionalRule, style: ConditionalFormat['style']): Omit<ConditionalFormat, 'id' | 'range'> {
  return style ? { rule, style } : { rule }
}

/** Estilo diferencial de Excel (dxf) -> el subconjunto que aplica Tintero: negrita, color y relleno. */
function fromExcelStyle(style: ExcelStyle | undefined): ConditionalFormat['style'] {
  if (!style) return undefined
  const result: NonNullable<ConditionalFormat['style']> = {}
  if (style.font?.bold) result.bold = true
  const color = argbToHex(style.font?.color?.argb)
  if (color) result.color = color
  // En un dxf, Excel guarda el color de relleno en bgColor; otros programas, en fgColor.
  const fill =
    style.fill?.type === 'pattern'
      ? (argbToHex(style.fill.bgColor?.argb) ?? argbToHex(style.fill.fgColor?.argb))
      : undefined
  if (fill) result.fill = fill
  return Object.keys(result).length > 0 ? result : undefined
}

export function exportConditionalFormats(worksheet: ExcelJS.Worksheet, formats: ConditionalFormat[] | undefined): void {
  formats?.forEach((format, index) => {
    worksheet.addConditionalFormatting({
      ref: rangeAddress(format.range),
      rules: [toExcelRule(format, index + 1)]
    })
  })
}

function toExcelRule(format: ConditionalFormat, priority: number): ExcelRule {
  const style = toExcelStyle(format.style)
  const rule = format.rule
  switch (rule.kind) {
    case 'greaterThan':
      return { type: 'cellIs', operator: 'greaterThan', formulae: [rule.value], style, priority }
    case 'lessThan':
      return { type: 'cellIs', operator: 'lessThan', formulae: [rule.value], style, priority }
    case 'between':
      return { type: 'cellIs', operator: 'between', formulae: [rule.min, rule.max], style, priority }
    case 'textContains':
      return { type: 'containsText', operator: 'containsText', text: rule.text, style, priority }
    case 'colorScale':
      return {
        type: 'colorScale',
        cfvo: [{ type: 'min' }, { type: 'max' }],
        color: [{ argb: hexToArgb(rule.minColor) }, { argb: hexToArgb(rule.maxColor) }],
        priority
      }
  }
}

function toExcelStyle(style: ConditionalFormat['style']): ExcelStyle {
  const result: ExcelStyle = {}
  if (style?.bold || style?.color) {
    result.font = { bold: style.bold, ...(style.color ? { color: { argb: hexToArgb(style.color) } } : {}) }
  }
  if (style?.fill) result.fill = { type: 'pattern', pattern: 'solid', bgColor: { argb: hexToArgb(style.fill) } }
  return result
}
