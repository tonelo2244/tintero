import { FileText } from 'lucide-react'
import { defineApp } from '@/core/appModule'
import { WRITER_ACCENT } from './constants'
import { createWriterExtensions } from './editor/extensions'
import { WriterEditor } from './editor/WriterEditor'
import { parseWriterContent, type WriterContent } from './model/content'
import { writerTemplates } from './templates'

const DOCX_FORMAT = { extension: 'docx', label: 'Documento de Word' }

export const writerApp = defineApp<WriterContent>({
  id: 'writer',
  name: 'Tintero Texto',
  shortName: 'Texto',
  accentColor: WRITER_ACCENT,
  Icon: FileText,
  file: { extension: 'tdoc', label: 'Documentos de texto' },
  untitledName: 'Documento',
  galleryTitle: 'Plantillas',
  templates: writerTemplates,
  parseContent: parseWriterContent,
  Editor: WriterEditor,
  // Imports dinámicos: docx y mammoth solo se cargan la primera vez que alguien los usa.
  exporters: [
    {
      format: DOCX_FORMAT,
      export: async (content) => (await import('./model/docx/exportDocx')).exportDocx(content)
    }
  ],
  importers: [
    {
      format: DOCX_FORMAT,
      import: async (bytes) => (await import('./model/docx/importDocx')).importDocx(bytes, createWriterExtensions())
    }
  ]
})
