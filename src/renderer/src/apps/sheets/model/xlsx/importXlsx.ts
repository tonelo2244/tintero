import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import type { ImportResult } from '@/core/appModule'
import { cellAddress, MAX_COLUMNS, MAX_ROWS } from '../address'
import { createSheet, createWorkbook, validateSheetName } from '../factories'
import { dateToSerial } from '../format'
import type { FormulaNode } from '../formula/ast'
import { FUNCTIONS } from '../formula/functions'
import { localizedFunctionName } from '../formula/functionNames'
import { parseFormula } from '../formula/parser'
import { printFormula } from '../formula/printer'
import type { Cell, CellStyle, Scalar, Sheet, Workbook } from '../types'
import { argbToHex, excelWidthToPixels, fromExcelNumberFormat } from './xlsxFormats'

/**
 * .xlsx -> libro de Tintero con ExcelJS. Lo que no sabemos representar se pierde, pero se dice:
 * cada pérdida se apunta una sola vez en `warnings` y el shell se lo enseña al usuario.
 */
export async function importXlsx(bytes: Uint8Array): Promise<ImportResult<Workbook>> {
  const book = new ExcelJS.Workbook()
  // ExcelJS espera un ArrayBuffer exacto (no una vista sobre un buffer mayor).
  await book.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)

  const warnings = new Set<string>(await packageWarnings(bytes))
  const unknownFunctions = new Set<string>()
  // Fuentes distintas usadas en el libro: si todo usa una sola (la de por defecto), no hay nada que avisar.
  const fonts = new Set<string>()
  const sheets: Sheet[] = []

  for (const worksheet of book.worksheets) {
    if (worksheet.state !== 'visible') warnings.add('las hojas ocultas se muestran como hojas normales')
    const name = uniqueName(sheets, worksheet.name)
    const sheet = createSheet(name)
    readColumns(worksheet, sheet)

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (excelCell, colNumber) => {
        if (rowNumber > MAX_ROWS || colNumber > MAX_COLUMNS) {
          warnings.add(`los datos más allá de la fila ${MAX_ROWS} o la columna ZZ`)
          return
        }
        const font = excelCell.font
        if (font?.name || font?.size) fonts.add(`${font.name ?? ''}|${font.size ?? ''}`)
        const cell = readCell(excelCell, warnings, unknownFunctions)
        if (cell) sheet.cells[cellAddress({ row: rowNumber - 1, col: colNumber - 1 })] = cell
      })
    })

    readSheetFeatures(worksheet, warnings)
    sheets.push(sheet)
  }

  if (fonts.size > 1) warnings.add('las fuentes y tamaños de letra')
  if (sheets.length === 0) sheets.push(createSheet('Hoja1'))
  if (unknownFunctions.size > 0) {
    const names = [...unknownFunctions].map(localizedFunctionName).join(', ')
    warnings.add(`las funciones ${names} (aún no existen en Tintero y muestran #¿NOMBRE?)`)
  }

  const workbook = createWorkbook(sheets)
  const activeTab = book.views?.[0]?.activeTab
  if (activeTab !== undefined && sheets[activeTab]) workbook.activeSheetId = sheets[activeTab].id
  return { content: workbook, warnings: [...warnings] }
}

function uniqueName(sheets: Sheet[], name: string): string {
  const draft = createWorkbook(sheets.length > 0 ? sheets : [createSheet('\u0000')])
  if (!validateSheetName(draft, name)) return name
  for (let number = 2; ; number++) {
    const candidate = `${name.slice(0, 27)} (${number})`
    if (!validateSheetName(draft, candidate)) return candidate
  }
}

function readColumns(worksheet: ExcelJS.Worksheet, sheet: Sheet): void {
  const count = Math.min(worksheet.columnCount, MAX_COLUMNS)
  for (let index = 1; index <= count; index++) {
    const width = worksheet.getColumn(index).width
    if (width) sheet.columnWidths[index - 1] = excelWidthToPixels(width)
  }
}

function readCell(excelCell: ExcelJS.Cell, warnings: Set<string>, unknownFunctions: Set<string>): Cell | null {
  const cell: Cell = {}
  const style = readStyle(excelCell, warnings)
  const value = excelCell.value

  if (excelCell.type === ExcelJS.ValueType.Formula) {
    cell.formula = readFormula(excelCell.formula, warnings, unknownFunctions)
  } else if (value instanceof Date) {
    cell.value = dateToSerial(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
    const fraction = (value.getUTCHours() * 3600 + value.getUTCMinutes() * 60 + value.getUTCSeconds()) / 86400
    if (fraction > 0) {
      cell.value += fraction
      warnings.add('las horas (solo se muestra la fecha)')
    }
    style.numberFormat ??= { kind: 'date' }
  } else {
    const scalar = readScalar(value, warnings)
    if (scalar !== undefined) cell.value = scalar
  }

  if (Object.keys(style).length > 0) cell.style = style
  return cell.value === undefined && cell.formula === undefined && !cell.style ? null : cell
}

function readScalar(value: ExcelJS.CellValue, warnings: Set<string>): Scalar | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'object') {
    if ('richText' in value) {
      warnings.add('el formato dentro de una celda (se conserva el texto)')
      return value.richText.map((run) => run.text).join('')
    }
    if ('hyperlink' in value) {
      warnings.add('los hipervínculos (se conserva el texto)')
      const text = (value as ExcelJS.CellHyperlinkValue).text
      return typeof text === 'string' ? text : String(value.hyperlink)
    }
    if ('error' in value) {
      // Un error escrito como valor (no como resultado) es raro; lo guardamos como texto visible.
      return String(value.error)
    }
  }
  return undefined
}

