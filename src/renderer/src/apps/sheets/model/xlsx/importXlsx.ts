import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import type { ImportResult } from '@/core/appModule'
import { attr, child, parseXml } from '@/core/office/xml'
import { cellAddress, MAX_COLUMNS, MAX_ROWS, normalizeRange, parseCellAddress } from '../address'
import { createSheet, createWorkbook, validateSheetName } from '../factories'
import { dateToSerial } from '../format'
import type { FormulaNode } from '../formula/ast'
import { FUNCTIONS } from '../formula/functions'
import { localizedFunctionName } from '../formula/functionNames'
import { parseFormula } from '../formula/parser'
import { printFormula } from '../formula/printer'
import type { Cell, CellRange, CellStyle, Scalar, Sheet, Workbook } from '../types'
import { importConditionalFormats } from './xlsxConditional'
import {
  argbToHex,
  EXCEL_DEFAULT_ROW_HEIGHT_PT,
  excelWidthToPixels,
  fromExcelNumberFormat,
  pointsToPixels
} from './xlsxFormats'

/**
 * .xlsx -> libro de Tintero con ExcelJS. Lo que no sabemos representar se pierde, pero se dice:
 * cada pérdida se apunta una sola vez en `warnings` y el shell se lo enseña al usuario.
 */
export async function importXlsx(bytes: Uint8Array): Promise<ImportResult<Workbook>> {
  const book = new ExcelJS.Workbook()
  // ExcelJS espera un ArrayBuffer exacto (no una vista sobre un buffer mayor).
  await book.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)

  const zip = await JSZip.loadAsync(bytes)
  const warnings = new Set<string>(packageWarnings(zip))
  const unknownFunctions = new Set<string>()
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
        const cell = readCell(excelCell, warnings, unknownFunctions)
        if (cell) sheet.cells[cellAddress({ row: rowNumber - 1, col: colNumber - 1 })] = cell
      })
    })

    readSheetFeatures(worksheet, sheet, warnings)
    sheets.push(sheet)
  }

  removeBaseFont(sheets, await readBaseFont(zip))
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
  // Se guardan siempre; removeBaseFont quita después la fuente "normal" del libro.
  if (font?.name) style.fontFamily = font.name
  if (font?.size) style.fontSize = font.size
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
  if (excelCell.alignment?.wrapText) style.wrap = true
  const vertical = excelCell.alignment?.vertical
  if (vertical && vertical !== 'bottom') warnings.add('la alineación vertical')

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

/** Lo que es de la hoja y no de las celdas: combinadas, alto de filas, paneles y formato condicional. */
function readSheetFeatures(worksheet: ExcelJS.Worksheet, sheet: Sheet, warnings: Set<string>): void {
  // ExcelJS expone las combinadas y el formato condicional en el modelo, sin tipos públicos.
  const model = worksheet.model as unknown as {
    merges?: string[]
    conditionalFormattings?: ExcelJS.ConditionalFormattingOptions[]
    dataValidations?: { model?: Record<string, unknown> }
  }
  const merges = (model.merges ?? []).map(parseRangeAddress).filter((range): range is CellRange => range !== null)
  if (merges.length > 0) sheet.merges = merges

  const conditional = importConditionalFormats(model.conditionalFormattings, parseRangeAddress)
  if (conditional.formats.length > 0) sheet.conditionalFormats = conditional.formats
  if (conditional.unsupported > 0) warnings.add('algunas reglas de formato condicional (Tintero tiene cinco tipos)')

  if (Object.keys(model.dataValidations?.model ?? {}).length > 0) warnings.add('la validación de datos')
  if (worksheet.getImages().length > 0) warnings.add('las imágenes')

  readRowHeights(worksheet, sheet)

  const frozen = worksheet.views?.find((view) => view.state === 'frozen') as
    { xSplit?: number; ySplit?: number } | undefined
  const rows = Math.min(Math.max(0, Math.round(frozen?.ySplit ?? 0)), MAX_ROWS - 1)
  const cols = Math.min(Math.max(0, Math.round(frozen?.xSplit ?? 0)), MAX_COLUMNS - 1)
  if (rows + cols > 0) sheet.frozen = { rows, cols }
  if (worksheet.views?.some((view) => view.state === 'split')) warnings.add('la división de la ventana en paneles')
}

/**
 * Solo guardamos las filas con un alto distinto del normal de la hoja. Algunos programas
 * (LibreOffice) escriben el alto de todas las filas; las que miden lo normal no aportan nada.
 */
function readRowHeights(worksheet: ExcelJS.Worksheet, sheet: Sheet): void {
  const normal = worksheet.properties.defaultRowHeight || EXCEL_DEFAULT_ROW_HEIGHT_PT
  const heights: Record<number, number> = {}
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (!row.height || rowNumber > MAX_ROWS || Math.abs(row.height - normal) < 0.5) return
    heights[rowNumber - 1] = pointsToPixels(row.height)
  })
  if (Object.keys(heights).length > 0) sheet.rowHeights = heights
}

interface BaseFont {
  name?: string
  size?: number
}

/**
 * Fuente del estilo "Normal" del libro (la primera de `xl/styles.xml`): Calibri 11 en Excel,
 * Arial 10 en LibreOffice... No la guardamos en cada celda: así esas celdas se ven con la fuente
 * de la cuadrícula, como en una hoja nueva, y solo destacan las que el autor cambió a propósito.
 */
async function readBaseFont(zip: JSZip): Promise<BaseFont> {
  const styles = await zip.file('xl/styles.xml')?.async('string')
  const font = styles ? child(child(parseXml(styles), 'fonts'), 'font') : null
  const size = Number(attr(child(font, 'sz'), 'val'))
  return { name: attr(child(font, 'name'), 'val') ?? undefined, size: size > 0 ? size : undefined }
}

function removeBaseFont(sheets: Sheet[], base: BaseFont): void {
  for (const sheet of sheets) {
    for (const [address, cell] of Object.entries(sheet.cells)) {
      const style = cell.style
      if (!style) continue
      if (style.fontFamily === base.name) delete style.fontFamily
      if (style.fontSize === base.size) delete style.fontSize
      if (Object.keys(style).length === 0) {
        delete cell.style
        if (cell.value === undefined && cell.formula === undefined) delete sheet.cells[address]
      }
    }
  }
}

/** "B2:D4" -> rango. Las combinadas que se salen de la hoja de Tintero se descartan. */
function parseRangeAddress(text: string): CellRange | null {
  const [first, second = first] = text.split(':')
  const start = parseCellAddress(first)
  const end = parseCellAddress(second)
  if (!start || !end || end.row >= MAX_ROWS || end.col >= MAX_COLUMNS) return null
  return normalizeRange(start, end)
}

/**
 * ExcelJS ignora en silencio gráficos, tablas dinámicas y comentarios. Para no perderlos sin avisar,
 * miramos qué partes trae el paquete (un .xlsx es un .zip con un XML por cada cosa).
 */
function packageWarnings(zip: JSZip): string[] {
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
