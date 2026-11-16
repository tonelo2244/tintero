import { Node } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import {
  BIBLIOGRAPHY,
  CITATION,
  formatBibliography,
  formatCitation,
  type CitationStyle,
  type Source
} from '../model/citations'
import { registerPainter, type ReferencesStorage } from './references'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    citation: {
      /** Cita la fuente en el cursor (con las páginas, si se dan). */
      insertCitation: (sourceId: string, pages?: string) => ReturnType
      /** Cambia la fuente o las páginas de la cita en `pos`. */
      updateCitation: (pos: number, attrs: { sourceId?: string; pages?: string }) => ReturnType
      /** Inserta la bibliografía (todas las fuentes del documento) con un título. */
      insertBibliography: (title: string) => ReturnType
    }
  }
}

const citationText = (storage: ReferencesStorage, sourceId: string, pages: string) =>
  formatCitation(
    storage.sources.find((source) => source.id === sourceId),
    storage.citationStyle,
    { pages },
    storage.sources
  )

/**
 * Cita (fase 17): un átomo en línea que guarda la etiqueta de la fuente y las páginas citadas. El
 * texto, "(García, 2020, p. 5)", se escribe con el estilo del documento: cambiar de APA a ISO 690
 * cambia todas las citas a la vez, sin tocar el documento.
 */
export const Citation = Node.create({
  name: CITATION,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      sourceId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-citation') ?? '',
        renderHTML: (attrs) => ({ 'data-citation': attrs.sourceId })
      },
      pages: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-pages') ?? '',
        renderHTML: (attrs) => (attrs.pages ? { 'data-pages': attrs.pages } : {})
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-citation]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, class: 'writer-citation' }]
  },

  renderText({ node }) {
    return citationText(this.editor?.storage.references ?? emptyStorage, node.attrs.sourceId, node.attrs.pages)
  },

  addNodeView() {
    return ({ node, editor }) => {
      const dom = document.createElement('span')
      dom.className = 'writer-citation'
      dom.contentEditable = 'false'
      dom.title = 'Cita (doble clic para cambiar las páginas o la fuente)'
      let current = node
      const paint = () => {
        const text = citationText(editor.storage.references, current.attrs.sourceId, current.attrs.pages)
        if (dom.textContent !== text) dom.textContent = text
        dom.classList.toggle(
          'writer-citation--broken',
          !editor.storage.references.sources.some((source) => source.id === current.attrs.sourceId)
        )
      }
      paint()
      const unregister = registerPainter(paint)
      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== CITATION) return false
          current = updated
          paint()
          return true
        },
        destroy: unregister,
        ignoreMutation: () => true
      }
    }
  },

  addCommands() {
    return {
      insertCitation:
        (sourceId, pages = '') =>
        ({ commands }) =>
          commands.insertContent({ type: CITATION, attrs: { sourceId, pages } }),
      updateCitation:
        (pos, attrs) =>
        ({ state, tr, dispatch }) => {
          const node = state.doc.nodeAt(pos)
          if (node?.type.name !== CITATION) return false
          if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs })
          return true
        },
      insertBibliography:
        (title) =>
        ({ state, tr, dispatch }) => {
          if (dispatch) {
            const $from = state.selection.$from
            const at = $from.depth === 0 ? state.selection.from : $from.after(1)
            tr.insert(at, state.schema.nodes[BIBLIOGRAPHY].create({ title }))
          }
          return true
        }
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey('citationDoubleClick'),
        props: {
          handleDoubleClickOn: (_view, _pos, node, nodePos) => {
            const open = editor.storage.references.openCitation
            if (node.type.name !== CITATION || !open) return false
            open(nodePos)
            return true
          }
        }
      })
    ]
  }
})

const emptyStorage: ReferencesStorage = { sources: [], citationStyle: 'apa', openNote: null, openCitation: null }

/**
 * Bibliografía (fase 17): un bloque atómico con todas las fuentes del documento, ordenadas y en
 * su estilo, como la de Word. Se pinta sola: añadir una fuente o cambiar de estilo la cambia.
 */
export const Bibliography = Node.create({
  name: BIBLIOGRAPHY,
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      title: {
        default: 'Referencias',
        parseHTML: (element) => element.getAttribute('data-bibliography') ?? 'Referencias',
        renderHTML: (attrs) => ({ 'data-bibliography': attrs.title })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-bibliography]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const storage = this.editor?.storage.references ?? emptyStorage
    return [
      'div',
      { ...HTMLAttributes, class: 'writer-bibliography' },
      ...(node.attrs.title ? [['p', { class: 'writer-bibliography__title' }, node.attrs.title]] : []),
      ...formatBibliography(storage.sources, storage.citationStyle).map((entry) => [
        'p',
        { class: 'writer-bibliography__entry' },
        entry.pieces.map((piece) => piece.text).join('')
      ])
    ]
  },

  addNodeView() {
    return ({ node, editor }) => {
      const dom = document.createElement('div')
      dom.className = 'writer-bibliography'
      dom.contentEditable = 'false'
      let current = node
      let painted = ''
      const paint = () => {
        const { sources, citationStyle } = editor.storage.references
        const key = JSON.stringify([current.attrs.title, sources, citationStyle])
        if (key === painted) return
        painted = key
        dom.replaceChildren(renderBibliography(String(current.attrs.title ?? ''), sources, citationStyle))
      }
      paint()
      const unregister = registerPainter(paint)
      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== BIBLIOGRAPHY) return false
          current = updated
          paint()
          return true
        },
        destroy: unregister,
        ignoreMutation: () => true
      }
    }
  }
})

function renderBibliography(title: string, sources: Source[], style: CitationStyle): DocumentFragment {
  const fragment = document.createDocumentFragment()
  if (title) {
    const heading = document.createElement('p')
    heading.className = 'writer-bibliography__title'
    heading.textContent = title
    fragment.appendChild(heading)
  }
  const entries = formatBibliography(sources, style)
  if (entries.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'writer-bibliography__empty'
    empty.textContent = 'No hay fuentes. Añádelas en Referencias > Administrar fuentes.'
    fragment.appendChild(empty)
  }
  for (const entry of entries) {
    const paragraph = document.createElement('p')
    paragraph.className = 'writer-bibliography__entry'
    paragraph.dataset.source = entry.id
    for (const piece of entry.pieces) {
      if (piece.italic) {
        const italic = document.createElement('i')
        italic.textContent = piece.text
        paragraph.appendChild(italic)
      } else paragraph.appendChild(document.createTextNode(piece.text))
    }
    fragment.appendChild(paragraph)
  }
  return fragment
}
