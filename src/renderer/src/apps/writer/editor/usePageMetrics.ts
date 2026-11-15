import { useEffect, useState } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import { pageAt } from '../model/pageLayout'

/**
 * Hojas del documento (las cuenta la extensión Pagination) y hoja en la que está el cursor,
 * para la barra de estado y para pintar las hojas detrás del texto.
 */
export function usePageMetrics(editor: Editor | null, zoom: number) {
  const total =
    useEditorState({ editor, selector: ({ editor: current }) => current?.storage.pagination?.pageCount ?? 1 }) ?? 1
  const [current, setCurrent] = useState(1)

  useEffect(() => {
    if (!editor) return
    const measure = () => {
      try {
        const origin = editor.view.dom.getBoundingClientRect().top
        const caretTop = editor.view.coordsAtPos(editor.state.selection.from).top
        setCurrent(pageAt((caretTop - origin) / zoom, total))
      } catch {
        // coordsAtPos puede fallar durante el montaje; nos quedamos con la página 1.
        setCurrent(1)
      }
    }
    measure()
    editor.on('selectionUpdate', measure)
    editor.on('update', measure)
    return () => {
      editor.off('selectionUpdate', measure)
      editor.off('update', measure)
    }
  }, [editor, total, zoom])

  return { current: Math.min(current, total), total }
}
