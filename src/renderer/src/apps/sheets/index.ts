import { Sheet as SheetIcon } from 'lucide-react'
import { defineApp } from '@/core/appModule'
import { SHEETS_ACCENT } from './constants'
import { SheetsEditor } from './editor/SheetsEditor'
import { parseWorkbook } from './model/content'
import { exportCsv, importCsv } from './model/csv'
import type { Workbook } from './model/types'
import { sheetsTemplates } from './templates'

const XLSX_FORMAT = { extension: 'xlsx', label: 'Libro de Excel' }
const CSV_FORMAT = { extension: 'csv', label: 'CSV (valores separados por comas)' }

export const sheetsApp = defineApp<Workbook>({
  id: 'sheets',
  name: 'Tintero Hojas de cálculo',
  shortName: 'Hojas de cálculo',
  accentColor: SHEETS_ACCENT,
  Icon: SheetIcon,
  file: { extension: 'tsheet', label: 'Hojas de cálculo' },
  untitledName: 'Libro',
  galleryTitle: 'Plantillas',
  templates: sheetsTemplates,
  parseContent: parseWorkbook,
  Editor: SheetsEditor,
  // Imports dinámicos: ExcelJS pesa cerca de 1 MB y solo se carga la primera vez que se usa.
  exporters: [
    {
      format: XLSX_FORMAT,
      export: async (content) => (await import('./model/xlsx/exportXlsx')).exportXlsx(content)
    },
    // El CSV es código pequeño y sin dependencias: no merece un import dinámico.
    { format: CSV_FORMAT, export: async (content) => exportCsv(content) }
  ],
  importers: [
    {
      format: XLSX_FORMAT,
      import: async (bytes) => (await import('./model/xlsx/importXlsx')).importXlsx(bytes)
    },
    { format: CSV_FORMAT, import: async (bytes) => importCsv(bytes) }
  ]
})
