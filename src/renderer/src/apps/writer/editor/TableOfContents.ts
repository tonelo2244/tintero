import { Node } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import {
  DEFAULT_TOC_LEVELS,
  isHeadingsToc,
  normalizeTocEntries,
  sameTocText,
  TOC,
  TOC_HEADINGS,
  tocEntries,
  tocIncludes,
  tocTitle,
  type TocEntry,
  type TocSource
} from '../model/toc'
import { documentIndex, ensureReferenceAnchors, pageAt, registerPainter } from './references'
import { findBookmark } from './Bookmark'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableOfContents: {
      /** Inserta una tabla de contenido (o un índice de ilustraciones) en el cursor. */
      insertTableOfContents: (options: { source: TocSource; levels?: number }) => ReturnType
      /** Vuelve a leer los títulos de todas las tablas del documento ("Actualizar tabla"). */
      updateTablesOfContents: () => ReturnType
    }
  }
}

/**
 * Tabla de contenido e índice de ilustraciones (fase 17). Es un bloque atómico: no se escribe
 * dentro, se actualiza. Guarda una foto de las entradas (texto, nivel y marcador de destino) y
 * pinta las páginas en vivo a partir de la paginación. Si los títulos cambian, avisa de que hay
 * que actualizarla, como Word cuando le das a "Actualizar campos".
 */
export const TableOfContents = Node.create({
  name: TOC,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      source: {
        default: TOC_HEADINGS,
        parseHTML: (element) => element.getAttribute('data-toc') || TOC_HEADINGS,
        renderHTML: (attrs) => ({ 'data-toc': attrs.source })
      },
      levels: {
        default: DEFAULT_TOC_LEVELS,
        parseHTML: (element) => Number(element.getAttribute('data-levels')) || DEFAULT_TOC_LEVELS,
        renderHTML: (attrs) => ({ 'data-levels': String(attrs.levels) })
      },
      entries: {
        default: [],
        parseHTML: (element) => {
          try {
            return normalizeTocEntries(JSON.parse(element.getAttribute('data-entries') ?? '[]'))
          } catch {
            return []
          }
        },
        renderHTML: (attrs) => ({ 'data-entries': JSON.stringify(attrs.entries ?? []) })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-toc]' }]
  },

  // Fuera del editor (copiar, plantillas) la tabla se escribe tal cual, con sus páginas guardadas.
  renderHTML({ node, HTMLAttributes }) {
    const entries = normalizeTocEntries(node.attrs.entries)
    return [
      'div',
      { ...HTMLAttributes, class: 'writer-toc' },
      ['p', { class: 'writer-toc__title' }, tocTitle(node.attrs.source)],
      ...entries.map((entry) => [
        'p',
        { class: `writer-toc__entry writer-toc__entry--${entry.level}` },
        `${entry.text}\t${entry.page}`
      ])
    ]
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div')
      dom.className = 'writer-toc'
      dom.contentEditable = 'false'
      let current = node
      let painted = ''
      const paint = () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (pos === undefined) return
        const entries = normalizeTocEntries(current.attrs.entries)
        const source = String(current.attrs.source)
        const index = documentIndex(editor.state.doc)
        const fresh = tocEntries(index.targets, source, Number(current.attrs.levels), (at) => at)
        const stale = !sameTocText(entries, fresh)
        const rows = entries.map((entry) => {
          const target = index.byAnchor.get(entry.anchor)
          return { ...entry, page: target ? pageAt(editor.storage, target.pos) : entry.page }
        })
        // Solo se reconstruye el DOM si cambia algo que se ve (se repinta en cada transacción).
        const key = JSON.stringify([rows, stale, source])
        if (key === painted) return
        painted = key
        dom.replaceChildren(renderToc(source, rows, stale, editor.isEditable))
        dom.dataset.toc = source
      }
      paint()
      const unregister = registerPainter(paint)
      dom.addEventListener('mousedown', (event) => {
        const element = event.target as HTMLElement
        if (element.closest('.writer-toc__update')) {
          event.preventDefault()
          editor.chain().focus().updateTablesOfContents().run()
          return
        }
        const entry = element.closest<HTMLElement>('[data-anchor]')
        // Como un vínculo: Ctrl/Cmd+clic lleva al título.
        if (entry && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          const target = findBookmark(editor.state.doc, entry.dataset.anchor ?? '')
          if (target === null) return
          editor.view.dispatch(
            editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(target + 1))).scrollIntoView()
          )
          editor.view.focus()
        }
      })
      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== TOC) return false
          current = updated
          paint()
          return true
        },
        destroy: unregister,
        ignoreMutation: () => true,
        stopEvent: (event) =>
          event.type === 'mousedown' && !!(event.target as HTMLElement).closest('.writer-toc__update')
      }
    }
  },

  addCommands() {
    return {
      insertTableOfContents:
        ({ source, levels = DEFAULT_TOC_LEVELS }) =>
        ({ state, tr, dispatch, editor }) => {
          if (dispatch) {
            const entries = currentEntries(tr, state, source, levels, (pos) => pageAt(editor.storage, pos))
            const toc = state.schema.nodes[TOC].create({ source, levels, entries })
            const at = tr.mapping.map(state.selection.from)
            const $at = tr.doc.resolve(at)
            // Un bloque va entre bloques: delante del bloque de primer nivel del cursor.
            tr.insert($at.depth === 0 ? at : $at.before(1), toc)
          }
          return true
        },
      updateTablesOfContents:
        () =>
        ({ state, tr, dispatch, editor }) => {
          const tables: { pos: number; node: ProseMirrorNode }[] = []
          state.doc.descendants((node, pos) => {
            if (node.type.name === TOC) tables.push({ pos, node })
            return !node.isTextblock
          })
          if (tables.length === 0) return false
          if (dispatch) {
            for (const { pos, node } of tables) {
              const entries = currentEntries(tr, state, node.attrs.source, Number(node.attrs.levels), (at) =>
                pageAt(editor.storage, at)
              )
              tr.setNodeMarkup(tr.mapping.map(pos), undefined, { ...node.attrs, entries })
            }
          }
          return true
        }
    }
  }
})

