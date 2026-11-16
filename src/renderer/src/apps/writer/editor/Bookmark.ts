import { Node } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { BOOKMARK, bookmarkOfHref } from '../model/links'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    bookmark: {
      /** Pone un marcador con ese nombre donde está el cursor (al principio de la selección). */
      setBookmark: (name: string) => ReturnType
      /** Quita el marcador con ese nombre (los vínculos a él dejan de llevar a ningún sitio). */
      removeBookmark: (name: string) => ReturnType
      /** Lleva el cursor al marcador y lo enseña. */
      goToBookmark: (name: string) => ReturnType
    }
  }
}

/**
 * Marcador: un punto con nombre dentro del texto, al que pueden apuntar los vínculos (`#nombre`).
 * Es un nodo en línea vacío: no ocupa sitio ni se imprime; con las marcas de párrafo a la vista se
 * ve como una "I" gris, como en Word.
 *
 * En el HTML es `<span id="nombre" data-bookmark="nombre">`. mammoth traduce los `w:bookmarkStart`
 * de Word a `<a id="nombre">`, que también se reconoce.
 */
export const Bookmark = Node.create({
  name: BOOKMARK,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      name: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-bookmark') ?? element.getAttribute('id') ?? ''
      }
    }
  },

  parseHTML() {
    return [
      { tag: 'span[data-bookmark]' },
      // Por delante de la marca `link` (prioridad 50 por defecto): sin href no es un vínculo.
      { tag: 'a[id]:not([href])', priority: 60 }
    ]
  },

  renderHTML({ node }) {
    const name = String(node.attrs.name)
    return ['span', { id: name, 'data-bookmark': name, class: 'writer-bookmark', title: `Marcador: ${name}` }]
  },

  renderText: () => '',

  addCommands() {
    return {
      setBookmark:
        (name) =>
        ({ tr, state, dispatch }) => {
          // Un nombre es único: si ya existía, se mueve aquí (como "Agregar" en el cuadro de Word).
          const existing = findBookmark(state.doc, name)
          if (dispatch) {
            if (existing !== null) tr.delete(existing, existing + 1)
            const at = tr.mapping.map(state.selection.from)
            tr.insert(at, state.schema.nodes[BOOKMARK].create({ name }))
          }
          return true
        },
      removeBookmark:
        (name) =>
        ({ tr, state, dispatch }) => {
          const pos = findBookmark(state.doc, name)
          if (pos === null) return false
          if (dispatch) tr.delete(pos, pos + 1)
          return true
        },
      goToBookmark:
        (name) =>
        ({ tr, state, dispatch, view }) => {
          const pos = findBookmark(state.doc, name)
          if (pos === null) return false
          if (dispatch) {
            tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1))).scrollIntoView()
            view.focus()
          }
          return true
        }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('linkClick'),
        props: {
          // Ctrl/Cmd+clic sigue el vínculo, como en Word (el clic normal sirve para escribir dentro).
          handleClick: (view, _pos, event) => {
            if (!(event.metaKey || event.ctrlKey)) return false
            const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href]')
            if (!anchor) return false
            followLink(view, anchor.getAttribute('href'))
            return true
          }
        }
      })
    ]
  }
})

/** Posición del marcador con ese nombre, o null si no está. */
export function findBookmark(doc: ProseMirrorNode, name: string): number | null {
  let found: number | null = null
  doc.descendants((node, pos) => {
    if (found !== null) return false
    if (node.type.name === BOOKMARK && node.attrs.name === name) found = pos
    return true
  })
  return found
}

/** Un vínculo interno lleva al marcador; uno externo se abre en el navegador del sistema. */
export function followLink(view: EditorView, href: string | null): void {
  const bookmark = bookmarkOfHref(href)
  if (bookmark) {
    const pos = findBookmark(view.state.doc, bookmark)
    if (pos === null) return
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos + 1))).scrollIntoView())
    view.focus()
    return
  }
  // El proceso principal manda window.open al navegador del sistema (setWindowOpenHandler).
  if (href) window.open(href, '_blank')
}
