import type { AppTemplate } from '@/core/appModule'
import { createSlide, createShapeElement, createTextElement } from './model/factories'
import { SLIDE_THEMES } from './model/themes'
import type { Presentation, Slide, TextElement } from './model/types'
import { SlideView } from './editor/SlideView'

const PREVIEW_WIDTH = 150

function withTexts(slide: Slide, texts: string[], notes = ''): Slide {
  let index = 0
  const elements = slide.elements.map((element) =>
    element.type === 'text' && index < texts.length ? ({ ...element, text: texts[index++] } as TextElement) : element
  )
  return { ...slide, elements, notes }
}

function titleDeck(themeId: string, title = '', subtitle = ''): Presentation {
  return { themeId, slides: [withTexts(createSlide('title'), [title, subtitle])] }
}

function tourDeck(): Presentation {
  const shapes = createSlide('titleOnly')
  const shapesSlide: Slide = {
    ...withTexts(shapes, ['Formas e imágenes']),
    elements: [
      ...withTexts(shapes, ['Formas e imágenes']).elements,
      createShapeElement('roundRect', { x: 120, y: 260, width: 300, height: 200 }),
      createShapeElement('ellipse', { x: 490, y: 260, width: 300, height: 200 }),
      createShapeElement('arrow', { x: 860, y: 280, width: 300, height: 160 }),
      createTextElement('free', { x: 120, y: 520, width: 1040, height: 80 }, {
        text: 'Insertar → Formas o Imagen. Arrastra para mover y usa los tiradores para cambiar el tamaño.',
        style: { align: 'center', fontSize: 24 }
      })
    ]
  }
  return {
    themeId: 'carmesi',
    slides: [
      withTexts(createSlide('title'), ['Le damos la bienvenida', 'Un recorrido rápido por Tintero Diapositivas'], 'Pulsa F5 para ver la presentación a pantalla completa.'),
      withTexts(createSlide('titleContent'), [
        'Edita como en cualquier suite',
        'Haz clic en un cuadro para seleccionarlo y otra vez para escribir\nArrastra las miniaturas de la izquierda para reordenar\nCambia el tema completo desde la pestaña Diseño\nEscribe notas del orador debajo de cada diapositiva'
      ], 'Las notas no se ven durante la presentación.'),
      shapesSlide,
      withTexts(createSlide('sectionHeader'), ['Todo se guarda en tu disco', 'Archivos .tpres, sin nube y sin cuentas'])
    ]
  }
}

function deckPreview(deck: () => Presentation) {
  const presentation = deck()
  return function Preview() {
    return <SlideView slide={presentation.slides[0]} themeId={presentation.themeId} width={PREVIEW_WIDTH} />
  }
}

export const slidesTemplates: AppTemplate<Presentation>[] = [
  { id: 'blank', name: 'Presentación en blanco', Preview: deckPreview(() => titleDeck('blank')), createContent: () => titleDeck('blank') },
  { id: 'tour', name: 'Le damos la bienvenida', Preview: deckPreview(tourDeck), createContent: tourDeck },
  ...SLIDE_THEMES.filter((theme) => theme.id !== 'blank').map((theme) => ({
    id: `theme-${theme.id}`,
    name: theme.name,
    Preview: deckPreview(() => titleDeck(theme.id, theme.name)),
    createContent: () => titleDeck(theme.id)
  }))
]
