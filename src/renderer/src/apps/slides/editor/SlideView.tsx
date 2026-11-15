import type { SlideTheme } from '../model/themes'
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Slide } from '../model/types'
import { boxCss, ElementContent, slideBackground } from './ElementContent'

interface SlideViewProps {
  slide: Slide
  theme: SlideTheme
  /** Ancho en píxeles de pantalla; el alto se deriva (16:9). */
  width: number
  showPlaceholders?: boolean
  /** Pintar el fondo del tema aunque la diapositiva tenga uno propio (galería de temas). */
  themeBackground?: boolean
}

/** Vista de solo lectura. Se usa en miniaturas, galería de temas, impresión y modo presentación. */
export function SlideView({ slide, theme, width, showPlaceholders = false, themeBackground = false }: SlideViewProps) {
  const scale = width / SLIDE_WIDTH
  return (
    <div className="slide-view" style={{ width, height: SLIDE_HEIGHT * scale }}>
      <div
        className="slide-surface"
        style={{
          background: themeBackground ? theme.background : slideBackground(slide, theme),
          transform: `scale(${scale})`
        }}
      >
        {slide.elements.map((element) => (
          <div key={element.id} className="slide-element" style={boxCss(element)}>
            <ElementContent element={element} theme={theme} showPlaceholder={showPlaceholders} />
          </div>
        ))}
      </div>
    </div>
  )
}
