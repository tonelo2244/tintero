import { Sheet as SheetIcon } from 'lucide-react'
import { defineApp } from '@/core/appModule'
import { SHEETS_ACCENT } from './constants'
import { SheetsEditor } from './editor/SheetsEditor'
import { parseWorkbook } from './model/content'
import { exportCsv, importCsv } from './model/csv'
import type { Workbook } from './model/types'
import { sheetsTemplates } from './templates'

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
  exporters: [
    // El CSV es código pequeño y sin dependencias: no merece un import dinámico.
    { format: CSV_FORMAT, export: async (content) => exportCsv(content) }
  ],
  importers: [{ format: CSV_FORMAT, import: async (bytes) => importCsv(bytes) }]
})
