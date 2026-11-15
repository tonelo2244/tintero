import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { boundingBox, boxOf } from '../model/arrange'
import { RESIZE_HANDLES, resizeBox, snapToCenter, type ResizeHandle } from '../model/geometry'
import type { PresentationAction } from '../model/presentationReducer'
import { fromEditorDoc, hasText, toEditorDoc } from '../model/richText'
import type { SlideTheme } from '../model/themes'
import {
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type Box,
  type Slide,
  type SlideElement,
  type TableElement,
  type TextElement,
  type TextParagraph
} from '../model/types'
import { boxCss, ElementContent, slideBackground, TableContent, textClassName, textCss } from './ElementContent'
import { createSlideTextExtensions } from './slideTextExtensions'

export type ApplyAction = (action: PresentationAction, coalesceKey?: string) => void

interface SlideCanvasProps {
  slide: Slide
  theme: SlideTheme
  /** Elementos seleccionados (Mayús + clic añade o quita uno). */
  selectedElementIds: string[]
  editingElementId: string | null
  onSelectElements(ids: string[]): void
  onEditElement(id: string | null): void
  /** Avisa del editor de texto activo (o null al dejar de escribir), para que la cinta lo use. */
  onTextEditorChange(editor: Editor | null): void
  apply: ApplyAction
}

const CANVAS_PADDING = 32
const DRAG_THRESHOLD = 3
let gestureCounter = 0

