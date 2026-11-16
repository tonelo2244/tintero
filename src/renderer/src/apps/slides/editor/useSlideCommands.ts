import { useMemo, useRef } from 'react'
import { createId } from '@/core/ids'
import { readImageFile } from '@/ui/readImageFile'
import { alignBoxes, cloneElement, distributeBoxes, type AlignMode, type DistributeAxis } from '../model/arrange'
import {
  cloneSlide,
  createImageElement,
  createShapeElement,
  createSlide,
  createTableElement,
  createTextElement,
  centeredBox
} from '../model/factories'
import type {
  Box,
  Presentation,
  ShapeKind,
  ShapeStyle,
  Slide,
  SlideElement,
  SlideLayoutId,
  SlideTransition,
  TextStyle
} from '../model/types'
import type { ApplyAction } from './SlideCanvas'

interface SlideCommandContext {
  presentation: Presentation
  currentSlide: Slide
  /** Elementos seleccionados de la diapositiva actual, en el orden de la diapositiva. */
  selectedElements: SlideElement[]
  apply: ApplyAction
  selectSlide(id: string): void
  selectElements(ids: string[]): void
  editElement(id: string | null): void
}

/** Lo copiado: los elementos tal cual y cuántas veces se han pegado (para escalonar las copias). */
interface ElementClipboard {
  elements: SlideElement[]
  sourceSlideId: string
  pastes: number
}

/** Cuánto se desplaza cada copia pegada o duplicada, para que no tape a la original. */
const PASTE_OFFSET = 20

function loadImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    image.src = src
  })
}

/**
 * Acciones de alto nivel ("nueva diapositiva", "insertar forma"...).
 * La cinta y los atajos de teclado llaman a esto; ninguno construye acciones a mano.
 */
