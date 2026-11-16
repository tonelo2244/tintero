import { mergeAttributes, Node } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { createRoot, type Root } from 'react-dom/client'
import { ChartView } from '@/apps/sheets/editor/charts/ChartView'
import { CHART, DEFAULT_CHART_SIZE, isChartKind, normalizeChartData, SAMPLE_CHART_DATA } from '../../model/chart'
import { objectView } from './ObjectView'
import { placementAttributes, sizeAttributes } from './placement'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    chart: {
      /** Inserta un gráfico de ejemplo delante del párrafo del cursor y lo deja seleccionado. */
      insertChart: () => ReturnType
    }
  }
}

/** Raíz de React de cada gráfico en pantalla (se desmonta al destruir la vista del nodo). */
const roots = new WeakMap<HTMLElement, Root>()

/**
 * Gráfico (fase 16): un objeto con su tabla de datos, pintado con el SVG de los gráficos de Hojas.
 * En el archivo va como atributos (`kind`, `title`, `data`); al .docx, como gráfico nativo de Word.
 */
export const Chart = Node.create({
  name: CHART,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      kind: {
        default: 'bar',
        parseHTML: (element) => {
          const kind = element.getAttribute('data-chart')
          return isChartKind(kind) ? kind : 'bar'
        },
        renderHTML: (attrs) => ({ 'data-chart': attrs.kind })
      },
      title: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-title') ?? '',
        renderHTML: (attrs) => (attrs.title ? { 'data-title': attrs.title } : {})
      },
      data: {
        default: SAMPLE_CHART_DATA,
        parseHTML: (element) => {
          try {
            return normalizeChartData(JSON.parse(element.getAttribute('data-values') ?? 'null'))
          } catch {
            return SAMPLE_CHART_DATA
          }
        },
        renderHTML: (attrs) => ({ 'data-values': JSON.stringify(attrs.data) })
      },
      alt: {
        default: null,
        parseHTML: (element) => element.getAttribute('aria-label'),
        renderHTML: (attrs) => (attrs.alt ? { 'aria-label': attrs.alt } : {})
      },
      ...sizeAttributes(),
      ...placementAttributes()
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-chart]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'writer-chart' })]
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const view = objectView({
        editor,
        node,
        getPos,
        keepRatio: true,
        render: (current, body) => {
          let root = roots.get(body)
          if (!root) {
            root = createRoot(body)
            roots.set(body, root)
          }
          root.render(
            <ChartView
              kind={current.attrs.kind}
              data={normalizeChartData(current.attrs.data)}
              title={current.attrs.title || undefined}
              width={Number(current.attrs.width) || DEFAULT_CHART_SIZE.width}
              height={Number(current.attrs.height) || DEFAULT_CHART_SIZE.height}
            />
          )
        },
        naturalSize: () => DEFAULT_CHART_SIZE
      })
      const body = view.dom.firstElementChild as HTMLElement
      return {
        ...view,
        destroy: () => {
          // Desmontar después del render en curso: React avisa si se desmonta durante uno.
          const root = roots.get(body)
          roots.delete(body)
          queueMicrotask(() => root?.unmount())
        }
      }
    }
  },

  addCommands() {
    return {
      insertChart:
        () =>
        ({ state, tr, dispatch }) => {
          const { $from } = state.selection
          let at = $from.pos
          for (let depth = $from.depth; depth > 0; depth--) {
            if ($from.node(depth).isTextblock) {
              at = $from.before(depth)
              break
            }
          }
          if (dispatch) {
            tr.insert(at, state.schema.nodes[CHART].create({ ...DEFAULT_CHART_SIZE, align: 'center' }))
            tr.setSelection(NodeSelection.create(tr.doc, at))
          }
          return true
        }
    }
  }
})
