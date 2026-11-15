import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { RESIZE_HANDLES, resizeBox, snapToCenter, type ResizeHandle } from '../model/geometry'
import type { PresentationAction } from '../model/presentationReducer'
import { getTheme, type SlideTheme } from '../model/themes'
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Box, type Slide, type SlideElement, type TextElement } from '../model/types'
import { boxCss, ElementContent, textCss } from './ElementContent'

export type ApplyAction = (action: PresentationAction, coalesceKey?: string) => void

interface SlideCanvasProps {
  slide: Slide
  themeId: string
  selectedElementId: string | null
  editingElementId: string | null
  onSelectElement(id: string | null): void
  onEditElement(id: string | null): void
  apply: ApplyAction
}

const CANVAS_PADDING = 32
const DRAG_THRESHOLD = 3
let gestureCounter = 0

/** Lienzo editable: selección, mover, redimensionar y editar texto. */
export function SlideCanvas(props: SlideCanvasProps) {
  const { slide, selectedElementId, editingElementId, onSelectElement, onEditElement, apply } = props
  const theme = getTheme(props.themeId)
  const containerRef = useRef<HTMLDivElement>(null)
  const scale = useFitScale(containerRef)
  const [guides, setGuides] = useState({ vertical: false, horizontal: false })

  return (
    <div className="slide-canvas" ref={containerRef} onPointerDown={() => onSelectElement(null)}>
      <div
        className="slide-view slide-view--editable"
        style={{ width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale }}
      >
        <div
          className="slide-surface"
          style={{ background: theme.background, transform: `scale(${scale})` }}
          onPointerDown={(event) => {
            event.stopPropagation()
            onSelectElement(null)
          }}
        >
          {slide.elements.map((element) => (
            <EditableElement
              key={element.id}
              element={element}
              theme={theme}
              scale={scale}
              isSelected={element.id === selectedElementId}
              isEditing={element.id === editingElementId}
              onSelect={() => onSelectElement(element.id)}
              onEdit={(editing) => onEditElement(editing ? element.id : null)}
              onBoxChange={(box, gestureKey) =>
                apply({ type: 'element/setBox', slideId: slide.id, elementId: element.id, box }, gestureKey)
              }
              onTextChange={(text, sessionKey) =>
                apply({ type: 'element/setText', slideId: slide.id, elementId: element.id, text }, sessionKey)
              }
              onGuides={setGuides}
            />
          ))}
          {guides.vertical && <div className="slide-guide slide-guide--vertical" />}
          {guides.horizontal && <div className="slide-guide slide-guide--horizontal" />}
        </div>
      </div>
    </div>
  )
}

/** Escala para que la diapositiva quepa en el hueco disponible (se recalcula al redimensionar la ventana). */
function useFitScale(containerRef: React.RefObject<HTMLDivElement | null>): number {
  const [scale, setScale] = useState(0.5)
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => {
      const width = container.clientWidth - CANVAS_PADDING * 2
      const height = container.clientHeight - CANVAS_PADDING * 2
      setScale(Math.max(0.1, Math.min(width / SLIDE_WIDTH, height / SLIDE_HEIGHT)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [containerRef])
  return scale
}

interface EditableElementProps {
  element: SlideElement
  theme: SlideTheme
  scale: number
  isSelected: boolean
  isEditing: boolean
  onSelect(): void
  onEdit(editing: boolean): void
  onBoxChange(box: Box, gestureKey: string): void
  onTextChange(text: string, sessionKey: string): void
  onGuides(guides: { vertical: boolean; horizontal: boolean }): void
}

function EditableElement(props: EditableElementProps) {
  const { element, theme, scale, isSelected, isEditing } = props
  const isText = element.type === 'text'

  /** Arrastre genérico: mueve (handle = null) o redimensiona (handle = 'se', 'n', ...). */
  const startGesture = (event: ReactPointerEvent, handle: ResizeHandle | null) => {
    if (event.button !== 0) return
    event.stopPropagation()
    const wasSelected = isSelected
    props.onSelect()

    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startY = event.clientY
    const startBox: Box = { x: element.x, y: element.y, width: element.width, height: element.height }
    const gestureKey = `gesture:${element.id}:${++gestureCounter}`
    let moved = false

    const onMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startX) / scale
      const dy = (moveEvent.clientY - startY) / scale
      if (!moved && Math.hypot(dx * scale, dy * scale) < DRAG_THRESHOLD) return
      moved = true
      if (handle) {
        props.onBoxChange(resizeBox(startBox, handle, dx, dy, element.type === 'image'), gestureKey)
      } else {
        const { box, guides } = snapToCenter({
          ...startBox,
          x: Math.round(startBox.x + dx),
          y: Math.round(startBox.y + dy)
        })
        props.onGuides(guides)
        props.onBoxChange(box, gestureKey)
      }
    }

    const onUp = () => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      props.onGuides({ vertical: false, horizontal: false })
      // Clic (sin arrastrar) sobre un texto ya seleccionado o vacío -> entrar a escribir.
      if (!moved && !handle && isText && (wasSelected || !element.text)) props.onEdit(true)
    }

    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }

  const classes = ['slide-element', 'is-interactive', isSelected && 'is-selected', isEditing && 'is-editing']
  // Los cuadros de texto vacíos llevan borde punteado para que se vean, como en las suites clásicas.
  if (isText && !element.text) classes.push('is-empty-text')

  return (
    <div
      className={classes.filter(Boolean).join(' ')}
      style={boxCss(element)}
      onPointerDown={isEditing ? (event) => event.stopPropagation() : (event) => startGesture(event, null)}
      onDoubleClick={() => isText && props.onEdit(true)}
    >
      {isEditing && element.type === 'text' ? (
        <EditableText
          element={element}
          theme={theme}
          onChange={props.onTextChange}
          onDone={() => props.onEdit(false)}
        />
      ) : (
        <ElementContent element={element} theme={theme} showPlaceholder />
      )}
      {isSelected &&
        !isEditing &&
        RESIZE_HANDLES.map((handle) => (
          <span
            key={handle}
            className={`resize-handle resize-handle--${handle}`}
            style={{ transform: `scale(${1 / scale})` }}
            onPointerDown={(event) => startGesture(event, handle)}
          />
        ))}
    </div>
  )
}

interface EditableTextProps {
  element: TextElement
  theme: SlideTheme
  onChange(text: string, sessionKey: string): void
  onDone(): void
}

/**
 * Edición de texto con contentEditable en modo "plaintext-only": el navegador gestiona
 * cursor, selección y corrector, y nosotros solo guardamos texto plano en el modelo.
 * Es no controlado a propósito: si React reescribiera el DOM en cada tecla, el cursor saltaría.
 */
function EditableText({ element, theme, onChange, onDone }: EditableTextProps) {
  const ref = useRef<HTMLDivElement>(null)
  const sessionKey = useRef(`text:${element.id}:${++gestureCounter}`)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    node.innerText = element.text
    node.focus()
    const selection = window.getSelection()
    selection?.selectAllChildren(node)
    selection?.collapseToEnd()
    // Solo al montar: después el DOM es la fuente de verdad mientras se escribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={ref}
      className="slide-text is-editing"
      style={{ ...textCss(element, theme), justifyContent: 'flex-start' }}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck
      lang="es"
      onInput={(event) => onChange(event.currentTarget.innerText.replace(/\n$/, ''), sessionKey.current)}
      onBlur={onDone}
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.currentTarget.blur()
      }}
    />
  )
}
