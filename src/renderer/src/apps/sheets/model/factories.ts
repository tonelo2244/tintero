import { createId } from '@/core/ids'
import type { Sheet, Workbook } from './types'

export function createSheet(name: string, cells: Sheet['cells'] = {}): Sheet {
  return { id: createId('sheet'), name, cells, columnWidths: {} }
}

export function createWorkbook(sheets: Sheet[] = [createSheet('Hoja1')]): Workbook {
  return { sheets, activeSheetId: sheets[0].id }
}

/** "Hoja1", "Hoja2"... el primer número libre, como hace Excel. */
export function nextSheetName(workbook: Workbook): string {
  const taken = new Set(workbook.sheets.map((sheet) => sheet.name.toLowerCase()))
  for (let number = workbook.sheets.length + 1; ; number++) {
    const name = `Hoja${number}`
    if (!taken.has(name.toLowerCase())) return name
  }
}

const FORBIDDEN_SHEET_CHARS = /[:\\/?*[\]]/

/** Mismas reglas que Excel, para que el libro se pueda exportar a .xlsx. Devuelve el problema o null. */
export function validateSheetName(workbook: Workbook, name: string, sheetId?: string): string | null {
  const trimmed = name.trim()
  if (trimmed === '') return 'El nombre de la hoja no puede estar vacío.'
  if (trimmed.length > 31) return 'El nombre de la hoja puede tener 31 caracteres como máximo.'
  if (FORBIDDEN_SHEET_CHARS.test(trimmed)) return 'El nombre no puede contener : \\ / ? * [ ]'
  if (trimmed.startsWith("'") || trimmed.endsWith("'")) return 'El nombre no puede empezar ni acabar en apóstrofo.'
  const duplicate = workbook.sheets.some(
    (sheet) => sheet.id !== sheetId && sheet.name.toLowerCase() === trimmed.toLowerCase()
  )
  return duplicate ? 'Ya hay una hoja con ese nombre.' : null
}
