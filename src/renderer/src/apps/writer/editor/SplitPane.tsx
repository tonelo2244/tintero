import { useEffect, useRef, type CSSProperties } from 'react'
import type { Editor } from '@tiptap/react'
import { baseKeymap, toggleMark } from '@tiptap/pm/commands'
import { keymap } from '@tiptap/pm/keymap'
import { EditorState, Selection, type Transaction } from '@tiptap/pm/state'
import { EditorView } from '@tiptap/pm/view'
import { X } from 'lucide-react'

/** Meta que marca las transacciones que vienen de la segunda vista (para no devolvérselas). */
const FROM_SPLIT = 'writerSplitPane'

/**
 * Vista > Dividir: una segunda vista del MISMO documento, para ver el principio mientras escribes
 * el final. No es un segundo documento: es otra `EditorView` de ProseMirror conectada a la principal.
 *
 * Por qué no comparten un único `EditorState`: los plugins de Tiptap (atajos, paginación, reglas de
 * entrada) guardan una referencia al editor principal y a su vista; en una segunda vista medirían
 * el DOM equivocado o editarían en el sitio del otro cursor. Así que cada vista tiene su estado y
 * su cursor, y se sincronizan con los pasos (`Step`) de cada transacción, como hace la edición
 * colaborativa:
 *   - lo que se escribe aquí no se aplica aquí: sus pasos se mandan al editor principal (que lleva
 *     el historial, así Deshacer funciona igual en las dos);
 *   - cada cambio del principal se repite aquí con los mismos pasos, y el cursor de aquí se recoloca.
 * Esta vista no pagina: enseña el texto seguido, como Borrador. El formato se aplica desde la cinta,
 * que actúa sobre la vista principal; aquí funcionan escribir, borrar, copiar, pegar y negrita,
 * cursiva y subrayado con su atajo.
 */
interface SplitPaneProps {
  editor: Editor
  /** Medidas de la hoja (ancho y márgenes), las mismas variables CSS que la vista principal. */
  sheetStyle: CSSProperties
  onClose(): void
}

export function SplitPane({ editor, sheetStyle, onClose }: SplitPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const { schema } = editor
    const marks = schema.marks
    const view: EditorView = new EditorView(host, {
      state: EditorState.create({
        doc: editor.state.doc,
        plugins: [
          keymap({
            'Mod-z': () => editor.commands.undo(),
            'Mod-y': () => editor.commands.redo(),
            'Shift-Mod-z': () => editor.commands.redo(),
            ...(marks.bold && { 'Mod-b': toggleMark(marks.bold) }),
            ...(marks.italic && { 'Mod-i': toggleMark(marks.italic) }),
            ...(marks.underline && { 'Mod-u': toggleMark(marks.underline) })
          }),
          keymap(baseKeymap)
        ]
      }),
      attributes: { class: 'writer-content', spellcheck: 'true', lang: 'es' },
      dispatchTransaction: (tr: Transaction) => {
        if (!tr.docChanged) {
          view.updateState(view.state.apply(tr))
          return
        }
        // El cambio va al editor principal; volverá por 'transaction' con la selección de aquí.
        const forwarded = editor.state.tr
        tr.steps.forEach((step) => forwarded.step(step))
        forwarded.setMeta(FROM_SPLIT, tr.selection.toJSON())
        editor.view.dispatch(forwarded)
      }
    })

    const onTransaction = ({
      transaction,
      appendedTransactions
    }: {
      transaction: Transaction
      appendedTransactions: Transaction[]
    }) => {
      const all = [transaction, ...appendedTransactions]
      if (!all.some((tr) => tr.docChanged)) return
      let tr = view.state.tr
      try {
        all.forEach((applied) => applied.steps.forEach((step) => tr.step(step)))
      } catch {
        tr = view.state.tr
      }
      if (!tr.doc.eq(editor.state.doc)) {
        // No debería pasar; si los documentos se separan, se copia el del principal y listo.
        tr = view.state.tr.replaceWith(0, view.state.doc.content.size, editor.state.doc.content)
      }
      const fromHere = transaction.getMeta(FROM_SPLIT)
      if (fromHere) {
        try {
          tr.setSelection(Selection.fromJSON(tr.doc, fromHere))
        } catch {
          // Si la selección ya no cabe en el documento, nos quedamos con la recolocada.
        }
      }
      view.updateState(view.state.apply(tr))
    }
    editor.on('transaction', onTransaction)
    return () => {
      editor.off('transaction', onTransaction)
      view.destroy()
    }
  }, [editor])

  return (
    <section className="writer-split" aria-label="Segunda vista del documento">
      <header className="writer-split__bar">
        <span>Segunda vista del mismo documento</span>
        <button
          type="button"
          className="writer-comments__icon"
          title="Quitar división"
          aria-label="Quitar división"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </header>
      <div className="writer-split__scroll">
        <div className="writer-page writer-split__page" style={sheetStyle} ref={hostRef} />
      </div>
    </section>
  )
}
