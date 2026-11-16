import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { DEFAULT_GEOMETRY, paginate, type MeasuredBlock } from '../model/pageLayout'
import type { PageGeometry } from '../model/pageSetup'

declare module '@tiptap/core' {
  interface Storage {
    pagination: PaginationStorage
  }
  interface Commands<ReturnType> {
    pagination: {
      /** Cambia el tamaño útil de la hoja (configuración de página) y vuelve a repartir los bloques. */
      setPageGeometry: (geometry: PageGeometry) => ReturnType
      /** Enciende o apaga las hojas (las vistas Borrador, Esquema y Lectura van sin paginar). */
      setPaginationEnabled: (enabled: boolean) => ReturnType
    }
  }
}

export interface PaginationStorage {
  /** Hojas que ocupa el documento según la última medición. */
  pageCount: number
  geometry: PageGeometry
  /** Sin paginar, el texto va seguido (vistas Borrador, Esquema y Lectura). */
  enabled: boolean
  /** Posición en el documento del primer bloque de cada hoja (la 1 empieza en 0): miniaturas y "ir a la página". */
  pageStarts: number[]
  /** Lo rellena la vista del plugin: pide un reparto nuevo en el siguiente fotograma. */
  requestLayout: (() => void) | null
}

const paginationKey = new PluginKey<DecorationSet>('pagination')

/** Contenedores que se pueden partir entre hojas por sus hijos: cada elemento de lista es un bloque. */
const SPLITTABLE = new Set(['bulletList', 'orderedList', 'taskList'])

/**
 * Paginación real en el editor: los bloques que no caben en lo que queda de hoja bajan a la
 * siguiente. El documento sigue siendo uno (no hay una instancia de editor por hoja, que rompería
 * deshacer, buscar o seleccionar de una hoja a otra); lo que cambia es el margen superior del
 * bloque que abre cada hoja, con una decoración de ProseMirror que no toca el documento guardado.
 *
 * Cada vez que el texto cambia:
 *   1. se quitan los saltos y se miden los bloques tal como quedarían sin paginar;
 *   2. `paginate` (lógica pura, en model/pageLayout.ts) decide dónde empieza cada hoja;
 *   3. se aplican los saltos. Los pasos 1-3 van en el mismo fotograma: no se ve el parpadeo.
 * Al imprimir, esos mismos bloques llevan `break-before: page` (ver global.css): la hoja impresa
 * corta donde la de pantalla.
 */
export const Pagination = Extension.create<object, PaginationStorage>({
  name: 'pagination',

  addStorage() {
    return { pageCount: 1, geometry: DEFAULT_GEOMETRY, enabled: true, pageStarts: [0], requestLayout: null }
  },

  addCommands() {
    return {
      setPageGeometry: (geometry) => () => {
        this.storage.geometry = geometry
        this.storage.requestLayout?.()
        return true
      },
      setPaginationEnabled: (enabled) => () => {
        if (this.storage.enabled === enabled) return true
        this.storage.enabled = enabled
        this.storage.requestLayout?.()
        return true
      }
    }
  },

  addProseMirrorPlugins() {
    const storage = this.storage
    return [
      new Plugin<DecorationSet>({
        key: paginationKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, decorations) => tr.getMeta(paginationKey) ?? decorations.map(tr.mapping, tr.doc)
        },
        props: {
          decorations: (state) => paginationKey.getState(state)
        },
        view: (view) => {
          let frame = 0
          let lastWidth = 0
          const schedule = () => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(() => {
              // Durante una composición (acentos, IME) no se puede despachar sin estropearla.
              if (view.composing) return schedule()
              layout(view, storage)
            })
          }
          // Solo los cambios de ancho cambian el reparto (el alto lo cambiamos nosotros).
          const resize = new ResizeObserver(([entry]) => {
            const width = entry.contentRect.width
            if (Math.abs(width - lastWidth) < 0.5) return
            lastWidth = width
            schedule()
          })
          resize.observe(view.dom)
          // Imágenes que terminan de cargar y fuentes que llegan tarde cambian el alto de los bloques.
          view.dom.addEventListener('load', schedule, true)
          storage.requestLayout = schedule
          void document.fonts?.ready.then(schedule)
          schedule()
          return {
            update: (current, previous) => {
              if (!current.state.doc.eq(previous.doc)) schedule()
            },
            destroy: () => {
              cancelAnimationFrame(frame)
              storage.requestLayout = null
              resize.disconnect()
              view.dom.removeEventListener('load', schedule, true)
            }
          }
        }
      })
    ]
  }
})

