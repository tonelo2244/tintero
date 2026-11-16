import { mergeAttributes, Node } from '@tiptap/core'
import { COLUMN_BREAK, COLUMNS, MAX_COLUMNS, normalizeColumnCount } from '../model/columns'
import { insertBreak } from './PageBreak'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columns: {
      /**
       * Pone en `count` columnas los bloques seleccionados (o, sin selección, el párrafo del
       * cursor). Si el cursor ya está en un bloque de columnas, le cambia el número; con 1, lo quita.
       */
      setColumns: (count: number) => ReturnType
      /** Salto de columna: lo de detrás empieza en la columna siguiente. */
      setColumnBreak: () => ReturnType
    }
  }
}

/**
 * Bloque de columnas (fase 15): un contenedor cuyos bloques se reparten en columnas con CSS
 * `columns`. En Word las columnas son de la sección; aquí son un bloque, que es lo mismo que una
 * sección "continua" con columnas y se exporta así a .docx (ver exportDocx.ts).
 *
 * La paginación lo trata como un bloque entero: si cabe en lo que queda de hoja, las columnas se
 * equilibran; si no, empieza hoja y cada hoja es una fila de columnas (ver Pagination.ts).
 */
export const Columns = Node.create({
  name: COLUMNS,
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      count: {
        default: 2,
        parseHTML: (element) => normalizeColumnCount(Number(element.getAttribute('data-columns'))),
        renderHTML: (attributes) => ({
          'data-columns': attributes.count,
          style: `--columns: ${attributes.count}`
        })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-columns]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'writer-columns' }), 0]
  },

  addCommands() {
    return {
      setColumns:
        (count) =>
        ({ state, commands, tr, dispatch }) => {
          const columns = Math.min(MAX_COLUMNS, Math.max(1, Math.round(count)))
          const { $from } = state.selection
          for (let depth = $from.depth; depth > 0; depth--) {
            if ($from.node(depth).type.name !== this.name) continue
            if (columns === 1) return commands.lift(this.name)
            if (dispatch) tr.setNodeMarkup($from.before(depth), undefined, { count: columns })
            return true
          }
          if (columns === 1) return true
          return commands.wrapIn(this.name, { count: columns })
        },
      setColumnBreak:
        () =>
        ({ chain, state }) =>
          insertBreak(chain, state, { type: COLUMN_BREAK })
    }
  }
})

/** Salto de columna: como el de página, un bloque que no ocupa sitio. `<hr data-column-break>`. */
export const ColumnBreak = Node.create({
  name: COLUMN_BREAK,
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'hr[data-column-break]', priority: 70 }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['hr', mergeAttributes(HTMLAttributes, { 'data-column-break': '', class: 'writer-column-break' })]
  }
})