function readFormula(formula: string, warnings: Set<string>, unknownFunctions: Set<string>): string {
  // "_xlfn." es un prefijo de compatibilidad de Excel para funciones modernas: no es parte del nombre.
  const clean = formula.replace(/_xlfn\./gi, '').replace(/_xlws\./gi, '')
  let node: FormulaNode
  try {
    node = parseFormula(clean)
  } catch {
    warnings.add('algunas fórmulas con sintaxis que Tintero no entiende (p. ej. tablas estructuradas o matrices)')
    return clean
  }
  collectUnknownFunctions(node, unknownFunctions)
  return printFormula(node, 'canonical')
}

function collectUnknownFunctions(node: FormulaNode, unknown: Set<string>): void {
  switch (node.type) {
    case 'call':
      if (!FUNCTIONS[node.name]) unknown.add(node.name)
      node.args.forEach((arg) => collectUnknownFunctions(arg, unknown))
      break
    case 'unary':
      collectUnknownFunctions(node.operand, unknown)
      break
    case 'binary':
      collectUnknownFunctions(node.left, unknown)
      collectUnknownFunctions(node.right, unknown)
      break
    case 'group':
      collectUnknownFunctions(node.inner, unknown)
      break
  }
}

function readStyle(excelCell: ExcelJS.Cell, warnings: Set<string>): CellStyle {
  const style: CellStyle = {}
  const font = excelCell.font
  if (font?.bold) style.bold = true
  if (font?.italic) style.italic = true
  if (font?.underline) style.underline = true
  const color = argbToHex(font?.color?.argb)
  if (color && color !== '#000000') style.color = color
  else if (font?.color?.theme !== undefined && font.color.theme !== 1) warnings.add('los colores del tema de Excel')

  const fill = excelCell.fill
  if (fill?.type === 'pattern' && fill.pattern === 'solid') {
    const hex = argbToHex(fill.fgColor?.argb)
    if (hex) style.fill = hex
    else if (fill.fgColor?.theme !== undefined) warnings.add('los colores del tema de Excel')
  } else if (fill && (fill.type === 'gradient' || (fill.type === 'pattern' && fill.pattern !== 'none'))) {
    warnings.add('los rellenos con degradado o trama')
  }

  const horizontal = excelCell.alignment?.horizontal
  if (horizontal === 'left' || horizontal === 'center' || horizontal === 'right') style.align = horizontal
  const vertical = excelCell.alignment?.vertical
  if (excelCell.alignment?.wrapText || (vertical && vertical !== 'bottom')) {
    warnings.add('el ajuste de texto y la alineación vertical')
  }

  const { format, lossy } = fromExcelNumberFormat(excelCell.numFmt)
  if (format) style.numberFormat = format
  if (lossy) warnings.add('algunos formatos de número personalizados')

  const border = excelCell.border
  if (border) {
    const borders = {
      ...(border.top?.style ? { top: true } : {}),
      ...(border.right?.style ? { right: true } : {}),
      ...(border.bottom?.style ? { bottom: true } : {}),
      ...(border.left?.style ? { left: true } : {})
    }
    if (Object.keys(borders).length > 0) style.borders = borders
    const styles = [border.top, border.right, border.bottom, border.left].map((side) => side?.style).filter(Boolean)
    if (styles.some((sideStyle) => sideStyle !== 'thin')) warnings.add('el grosor y color de los bordes')
  }
  return style
}

/** Cosas de la hoja (no de las celdas) que Tintero aún no tiene. */
function readSheetFeatures(worksheet: ExcelJS.Worksheet, warnings: Set<string>): void {
  const model = worksheet.model as unknown as {
    merges?: string[]
    conditionalFormattings?: unknown[]
    dataValidations?: { model?: Record<string, unknown> }
  }
  if ((model.merges?.length ?? 0) > 0) warnings.add('las celdas combinadas (se separan)')
  if ((model.conditionalFormattings?.length ?? 0) > 0) warnings.add('el formato condicional')
  if (Object.keys(model.dataValidations?.model ?? {}).length > 0) warnings.add('la validación de datos')
  if (worksheet.getImages().length > 0) warnings.add('las imágenes')
  // Algunos programas (LibreOffice) escriben el mismo alto en todas las filas: solo avisamos si varía.
  const heights = new Set<number>()
  worksheet.eachRow((row) => {
    if (row.height) heights.add(Math.round(row.height))
  })
  if (heights.size > 1) warnings.add('el alto de las filas')
  if (worksheet.views?.some((view) => view.state === 'frozen')) warnings.add('los paneles inmovilizados')
}

/**
 * ExcelJS ignora en silencio gráficos, tablas dinámicas y comentarios. Para no perderlos sin avisar,
 * miramos qué partes trae el paquete (un .xlsx es un .zip con un XML por cada cosa).
 */
async function packageWarnings(bytes: Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(bytes)
  const paths = Object.keys(zip.files)
  const has = (prefix: string) => paths.some((path) => path.startsWith(prefix))
  const warnings: string[] = []
  if (has('xl/charts/')) warnings.push('los gráficos')
  if (has('xl/pivotTables/')) warnings.push('las tablas dinámicas (se conservan sus valores)')
  if (paths.some((path) => /^xl\/comments\d*\.xml$/.test(path)) || has('xl/threadedComments/')) {
    warnings.push('los comentarios y notas')
  }
  if (has('xl/tables/')) warnings.push('el formato de tabla (se conservan los datos)')
  if (has('xl/vbaProject')) warnings.push('las macros')
  return warnings
}