/** Entradas de ahora, dando antes su marcador a los títulos que lo necesitan (en la misma transacción). */
function currentEntries(
  tr: Transaction,
  state: EditorState,
  source: TocSource,
  levels: number,
  pageOf: (pos: number) => number
): TocEntry[] {
  const anchors = ensureReferenceAnchors(tr, state.doc, (target) => tocIncludes(target, source, levels))
  // Posiciones de antes de insertar los marcadores: la página se calcula con la última paginación.
  const targets = documentIndex(state.doc)
    .targets.filter((target) => target.kind !== 'bookmark' && anchors.has(target.pos))
    .map((target) => ({ ...target, anchor: anchors.get(target.pos)! }))
  return tocEntries(targets, source, levels, pageOf)
}

/** DOM de la tabla en pantalla: título, aviso si no está al día y una fila por entrada. */
function renderToc(source: string, rows: TocEntry[], stale: boolean, editable: boolean): DocumentFragment {
  const fragment = document.createDocumentFragment()
  const header = document.createElement('div')
  header.className = 'writer-toc__header'
  const title = document.createElement('p')
  title.className = 'writer-toc__title'
  title.textContent = tocTitle(source)
  header.appendChild(title)
  if (editable) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `writer-toc__update${stale ? ' writer-toc__update--stale' : ''}`
    button.textContent = stale ? 'Actualizar tabla (hay cambios)' : 'Actualizar tabla'
    header.appendChild(button)
  }
  fragment.appendChild(header)
  if (rows.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'writer-toc__empty'
    empty.textContent = isHeadingsToc(source)
      ? 'No hay títulos. Usa los estilos Título 1, Título 2… y actualiza la tabla.'
      : `No hay títulos de «${source}». Inserta uno desde Referencias > Insertar título.`
    fragment.appendChild(empty)
  }
  for (const row of rows) {
    const entry = document.createElement('p')
    entry.className = `writer-toc__entry writer-toc__entry--${row.level}`
    entry.dataset.anchor = row.anchor
    entry.title = 'Ctrl/Cmd+clic para ir'
    const text = document.createElement('span')
    text.className = 'writer-toc__text'
    text.textContent = row.text
    const leader = document.createElement('span')
    leader.className = 'writer-toc__leader'
    const page = document.createElement('span')
    page.className = 'writer-toc__page'
    page.textContent = String(row.page)
    entry.append(text, leader, page)
    fragment.appendChild(entry)
  }
  return fragment
}
