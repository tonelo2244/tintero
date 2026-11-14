import { FileText } from 'lucide-react'
import { defineApp } from '@/core/appModule'
import { WRITER_ACCENT } from './constants'
import { WriterEditor } from './editor/WriterEditor'
import { parseWriterContent, type WriterContent } from './model/content'
import { writerTemplates } from './templates'

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
  Editor: WriterEditor
})
