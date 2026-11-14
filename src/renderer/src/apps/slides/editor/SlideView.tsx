import { getTheme } from '../model/themes'
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Slide } from '../model/types'
import { boxCss, ElementContent } from './ElementContent'

interface SlideViewProps {
  slide: Slide
  themeId: string
  /** Ancho en píxeles de pantalla; el alto se deriva (16:9). */
  width: number
  showPlaceholders?: boolean
}

/** Vista de solo lectura. Se usa en miniaturas, galería de temas, impresión y modo presentación. */
export function SlideView({ slide, themeId, width, showPlaceholders = false }: SlideViewProps) {
  const theme = getTheme(themeId)
  const scale = width / SLIDE_WIDTH
  return (
    <div className="slide-view" style={{ width, height: SLIDE_HEIGHT * scale }}>
      <div className="slide-surface" style={{ background: theme.background, transform: `scale(${scale})` }}>
        {slide.elements.map((element) => (
          <div key={element.id} className="slide-element" style={boxCss(element)}>
            <ElementContent element={element} theme={theme} showPlaceholder={showPlaceholders} />
          </div>
        ))}
      </div>
    </div>
  )
}