interface Unit {
  pos: number
  node: ProseMirrorNode
  /** Va justo detrás de un salto de página. */
  breakBefore: boolean
}

/**
 * Bloques que pueden abrir una hoja, en orden: los de primer nivel y los elementos de las listas.
 * Los saltos de página no son unidades (no ocupan sitio): marcan la unidad siguiente.
 */
function collectUnits(doc: ProseMirrorNode): Unit[] {
  const units: Unit[] = []
  let breakBefore = false
  doc.forEach((node, offset) => {
    if (node.type.name === 'pageBreak') {
      breakBefore = true
      return
    }
    if (SPLITTABLE.has(node.type.name)) {
      node.forEach((item, itemOffset) => {
        units.push({ pos: offset + 1 + itemOffset, node: item, breakBefore })
        breakBefore = false
      })
    } else {
      units.push({ pos: offset, node, breakBefore })
      breakBefore = false
    }
  })
  return units
}

/** Mide, reparte y aplica los saltos, y anota el número de hojas. */
function layout(view: EditorView, storage: PaginationStorage): void {
  const hadBreaks = paginationKey.getState(view.state) !== DecorationSet.empty
  if (hadBreaks) {
    view.dispatch(view.state.tr.setMeta(paginationKey, DecorationSet.empty).setMeta('addToHistory', false))
  }

  if (!storage.enabled) {
    // Sin hojas: se quitan los saltos y el documento cuenta como una sola tira de texto.
    const changed = storage.pageCount !== 1
    storage.pageCount = 1
    storage.pageStarts = [0]
    if (changed) view.dispatch(view.state.tr.setMeta('addToHistory', false))
    return
  }

  const origin = view.dom.getBoundingClientRect()
  // Con zoom, getBoundingClientRect da píxeles de pantalla; offsetHeight, píxeles del documento.
  const scale = view.dom.offsetHeight > 0 ? origin.height / view.dom.offsetHeight : 1
  const measured: (MeasuredBlock & Unit)[] = []
  for (const unit of collectUnits(view.state.doc)) {
    const dom = view.nodeDOM(unit.pos)
    if (!(dom instanceof HTMLElement)) continue
    const box = dom.getBoundingClientRect()
    measured.push({ ...unit, top: (box.top - origin.top) / scale, bottom: (box.bottom - origin.top) / scale })
  }

  const { breaks, pageCount } = paginate(measured, storage.geometry.pitch, storage.geometry.contentHeight)
  const decorations = breaks.map(({ index, shift }) => {
    const block = measured[index]
    // El margen nuevo sustituye al hueco que había con el bloque anterior (márgenes colapsados).
    const gap = block.top - (index > 0 ? measured[index - 1].bottom : 0)
    return Decoration.node(block.pos, block.pos + block.node.nodeSize, {
      class: 'writer-page-start',
      style: `margin-top: ${(gap + shift).toFixed(2)}px`
    })
  })
  storage.pageStarts = [0, ...breaks.map(({ index }) => measured[index].pos)]
  // Sin saltos antes ni ahora y con las mismas hojas no hay nada que avisar: nos ahorramos la transacción.
  if (!hadBreaks && decorations.length === 0 && storage.pageCount === pageCount) return
  // Antes de despachar: quien lea las hojas al recibir la transacción (la barra de estado) ve el valor nuevo.
  storage.pageCount = pageCount
  view.dispatch(
    view.state.tr
      .setMeta(paginationKey, DecorationSet.create(view.state.doc, decorations))
      .setMeta('addToHistory', false)
  )
}