export function useSlideCommands(context: SlideCommandContext) {
  const { presentation, currentSlide, selectedElements, apply, selectSlide, selectElements, editElement } = context
  // El portapapeles es interno (no el del sistema): lo que se copia son elementos del modelo,
  // que otra aplicación no sabría leer. Copiar texto mientras se escribe sigue usando el del sistema.
  const clipboard = useRef<ElementClipboard | null>(null)

  return useMemo(() => {
    const currentIndex = presentation.slides.findIndex((slide) => slide.id === currentSlide.id)
    const slideId = currentSlide.id
    const selectedElement = selectedElements.length === 1 ? selectedElements[0] : null
    const selectedIds = selectedElements.map((element) => element.id)

    const addElement = (element: SlideElement) => {
      apply({ type: 'element/add', slideId, element })
      selectElements([element.id])
    }

    const addCopies = (elements: SlideElement[], offset: number) => {
      const copies = elements.map((element) => cloneElement(element, offset))
      apply({ type: 'elements/add', slideId, elements: copies })
      selectElements(copies.map((copy) => copy.id))
    }

    const setBoxes = (boxes: Record<string, Box>, coalesceKey?: string) => {
      if (Object.keys(boxes).length > 0) apply({ type: 'elements/setBoxes', slideId, boxes }, coalesceKey)
    }

    return {
      addSlide(layout: SlideLayoutId) {
        const slide = createSlide(layout)
        apply({ type: 'slide/add', slide, index: currentIndex + 1 })
        selectSlide(slide.id)
      },
      duplicateSlide(slideId = currentSlide.id) {
        const source = presentation.slides.find((slide) => slide.id === slideId)
        if (!source) return
        const copy = cloneSlide(source)
        apply({ type: 'slide/add', slide: copy, index: presentation.slides.indexOf(source) + 1 })
        selectSlide(copy.id)
      },
      deleteSlide(slideId = currentSlide.id) {
        if (presentation.slides.length <= 1) return
        const index = presentation.slides.findIndex((slide) => slide.id === slideId)
        const neighbour = presentation.slides[index + 1] ?? presentation.slides[index - 1]
        apply({ type: 'slide/delete', slideId })
        if (slideId === currentSlide.id) selectSlide(neighbour.id)
      },
      moveSlide(from: number, to: number) {
        apply({ type: 'slide/move', from, to })
      },
      insertTextBox() {
        const element = createTextElement('free', centeredBox(480, 80))
        addElement(element)
        editElement(element.id)
      },
      insertShape(shape: ShapeKind) {
        addElement(createShapeElement(shape))
      },
      insertTable(rows: number, cols: number) {
        addElement(createTableElement(rows, cols))
      },
      /** Gira el elemento seleccionado `delta` grados; con `delta` null, lo deja recto. */
      rotateSelected(delta: number | null) {
        if (!selectedElement) return
        const rotation = delta === null ? 0 : (selectedElement.rotation ?? 0) + delta
        apply({ type: 'element/setRotation', slideId: currentSlide.id, elementId: selectedElement.id, rotation })
      },
      setTableCell(elementId: string, row: number, col: number, text: string, sessionKey: string) {
        apply({ type: 'table/setCell', slideId: currentSlide.id, elementId, row, col, cell: { text } }, sessionKey)
      },
      async insertImage(file: File) {
        const src = await readImageFile(file)
        const size = await loadImageSize(src)
        addElement(createImageElement(src, file.name, size.width, size.height))
      },
      deleteSelected() {
        if (selectedIds.length === 0) return
        apply({ type: 'elements/delete', slideId, elementIds: selectedIds })
        selectElements([])
      },
      nudgeSelected(dx: number, dy: number) {
        const boxes = Object.fromEntries(
          selectedElements.map((element) => [
            element.id,
            { x: element.x + dx, y: element.y + dy, width: element.width, height: element.height }
          ])
        )
        setBoxes(boxes, `nudge:${selectedIds.join(',')}`)
      },
      selectAll() {
        selectElements(currentSlide.elements.map((element) => element.id))
      },
      copySelected() {
        if (selectedElements.length === 0) return false
        clipboard.current = { elements: structuredClone(selectedElements), sourceSlideId: slideId, pastes: 0 }
        return true
      },
      cutSelected() {
        if (selectedElements.length === 0) return
        clipboard.current = { elements: structuredClone(selectedElements), sourceSlideId: slideId, pastes: 0 }
        apply({ type: 'elements/delete', slideId, elementIds: selectedIds })
        selectElements([])
      },
      canPaste() {
        return clipboard.current !== null
      },
      /**
       * Pega lo copiado. En otra diapositiva va en el mismo sitio (como en PowerPoint); en la misma,
       * cada pegado se desplaza un poco más para que las copias no queden apiladas.
       */
      paste() {
        const copied = clipboard.current
        if (!copied) return
        if (copied.sourceSlideId !== slideId) {
          copied.sourceSlideId = slideId
          copied.pastes = 0
        } else {
          copied.pastes += 1
        }
        addCopies(copied.elements, copied.pastes * PASTE_OFFSET)
      },
      duplicateSelected() {
        if (selectedElements.length > 0) addCopies(selectedElements, PASTE_OFFSET)
      },
      alignSelected(mode: AlignMode) {
        if (selectedElements.length > 0) setBoxes(alignBoxes(selectedElements, mode))
      },
      distributeSelected(axis: DistributeAxis) {
        setBoxes(distributeBoxes(selectedElements, axis))
      },
      groupSelected() {
        if (selectedElements.length < 2) return
        const groupId = createId('el')
        apply({ type: 'elements/group', slideId, elementIds: selectedIds, groupId })
        selectElements([groupId])
      },
      ungroupSelected() {
        if (selectedElement?.type !== 'group') return
        apply({ type: 'elements/ungroup', slideId, groupId: selectedElement.id })
        selectElements(selectedElement.children.map((child) => child.id))
      },
      setTransition(transition: SlideTransition) {
        apply({ type: 'slide/setTransition', slideId, transition })
      },
      setTextStyle(style: Partial<TextStyle>) {
        if (selectedElement?.type !== 'text') return
        apply({ type: 'element/setTextStyle', slideId: currentSlide.id, elementId: selectedElement.id, style })
      },
      setShapeStyle(style: Partial<ShapeStyle>) {
        if (selectedElement?.type !== 'shape') return
        apply({ type: 'element/setShapeStyle', slideId: currentSlide.id, elementId: selectedElement.id, style })
      },
      reorderSelected(direction: 'front' | 'back') {
        if (!selectedElement) return
        apply({ type: 'element/reorder', slideId: currentSlide.id, elementId: selectedElement.id, direction })
      },
      setNotes(notes: string) {
        apply({ type: 'slide/setNotes', slideId: currentSlide.id, notes }, `notes:${currentSlide.id}`)
      },
      setTheme(themeId: string) {
        apply({ type: 'presentation/setTheme', themeId })
      }
    }
  }, [presentation, currentSlide, selectedElements, apply, selectSlide, selectElements, editElement])
}

export type SlideCommands = ReturnType<typeof useSlideCommands>
