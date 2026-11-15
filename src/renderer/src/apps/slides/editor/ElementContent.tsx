import type { CSSProperties } from 'react'
import type { SlideTheme } from '../model/themes'
import type { ShapeElement, ShapeKind, SlideElement, TextElement } from '../model/types'

const VERTICAL_JUSTIFY = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const

/** Estilos CSS de un cuadro de texto a partir de su modelo + el tema. Lo comparten la vista y el modo edición. */
export function textCss(element: TextElement, theme: SlideTheme): CSSProperties {
  const { style, role } = element
  const isTitle = role === 'title'
  return {
    fontFamily: style.fontFamily ?? (isTitle ? theme.titleFontFamily : theme.fontFamily),
    fontSize: style.fontSize,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration:
      [style.underline && 'underline', style.strike && 'line-through'].filter(Boolean).join(' ') || 'none',
    color: style.color ?? (isTitle ? theme.titleColor : theme.textColor),
    textAlign: style.align,
    justifyContent: VERTICAL_JUSTIFY[style.verticalAlign]
  }
}

export function boxCss(element: SlideElement): CSSProperties {
  return { left: element.x, top: element.y, width: element.width, height: element.height }
}

interface ElementContentProps {
  element: SlideElement
  theme: SlideTheme
  /** Mostrar "Haga clic para agregar título" en cuadros vacíos (solo en el editor). */
  showPlaceholder: boolean
}

export function ElementContent({ element, theme, showPlaceholder }: ElementContentProps) {
  switch (element.type) {
    case 'text':
      return <TextContent element={element} theme={theme} showPlaceholder={showPlaceholder} />
    case 'image':
      return <img className="slide-image" src={element.src} alt={element.alt} draggable={false} />
    case 'shape':
      return <ShapeContent element={element} theme={theme} />
  }
}

function TextContent({
  element,
  theme,
  showPlaceholder
}: {
  element: TextElement
  theme: SlideTheme
  showPlaceholder: boolean
}) {
  const css = textCss(element, theme)
  if (!element.text) {
    return showPlaceholder && element.placeholder ? (
      <div className="slide-text is-placeholder" style={css}>
        {element.placeholder}
      </div>
    ) : null
  }
  return (
    <div className="slide-text" style={css}>
      {element.style.bullets ? (
        <ul className="slide-text__bullets">
          {element.text.split('\n').map((line, index) => (
            <li key={index}>{line || ' '}</li>
          ))}
        </ul>
      ) : (
        element.text
      )}
    </div>
  )
}

/** Formas en un viewBox 100x100 que se estira a la caja del elemento. */
const SHAPE_PATHS: Record<ShapeKind, string> = {
  rect: 'M0,0 H100 V100 H0 Z',
  roundRect: 'M12,0 H88 Q100,0 100,12 V88 Q100,100 88,100 H12 Q0,100 0,88 V12 Q0,0 12,0 Z',
  ellipse: 'M50,0 A50,50 0 1,1 49.99,0 Z',
  triangle: 'M50,0 L100,100 L0,100 Z',
  diamond: 'M50,0 L100,50 L50,100 L0,50 Z',
  arrow: 'M0,30 H62 V5 L100,50 L62,95 V70 H0 Z',
  star: 'M50,0 L61,35 L98,35 L68,57 L79,92 L50,71 L21,92 L32,57 L2,35 L39,35 Z'
}

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rect: 'Rectángulo',
  roundRect: 'Rectángulo redondeado',
  ellipse: 'Elipse',
  triangle: 'Triángulo',
  diamond: 'Rombo',
  arrow: 'Flecha',
  star: 'Estrella'
}

export function ShapeIcon({ shape }: { shape: ShapeKind }) {
  return (
    <svg viewBox="-4 -4 108 108" width={22} height={22} aria-hidden>
      <path d={SHAPE_PATHS[shape]} fill="currentColor" fillOpacity={0.15} stroke="currentColor" strokeWidth={6} />
    </svg>
  )
}

function ShapeContent({ element, theme }: { element: ShapeElement; theme: SlideTheme }) {
  const { fill, stroke, strokeWidth } = element.style
  return (
    <svg className="slide-shape" viewBox="0 0 100 100" preserveAspectRatio="none">
      <path
        d={SHAPE_PATHS[element.shape]}
        fill={fill ?? theme.accentColor}
        stroke={stroke ?? 'none'}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
