import { useEditorState, type Editor } from '@tiptap/react'
import { pageOfPosition } from '../model/pageLayout'
import type { SheetBox } from './Pagination'

export interface PageMetrics {
  /** Hoja del cursor (desde 1). */
  current: number
  total: number
  /** Dónde se pinta cada hoja y con qué tamaño (con secciones, no todas son iguales). */
  sheets: SheetBox[]
  /** Ancho de la hoja más ancha. */
  layoutWidth: number | null
}

const EMPTY: PageMetrics = { current: 1, total: 1, sheets: [], layoutWidth: null }

/**
 * Hojas del documento y hoja en la que está el cursor, para la barra de estado y para pintar las
 * hojas detrás del texto. Todo lo deja la extensión Pagination en su almacén: la hoja del cursor
 * sale de dónde empieza cada hoja, sin medir la pantalla.
 */
export function usePageMetrics(editor: Editor | null): PageMetrics {
  return (
    useEditorState({
      editor,
      // Cualquier transacción, no solo las que cambian texto o cursor: la paginación mueve las
      // hojas con una transacción propia.
      selector: ({ editor: current }): PageMetrics => {
        const storage = current?.storage.pagination
        if (!current || !storage) return EMPTY
        const total = storage.pageCount
        return {
          current: Math.min(total, pageOfPosition(storage.pageStarts, current.state.selection.from)),
          total,
          sheets: storage.sheets,
          layoutWidth: storage.layoutWidth
        }
      },
      equalityFn: (a, b) =>
        a?.current === b?.current &&
        a?.total === b?.total &&
        a?.sheets === b?.sheets &&
        a?.layoutWidth === b?.layoutWidth
    }) ?? EMPTY
  )
}
