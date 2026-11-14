import { useEffect, useState, type RefObject } from 'react'
import type { Editor } from '@tiptap/react'

/** Alto de una hoja A4 a 96 ppp (29,7 cm). */
export const PAGE_HEIGHT_PX = 1123

/**
 * Paginación visual aproximada: el documento es una hoja continua y calculamos
 * cuántas "páginas" ocupa y en cuál está el cursor. La paginación real (cortar el
 * contenido en hojas separadas) es mucho más compleja y se deja para el futuro.
 */
export function usePageMetrics(editor: Editor | null, pageRef: RefObject<HTMLElement | null>, zoom: number) {
  const [metrics, setMetrics] = useState({ current: 1, total: 1 })

  useEffect(() => {
    const page = pageRef.current
    if (!editor || !page) return

    const measure = () => {
      const total = Math.max(1, Math.ceil(page.scrollHeight / PAGE_HEIGHT_PX))
      let current = 1
      try {
        const caretTop = editor.view.coordsAtPos(editor.state.selection.from).top
        const offset = (caretTop - page.getBoundingClientRect().top) / zoom
        current = Math.min(total, Math.max(1, Math.floor(offset / PAGE_HEIGHT_PX) + 1))
      } catch {
        // coordsAtPos puede fallar durante el montaje; nos quedamos con la página 1.
      }
      setMetrics((previous) =>
        previous.current === current && previous.total === total ? previous : { current, total }
      )
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(page)
    editor.on('selectionUpdate', measure)
    editor.on('update', measure)
    return () => {
      observer.disconnect()
      editor.off('selectionUpdate', measure)
      editor.off('update', measure)
    }
  }, [editor, pageRef, zoom])

  return metrics
}
