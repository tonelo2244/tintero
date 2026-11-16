import { mergeAttributes, Node, type ChainedCommands, type JSONContent } from '@tiptap/core'
import { NodeSelection, TextSelection, type EditorState } from '@tiptap/pm/state'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      /** Inserta un salto de página donde está el cursor (parte el párrafo si hace falta). */
      setPageBreak: () => ReturnType
    }
  }
}

/**
 * Salto de página: un bloque vacío que no se puede editar por dentro. No pinta nada en la hoja
 * (solo una línea con "Salto de página" cuando se ven las marcas de párrafo); su efecto lo pone la
 * paginación, que hace empezar hoja nueva al bloque siguiente (editor/Pagination.ts).
 *
 * En el HTML es `<hr data-page-break>`: así lo reconoce también la importación de .docx, que
 * traduce el `w:br w:type="page"` de Word a esa misma etiqueta.
 */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    // Antes que la regla de la línea horizontal (prioridad 50): las dos son <hr>.
    return [{ tag: 'hr[data-page-break]', priority: 60 }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['hr', mergeAttributes(HTMLAttributes, { 'data-page-break': '', class: 'writer-page-break' })]
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain, state }) =>
          insertBreak(chain, state, { type: this.name })
    }
  }
})

/**
 * Inserta un salto (de página o de sección) donde está el cursor, partiendo el párrafo si hace
 * falta, y deja el cursor al principio de lo que va detrás, como en Word.
 */
export function insertBreak(chain: () => ChainedCommands, state: EditorState, node: JSONContent): boolean {
  const { $to } = state.selection
  // Al final del documento hace falta un párrafo detrás: la hoja nueva necesita dónde escribir.
  const atDocumentEnd = $to.after(1) === state.doc.content.size
  const content = atDocumentEnd ? [node, { type: 'paragraph' }] : [node]
  return chain()
    .insertContent(content)
    .command(({ tr }) => {
      // insertContent deja a veces seleccionado el salto (selección de nodo): lo siguiente que
      // escribieras lo sustituiría.
      const { selection } = tr
      if (selection instanceof NodeSelection && selection.node.type.name === node.type) {
        tr.setSelection(TextSelection.near(tr.doc.resolve(selection.to), 1))
      }
      return true
    })
    .run()
}
