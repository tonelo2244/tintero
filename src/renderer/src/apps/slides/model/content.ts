import { paragraphsFromText } from './richText'
import { SLIDE_THEMES } from './themes'
import type { Presentation, Slide, SlideElement } from './types'

/**
 * Lee una presentación guardada en disco, migrándola si viene de una versión anterior del formato.
 * Cada migración es pura y va de una versión a la siguiente, para poder encadenarlas en el futuro.
 */
export function parsePresentation(raw: unknown, fileVersion: number): Presentation {
  const candidate = raw as Partial<Presentation> | null
  if (!candidate || !Array.isArray(candidate.slides) || candidate.slides.length === 0) {
    throw new Error('La presentación está dañada o no tiene diapositivas.')
  }
  const themeId = SLIDE_THEMES.some((theme) => theme.id === candidate.themeId) ? candidate.themeId! : 'blank'
  const slides = fileVersion < 2 ? candidate.slides.map(migrateSlideV1toV2) : candidate.slides
  return { themeId, slides }
}

/** Versión 1 -> 2: el texto plano de cada cuadro pasa a párrafos sin formato propio. */
export function migrateSlideV1toV2(slide: Slide): Slide {
  return {
    ...slide,
    elements: slide.elements.map((element) => {
      const legacy = element as SlideElement & { text?: unknown }
      if (legacy.type !== 'text' || typeof legacy.text !== 'string') return element
      const { text, ...rest } = legacy
      return { ...rest, paragraphs: paragraphsFromText(text) } as SlideElement
    })
  }
}
