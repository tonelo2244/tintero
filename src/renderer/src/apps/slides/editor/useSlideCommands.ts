import { useMemo } from 'react'
import { readImageFile } from '@/ui/readImageFile'
import { cloneSlide, createImageElement, createShapeElement, createSlide, createTextElement, centeredBox } from '../model/factories'
import type { Presentation, ShapeKind, ShapeStyle, Slide, SlideElement, SlideLayoutId, TextStyle } from '../model/types'
import type { ApplyAction } from './SlideCanvas'

interface SlideCommandContext {
  presentation: Presentation
  currentSlide: Slide
  selectedElement: SlideElement | null
  apply: ApplyAction
  selectSlide(id: string): void
  selectElement(id: string | null): void
  editElement(id: string | null): void
}

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
  const { presentation, currentSlide, selectedElement, apply, selectSlide, selectElement, editElement } = context

  return useMemo(() => {
    const currentIndex = presentation.slides.findIndex((slide) => slide.id === currentSlide.id)

    const addElement = (element: SlideElement) => {
      apply({ type: 'element/add', slideId: currentSlide.id, element })
      selectElement(element.id)
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
      async insertImage(file: File) {
        const src = await readImageFile(file)
        const size = await loadImageSize(src)
        addElement(createImageElement(src, file.name, size.width, size.height))
      },
      deleteSelectedElement() {
        if (!selectedElement) return
        apply({ type: 'element/delete', slideId: currentSlide.id, elementId: selectedElement.id })
        selectElement(null)
      },
      nudgeSelectedElement(dx: number, dy: number) {
        if (!selectedElement) return
        const { x, y, width, height } = selectedElement
        apply(
          { type: 'element/setBox', slideId: currentSlide.id, elementId: selectedElement.id, box: { x: x + dx, y: y + dy, width, height } },
          `nudge:${selectedElement.id}`
        )
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
  }, [presentation, currentSlide, selectedElement, apply, selectSlide, selectElement, editElement])
}

export type SlideCommands = ReturnType<typeof useSlideCommands>
