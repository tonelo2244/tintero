import { Presentation as PresentationIcon } from 'lucide-react'
import { defineApp } from '@/core/appModule'
import { SLIDES_ACCENT } from './constants'
import { SlidesEditor } from './editor/SlidesEditor'
import { parsePresentation } from './model/content'
import type { Presentation } from './model/types'
import { slidesTemplates } from './templates'

const PPTX_FORMAT = { extension: 'pptx', label: 'Presentación de PowerPoint' }

export const slidesApp = defineApp<Presentation>({
  id: 'slides',
  name: 'Tintero Diapositivas',
  shortName: 'Diapositivas',
  accentColor: SLIDES_ACCENT,
  Icon: PresentationIcon,
  file: { extension: 'tpres', label: 'Presentaciones' },
  untitledName: 'Presentación',
  galleryTitle: 'Temas',
  templates: slidesTemplates,
  parseContent: parsePresentation,
  Editor: SlidesEditor,
  // Imports dinámicos: el código de conversión solo se carga la primera vez que se usa.
  exporters: [
    {
      format: PPTX_FORMAT,
      export: async (content) => (await import('./model/pptx/exportPptx')).exportPptx(content)
    }
  ],
  importers: [
    {
      format: PPTX_FORMAT,
      import: async (bytes) => (await import('./model/pptx/importPptx')).importPptx(bytes)
    }
  ]
})
