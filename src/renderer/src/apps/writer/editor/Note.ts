import { Node } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { createId } from '@/core/ids'
import { isNoteKind, NOTE, NOTE_KIND_LABELS, noteMark, type NoteKind } from '../model/notes'
import { documentIndex, registerPainter } from './references'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    note: {
      /** Inserta una nota en el cursor y abre su cuadro para escribirla. */
      insertNote: (kind: NoteKind) => ReturnType
      /** Cambia el texto o el tipo de la nota con ese id. */
      updateNote: (id: string, changes: { text?: string; kind?: NoteKind }) => ReturnType
      /** Quita la nota (su número en el texto y su texto). */
      deleteNote: (id: string) => ReturnType
      /** Pasa todas las notas de un tipo al otro ("Convertir notas" de Word). */
      convertNotes: (from: NoteKind) => ReturnType
      /** Lleva el cursor a la nota siguiente o anterior de ese tipo. */
      goToNote: (kind: NoteKind, direction: 1 | -1) => ReturnType
    }
  }
}

/**
 * Referencia de una nota al pie o al final (fase 17): un átomo en línea con su id, su tipo y su
 * texto. El número que se ve se calcula (ver model/notes.ts). El texto de la nota se escribe en su
 * cuadro (doble clic sobre el número o sobre la nota al pie de la hoja); es texto sin formato,
 * como el encabezado y el pie de Tintero.
 */
export const Note = Node.create({
  name: NOTE,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-note-id') || createId('nota'),
        renderHTML: (attrs) => ({ 'data-note-id': attrs.id })
      },
      kind: {
        default: 'footnote',
        parseHTML: (element) => {
          const kind = element.getAttribute('data-note')
          return isNoteKind(kind) ? kind : 'footnote'
        },
        renderHTML: (attrs) => ({ 'data-note': attrs.kind })
      },
      text: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-note-text') ?? element.getAttribute('title') ?? '',
        renderHTML: (attrs) => ({ 'data-note-text': attrs.text })
      }
    }
  },

  parseHTML() {
    // Por delante del superíndice (una marca), que si no se queda con el <sup> vacío.
    return [{ tag: 'sup[data-note]', priority: 100 }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['sup', { ...HTMLAttributes, class: 'writer-note-ref' }]
  },

  renderText: () => '',

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('sup')
      dom.className = 'writer-note-ref'
      dom.contentEditable = 'false'
      let current = node
      const paint = () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (pos === undefined) return
        const number = documentIndex(editor.state.doc).noteNumbers.get(String(current.attrs.id)) ?? 1
        const mark = noteMark(current.attrs.kind as NoteKind, number)
        if (dom.textContent !== mark) dom.textContent = mark
        dom.dataset.note = current.attrs.kind
        dom.title = `${NOTE_KIND_LABELS[current.attrs.kind as NoteKind]} ${mark}: ${current.attrs.text || '(vacía)'}`
      }
      paint()
      const unregister = registerPainter(paint)
      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== NOTE) return false
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
      insertNote:
        (kind) =>
        ({ tr, state, dispatch, editor }) => {
          const id = createId('nota')
          if (dispatch) {
            tr.replaceSelectionWith(state.schema.nodes[NOTE].create({ id, kind, text: '' }), true)
            // El cuadro se abre cuando la nota ya está en el documento (después de despachar).
            queueMicrotask(() => editor.storage.references.openNote?.(id))
          }
          return true
        },
      updateNote:
        (id, changes) =>
        ({ tr, state, dispatch }) => {
          const pos = findNote(state.doc, id)
          if (pos === null) return false
          if (dispatch) {
            const node = state.doc.nodeAt(pos)!
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...changes })
          }
          return true
        },
      deleteNote:
        (id) =>
        ({ tr, state, dispatch }) => {
          const pos = findNote(state.doc, id)
          if (pos === null) return false
          if (dispatch) tr.delete(pos, pos + 1)
          return true
        },
      convertNotes:
        (from) =>
        ({ tr, state, dispatch }) => {
          const to: NoteKind = from === 'footnote' ? 'endnote' : 'footnote'
          let changed = false
          state.doc.descendants((node, pos) => {
            if (node.type.name === NOTE && node.attrs.kind === from) {
              changed = true
              if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, kind: to })
            }
          })
          return changed
        },
      goToNote:
        (kind, direction) =>
        ({ tr, state, dispatch, view }) => {
          const notes = documentIndex(state.doc).notes.filter((note) => note.kind === kind)
          const { from } = state.selection
          const target =
            direction === 1
              ? notes.find((note) => note.pos > from)
              : [...notes].reverse().find((note) => note.pos < from - 1)
          if (!target) return false
          if (dispatch) {
            tr.setSelection(TextSelection.create(tr.doc, target.pos + 1)).scrollIntoView()
            view.focus()
          }
          return true
        }
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey('noteDoubleClick'),
        // Pegar una nota copiada deja dos con el mismo id: la segunda recibe uno nuevo.
        appendTransaction: (transactions, _old, state) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null
          const seen = new Set<string>()
          let tr: import('@tiptap/pm/state').Transaction | null = null
          state.doc.descendants((node, pos) => {
            if (node.type.name !== NOTE) return true
            const id = String(node.attrs.id)
            if (id && !seen.has(id)) seen.add(id)
            else (tr ??= state.tr).setNodeMarkup(pos, undefined, { ...node.attrs, id: createId('nota') })
            return false
          })
          return tr
        },
        props: {
          handleDoubleClickOn: (_view, _pos, node) => {
            const open = editor.storage.references.openNote
            if (node.type.name !== NOTE || !open) return false
            open(String(node.attrs.id))
            return true
          }
        }
      })
    ]
  }
})

export function findNote(doc: import('@tiptap/pm/model').Node, id: string): number | null {
  let found: number | null = null
  doc.descendants((node, pos) => {
    if (found !== null) return false
    if (node.type.name === NOTE && node.attrs.id === id) found = pos
    return true
  })
  return found
}
