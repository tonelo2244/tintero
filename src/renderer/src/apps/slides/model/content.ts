import { SLIDE_THEMES } from './themes'
import type { Presentation } from './types'

export function parsePresentation(raw: unknown): Presentation {
  const candidate = raw as Partial<Presentation> | null
  if (!candidate || !Array.isArray(candidate.slides) || candidate.slides.length === 0) {
    throw new Error('La presentación está dañada o no tiene diapositivas.')
  }
  const themeId = SLIDE_THEMES.some((theme) => theme.id === candidate.themeId) ? candidate.themeId! : 'blank'
  return { themeId, slides: candidate.slides }
}