/** Lienzo editable: selección, mover, redimensionar y editar texto. */
export function SlideCanvas(props: SlideCanvasProps) {
  const { slide, selectedElementIds, editingElementId, onSelectElements, onEditElement, onTextEditorChange, apply } =
    props
  const theme = props.theme
  const containerRef = useRef<HTMLDivElement>(null)
  const scale = useFitScale(containerRef)
  const [guides, setGuides] = useState({ vertical: false, horizontal: false })

  /**
   * Pulsar un elemento. Con Mayús (o Ctrl) lo añade o quita de la selección y no arrastra; si no,
   * devuelve las cajas de lo que se va a mover: toda la selección si el elemento ya estaba en ella
   * (así se arrastran varios a la vez), o solo él.
   */
  const pressElement = (id: string, additive: boolean): Record<string, Box> | null => {
    const isSelected = selectedElementIds.includes(id)
    if (additive) {
      onSelectElements(isSelected ? selectedElementIds.filter((other) => other !== id) : [...selectedElementIds, id])
      return null
    }
    const moving = isSelected ? selectedElementIds : [id]
    if (!isSelected) onSelectElements([id])
    return Object.fromEntries(
      slide.elements.filter((element) => moving.includes(element.id)).map((element) => [element.id, boxOf(element)])
    )
  }

  /** Mueve varias cajas a la vez; el imán al centro actúa sobre la caja que las envuelve. */
  const moveBoxes = (startBoxes: Record<string, Box>, dx: number, dy: number, gestureKey: string) => {
    const start = boundingBox(Object.values(startBoxes))
    const { box, guides: snapped } = snapToCenter({
      ...start,
      x: Math.round(start.x + dx),
      y: Math.round(start.y + dy)
    })
    setGuides(snapped)
    const offsetX = box.x - start.x
    const offsetY = box.y - start.y
    const boxes = Object.fromEntries(
      Object.entries(startBoxes).map(([id, startBox]) => [
        id,
        { ...startBox, x: startBox.x + offsetX, y: startBox.y + offsetY }
      ])
    )
    apply({ type: 'elements/setBoxes', slideId: slide.id, boxes }, gestureKey)
  }

  const isMultiple = selectedElementIds.length > 1

  return (
    <div className="slide-canvas" ref={containerRef} onPointerDown={() => onSelectElements([])}>
      <div
        className="slide-view slide-view--editable"
        style={{ width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale }}
      >
        <div
          className="slide-surface"
          style={{ background: slideBackground(slide, theme), transform: `scale(${scale})` }}
          onPointerDown={(event) => {
            event.stopPropagation()
            if (!event.shiftKey) onSelectElements([])
          }}
        >
          {slide.elements.map((element) => (
            <EditableElement
              key={element.id}
              element={element}
              theme={theme}
              scale={scale}
              isSelected={selectedElementIds.includes(element.id)}
              isOnlySelected={!isMultiple && selectedElementIds[0] === element.id}
              isEditing={element.id === editingElementId}
              onPress={(additive) => pressElement(element.id, additive)}
              onClick={() => isMultiple && onSelectElements([element.id])}
              onMove={moveBoxes}
              onGestureEnd={() => setGuides({ vertical: false, horizontal: false })}
              onEdit={(editing) => onEditElement(editing ? element.id : null)}
              onBoxChange={(box, gestureKey) =>
                apply({ type: 'element/setBox', slideId: slide.id, elementId: element.id, box }, gestureKey)
              }
              onParagraphsChange={(paragraphs, sessionKey) =>
                apply(
                  { type: 'element/setParagraphs', slideId: slide.id, elementId: element.id, paragraphs },
                  sessionKey
                )
              }
              onTableCellChange={(row, col, text, sessionKey) =>
                apply(
                  {
                    type: 'table/setCell',
                    slideId: slide.id,
                    elementId: element.id,
                    row,
                    col,
                    cell: { text }
                  },
                  sessionKey
                )
              }
              onTextEditorChange={onTextEditorChange}
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
  /** Seleccionado y solo: muestra tiradores y se puede entrar a escribir. */
  isOnlySelected: boolean
  isEditing: boolean
  /** Pulsar el elemento: devuelve las cajas que arrastrar, o null si el gesto no mueve nada. */
  onPress(additive: boolean): Record<string, Box> | null
  /** Clic sin arrastrar (no aditivo). */
  onClick(): void
  onMove(startBoxes: Record<string, Box>, dx: number, dy: number, gestureKey: string): void
  /** Fin de un arrastre: quita las guías. */
  onGestureEnd(): void
  onEdit(editing: boolean): void
  onBoxChange(box: Box, gestureKey: string): void
  onParagraphsChange(paragraphs: TextParagraph[], sessionKey: string): void
  onTableCellChange(row: number, col: number, text: string, sessionKey: string): void
  onTextEditorChange(editor: Editor | null): void
}

function EditableElement(props: EditableElementProps) {
  const { element, theme, scale, isSelected, isOnlySelected, isEditing } = props
  const isText = element.type === 'text'
  /** Elementos con contenido que se escribe dentro: texto y tablas. */
  const isWritable = isText || element.type === 'table'

  /** Arrastre genérico: mueve (handle = null) o redimensiona (handle = 'se', 'n', ...). */
  const startGesture = (event: ReactPointerEvent, handle: ResizeHandle | null) => {
    if (event.button !== 0) return
    event.stopPropagation()
    const wasSelected = isOnlySelected
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    // Los tiradores solo existen con un elemento seleccionado: redimensionar no cambia la selección.
    const startBoxes = handle ? null : props.onPress(additive)
    if (!handle && !startBoxes) return

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
        // Grupos e imágenes conservan la proporción al tirar de una esquina.
        const keepAspect = element.type === 'image' || element.type === 'group'
        props.onBoxChange(resizeBox(startBox, handle, dx, dy, keepAspect), gestureKey)
      } else if (startBoxes) {
        props.onMove(startBoxes, dx, dy, gestureKey)
      }
    }

    const onUp = () => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      props.onGestureEnd()
      if (!moved && !handle) props.onClick()
      // Clic (sin arrastrar) sobre un texto ya seleccionado o vacío -> entrar a escribir.
      if (!moved && !handle && isWritable && (wasSelected || (isText && !hasText(element.paragraphs)))) {
        props.onEdit(true)
      }
    }

    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }

  const classes = ['slide-element', 'is-interactive', isSelected && 'is-selected', isEditing && 'is-editing']
  // Los cuadros de texto vacíos llevan borde punteado para que se vean, como en las suites clásicas.
  if (isText && !hasText(element.paragraphs)) classes.push('is-empty-text')

  return (
    <div
      className={classes.filter(Boolean).join(' ')}
      style={boxCss(element)}
      onPointerDown={isEditing ? (event) => event.stopPropagation() : (event) => startGesture(event, null)}
      onDoubleClick={() => isWritable && props.onEdit(true)}
    >
      {isEditing && element.type === 'text' ? (
        <EditableText
          element={element}
          theme={theme}
          onChange={props.onParagraphsChange}
          onDone={() => props.onEdit(false)}
          onEditorChange={props.onTextEditorChange}
        />
      ) : isEditing && element.type === 'table' ? (
        <EditableTable
          element={element}
          theme={theme}
          onChange={props.onTableCellChange}
          onDone={() => props.onEdit(false)}
        />
      ) : (
        <ElementContent element={element} theme={theme} showPlaceholder />
      )}
      {isOnlySelected &&
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

/**
 * Edición de una tabla: cada celda pasa a ser un área de texto. Es texto plano a propósito
 * (las tablas de diapositiva rara vez llevan más), y Tab salta a la celda siguiente como en PowerPoint.
 */
function EditableTable({
  element,
  theme,
  onChange,
  onDone
}: {
  element: TableElement
  theme: SlideTheme
  onChange(row: number, col: number, text: string, sessionKey: string): void
  onDone(): void
}) {
  const sessionKey = useRef(`table:${element.id}:${++gestureCounter}`)
  const columns = element.rows[0]?.length ?? 0
  return (
    <TableContent
      element={element}
      theme={theme}
      renderCell={(row, col, text) => (
        <textarea
          className="slide-table__input"
          aria-label={`Fila ${row + 1}, columna ${col + 1}`}
          value={text}
          autoFocus={row === 0 && col === 0}
          data-cell={row * columns + col}
          onChange={(event) => onChange(row, col, event.target.value, sessionKey.current)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onDone()
            if (event.key !== 'Tab') return
            event.preventDefault()
            const table = event.currentTarget.closest('table')
            const next =
              (row * columns + col + (event.shiftKey ? -1 : 1) + columns * element.rows.length) %
              (columns * element.rows.length)
            table?.querySelector<HTMLTextAreaElement>(`[data-cell="${next}"]`)?.focus()
          }}
        />
      )}
    />
  )
}

interface EditableTextProps {
  element: TextElement
  theme: SlideTheme
  onChange(paragraphs: TextParagraph[], sessionKey: string): void
  onDone(): void
  onEditorChange(editor: Editor | null): void
}

/**
 * Edición de un cuadro con Tiptap, para poder dar formato a palabras sueltas.
 * El editor se crea al entrar a escribir con el contenido del modelo y, en cada cambio, devuelve
 * párrafos del modelo (model/richText.ts). Fuera de este modo, el cuadro se pinta sin Tiptap
 * (ElementContent), así las miniaturas y la presentación no cargan un editor por cuadro.
 */
function EditableText({ element, theme, onChange, onDone, onEditorChange }: EditableTextProps) {
  const sessionKey = useRef(`text:${element.id}:${++gestureCounter}`)
  // El estilo del cuadro puede cambiar mientras se escribe (alinear, viñetas): siempre el último.
  const styleRef = useRef(element.style)
  styleRef.current = element.style
  const callbacks = useRef({ onChange, onDone })
  callbacks.current = { onChange, onDone }

  const extensions = useMemo(createSlideTextExtensions, [])
  const editor = useEditor({
    extensions,
    // Solo al montar: después el editor es la fuente de verdad mientras se escribe.
    content: toEditorDoc(element.paragraphs, element.style),
    autofocus: 'end',
    editorProps: {
      attributes: { class: 'slide-text__content', spellcheck: 'true', lang: 'es' },
      handleKeyDown: (_view, event) => {
        if (event.key !== 'Escape') return false
        callbacks.current.onDone()
        return true
      }
    },
    onUpdate: ({ editor: current }) =>
      callbacks.current.onChange(fromEditorDoc(current.getJSON(), styleRef.current), sessionKey.current)
  })

  useEffect(() => {
    onEditorChange(editor)
    return () => onEditorChange(null)
  }, [editor, onEditorChange])

  return (
    <div
      className={textClassName(element, 'is-editing')}
      // Negrita, cursiva y subrayado van como marcas en cada trozo: el contenedor no las aplica.
      style={{
        ...textCss(element, theme),
        justifyContent: 'flex-start',
        fontWeight: 400,
        fontStyle: 'normal',
        textDecoration: 'none'
      }}
    >
      <EditorContent editor={editor} />
    </div>
  )
}
