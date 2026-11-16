import { useEditorState, type Editor } from '@tiptap/react'
import { pageOfPosition } from '../model/pageLayout'

/**
 * Hojas del documento y hoja en la que está el cursor, para la barra de estado y para pintar las
 * hojas detrás del texto. Las dos cosas las deja la extensión Pagination en su almacén: la hoja
 * del cursor sale de dónde empieza cada hoja, sin medir la pantalla.
 */
export function usePageMetrics(editor: Editor | null) {
  return (
    useEditorState({
      editor,
      // Cualquier transacción, no solo las que cambian texto o cursor: la paginación mueve las
      // hojas con una transacción propia.
      selector: ({ editor: current }) => {
        const storage = current?.storage.pagination
        if (!current || !storage) return { current: 1, total: 1 }
        const total = storage.pageCount
        return { current: Math.min(total, pageOfPosition(storage.pageStarts, current.state.selection.from)), total }
      },
      equalityFn: (a, b) => a?.current === b?.current && a?.total === b?.total
    }) ?? { current: 1, total: 1 }
  )
}
