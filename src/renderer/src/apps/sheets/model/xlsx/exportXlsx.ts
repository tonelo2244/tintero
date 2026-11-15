import ExcelJS from 'exceljs'
import { evaluateWorkbook, getCellValue } from '../calc'
import { parseFormula } from '../formula/parser'
import { printFormula } from '../formula/printer'
import { mapNodes } from '../formula/transform'
import { isError } from '../formula/values'
import type { Cell, CellValue, Workbook } from '../types'
import { hexToArgb, pixelsToExcelWidth, toExcelNumberFormat } from './xlsxFormats'

/** Funciones posteriores a Excel 2007: en el archivo van con el prefijo "_xlfn." o Excel no las reconoce. */
const XLFN_FUNCTIONS = new Set(['CONCAT'])

/**
 * Libro de Tintero -> .xlsx con ExcelJS.
 *
 * Guardamos la fórmula Y su resultado calculado: Excel recalcula al abrir, pero otros lectores
 * (vistas previas, Quick Look, librerías de datos) solo muestran el resultado guardado.
 */
export async function exportXlsx(workbook: Workbook): Promise<Uint8Array> {
  const evaluation = evaluateWorkbook(workbook)
  const book = new ExcelJS.Workbook()
  book.creator = 'Tintero'

  for (const sheet of workbook.sheets) {
    const worksheet = book.addWorksheet(sheet.name)
    for (const [col, width] of Object.entries(sheet.columnWidths)) {
      worksheet.getColumn(Number(col) + 1).width = pixelsToExcelWidth(width)
    }
    for (const [address, cell] of Object.entries(sheet.cells)) {
      const target = worksheet.getCell(address)
      const value = cellValue(cell, getCellValue(evaluation, sheet.id, address))
      if (value !== undefined) target.value = value
      applyStyle(target, cell)
    }
  }
  if (workbook.sheets.length > 1) {
    const active = workbook.sheets.findIndex((sheet) => sheet.id === workbook.activeSheetId)
    book.views = [
      {
        activeTab: Math.max(0, active),
        x: 0,
        y: 0,
        width: 20000,
        height: 12000,
        visibility: 'visible'
      } as ExcelJS.WorkbookView
    ]
  }

  return new Uint8Array(await book.xlsx.writeBuffer())
}

function cellValue(cell: Cell, computed: CellValue): ExcelJS.CellValue | undefined {
  if (cell.formula !== undefined) {
    const result = toExcelResult(computed)
    return {
      formula: excelFormula(cell.formula),
      ...(result === undefined ? {} : { result })
    } as ExcelJS.CellFormulaValue
  }
  return cell.value
}

function toExcelResult(value: CellValue): ExcelJS.CellFormulaValue['result'] | undefined {
  if (value === null) return undefined
  if (isError(value)) {
    // #¡CIRCULAR! no existe en Excel: no guardamos resultado y Excel mostrará su propio aviso.
    return value.error === '#CIRC!' ? undefined : ({ error: value.error } as ExcelJS.CellErrorValue)
  }
  return value
}

function excelFormula(canonical: string): string {
  try {
    const node = mapNodes(parseFormula(canonical), (current) =>
      current.type === 'call' && XLFN_FUNCTIONS.has(current.name)
        ? { ...current, name: `_xlfn.${current.name}`, args: current.args }
        : undefined
    )
    return printFormula(node, 'canonical')
  } catch {
    return canonical
  }
}

function applyStyle(target: ExcelJS.Cell, cell: Cell): void {
  const style = cell.style
  if (!style) return
  if (style.bold || style.italic || style.underline || style.color) {
    target.font = {
      bold: style.bold,
      italic: style.italic,
      underline: style.underline,
      ...(style.color ? { color: { argb: hexToArgb(style.color) } } : {})
    }
  }
  if (style.fill) target.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(style.fill) } }
  if (style.align) target.alignment = { horizontal: style.align }
  const numFmt = toExcelNumberFormat(style.numberFormat)
  if (numFmt) target.numFmt = numFmt
  const borders = style.borders
  if (borders && Object.values(borders).some(Boolean)) {
    const thin = { style: 'thin' as const, color: { argb: 'FF1F1F1F' } }
    target.border = {
      ...(borders.top ? { top: thin } : {}),
      ...(borders.right ? { right: thin } : {}),
      ...(borders.bottom ? { bottom: thin } : {}),
      ...(borders.left ? { left: thin } : {})
    }
  }
}
