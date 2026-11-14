import type { Box, Presentation, ShapeStyle, Slide, SlideElement, TextStyle } from './types'

/**
 * Toda la lógica de edición de presentaciones como funciones puras:
 * (estado, acción) -> estado nuevo. No sabe nada de React ni del DOM,
 * por eso se puede probar con tests simples y reutilizar en otra interfaz.
 */
export type PresentationAction =
  | { type: 'slide/add'; slide: Slide; index: number }
  | { type: 'slide/delete'; slideId: string }
  | { type: 'slide/move'; from: number; to: number }
  | { type: 'slide/setNotes'; slideId: string; notes: string }
  | { type: 'element/add'; slideId: string; element: SlideElement }
  | { type: 'element/delete'; slideId: string; elementId: string }
  | { type: 'element/setBox'; slideId: string; elementId: string; box: Box }
  | { type: 'element/setText'; slideId: string; elementId: string; text: string }
  | { type: 'element/setTextStyle'; slideId: string; elementId: string; style: Partial<TextStyle> }
  | { type: 'element/setShapeStyle'; slideId: string; elementId: string; style: Partial<ShapeStyle> }
  | { type: 'element/reorder'; slideId: string; elementId: string; direction: 'front' | 'back' }
  | { type: 'presentation/setTheme'; themeId: string }

export function presentationReducer(state: Presentation, action: PresentationAction): Presentation {
  switch (action.type) {
    case 'slide/add': {
      const slides = [...state.slides]
      slides.splice(clamp(action.index, 0, slides.length), 0, action.slide)
      return { ...state, slides }
    }
    case 'slide/delete':
      // Siempre debe quedar al menos una diapositiva.
      if (state.slides.length <= 1) return state
      return { ...state, slides: state.slides.filter((slide) => slide.id !== action.slideId) }
    case 'slide/move': {
      const { from, to } = action
      if (from === to || from < 0 || from >= state.slides.length) return state
      const slides = [...state.slides]
      const [moved] = slides.splice(from, 1)
      slides.splice(clamp(to, 0, slides.length), 0, moved)
      return { ...state, slides }
    }
    case 'slide/setNotes':
      return updateSlide(state, action.slideId, (slide) => ({ ...slide, notes: action.notes }))
    case 'element/add':
      return updateSlide(state, action.slideId, (slide) => ({ ...slide, elements: [...slide.elements, action.element] }))
    case 'element/delete':
      return updateSlide(state, action.slideId, (slide) => ({
        ...slide,
        elements: slide.elements.filter((element) => element.id !== action.elementId)
      }))
    case 'element/setBox':
      return updateElement(state, action.slideId, action.elementId, (element) => ({ ...element, ...action.box }))
    case 'element/setText':
      return updateElement(state, action.slideId, action.elementId, (element) =>
        element.type === 'text' ? { ...element, text: action.text } : element
      )
    case 'element/setTextStyle':
      return updateElement(state, action.slideId, action.elementId, (element) =>
        element.type === 'text' ? { ...element, style: { ...element.style, ...action.style } } : element
      )
    case 'element/setShapeStyle':
      return updateElement(state, action.slideId, action.elementId, (element) =>
        element.type === 'shape' ? { ...element, style: { ...element.style, ...action.style } } : element
      )
    case 'element/reorder':
      return updateSlide(state, action.slideId, (slide) => {
        const target = slide.elements.find((element) => element.id === action.elementId)
        if (!target) return slide
        const others = slide.elements.filter((element) => element.id !== action.elementId)
        return { ...slide, elements: action.direction === 'front' ? [...others, target] : [target, ...others] }
      })
    case 'presentation/setTheme':
      return state.themeId === action.themeId ? state : { ...state, themeId: action.themeId }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function updateSlide(state: Presentation, slideId: string, update: (slide: Slide) => Slide): Presentation {
  let changed = false
  const slides = state.slides.map((slide) => {
    if (slide.id !== slideId) return slide
    const next = update(slide)
    changed = changed || next !== slide
    return next
  })
  return changed ? { ...state, slides } : state
}

function updateElement(
  state: Presentation,
  slideId: string,
  elementId: string,
  update: (element: SlideElement) => SlideElement
): Presentation {
  return updateSlide(state, slideId, (slide) => {
    let changed = false
    const elements = slide.elements.map((element) => {
      if (element.id !== elementId) return element
      const next = update(element)
      changed = changed || next !== element
      return next
    })
    return changed ? { ...slide, elements } : slide
  })
}
