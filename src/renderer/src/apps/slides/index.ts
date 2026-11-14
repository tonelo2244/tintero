import { Presentation as PresentationIcon } from 'lucide-react'
import { defineApp } from '@/core/appModule'
import { SLIDES_ACCENT } from './constants'
import { SlidesEditor } from './editor/SlidesEditor'
import { parsePresentation } from './model/content'
import type { Presentation } from './model/types'
import { slidesTemplates } from './templates'

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
  exporters: [
    {
      format: { extension: 'pptx', label: 'Presentación de PowerPoint' },
      // Import dinámico: pptxgenjs solo se carga la primera vez que alguien exporta.
      export: async (content) => (await import('./model/pptx/exportPptx')).exportPptx(content)
    }
  ]
})
