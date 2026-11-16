import { useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import katex from 'katex'
import { Sigma } from 'lucide-react'
import {
  DEFAULT_EQUATION,
  EQUATION,
  EQUATION_SNIPPETS,
  insertSnippet,
  normalizeLatex,
  SAMPLE_EQUATIONS
} from '../model/equation'
import { WriterDialog } from './WriterDialog'

/** La ecuación seleccionada, si la hay (el cuadro la edita en vez de insertar otra). */
function selectedEquation(editor: Editor): string | null {
  const { selection } = editor.state
  return selection instanceof NodeSelection && selection.node.type.name === EQUATION
    ? String(selection.node.attrs.latex ?? '')
    : null
}

/**
 * Ecuación (fase 16): se escribe en LaTeX con vista previa al momento, plantillas para lo
 * habitual (fracción, raíz, sumatorio...) y las ecuaciones de ejemplo de Word.
 */
export function EquationDialog({ editor, onClose }: { editor: Editor; onClose(): void }) {
  const [editing] = useState(() => selectedEquation(editor))
  const [latex, setLatex] = useState(editing ?? DEFAULT_EQUATION)
  const input = useRef<HTMLTextAreaElement>(null)

  // KaTeX no ejecuta nada (sin `trust`, \href y compañía no se pintan): su HTML es seguro de poner tal cual.
  const preview = useMemo(
    () => katex.renderToString(normalizeLatex(latex) || '\\square', { throwOnError: false, displayMode: true }),
    [latex]
  )

  const addSnippet = (snippet: string) => {
    const field = input.current
    if (!field) return
    const next = insertSnippet(latex, field.selectionStart, field.selectionEnd, snippet)
    setLatex(next.text)
    requestAnimationFrame(() => {
      field.focus()
      field.setSelectionRange(next.cursor, next.cursor)
    })
  }

  const accept = () => {
    const clean = normalizeLatex(latex)
    if (clean) editor.chain().focus().setEquation(clean).run()
    else if (editing !== null) editor.chain().focus().deleteSelection().run()
    onClose()
  }

  return (
    <WriterDialog
      title={editing === null ? 'Insertar ecuación' : 'Editar ecuación'}
      icon={<Sigma size={16} />}
      className="writer-equation-dialog"
      onClose={onClose}
      onSubmit={accept}
      actions={
        <>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="is-primary">
            {editing === null ? 'Insertar' : 'Aceptar'}
          </button>
        </>
      }
    >
      <label className="writer-page-setup__field">
        <span>Ecuación en LaTeX</span>
        <textarea
          ref={input}
          autoFocus
          rows={3}
          spellCheck={false}
          className="writer-dialog__textarea writer-equation-dialog__input"
          value={latex}
          onChange={(event) => setLatex(event.target.value)}
        />
      </label>
      <div className="writer-equation-dialog__snippets" role="group" aria-label="Plantillas">
        {EQUATION_SNIPPETS.map((snippet) => (
          <button key={snippet.label} type="button" title={snippet.latex} onClick={() => addSnippet(snippet.latex)}>
            {snippet.label}
          </button>
        ))}
      </div>
      <div
        className="writer-equation-dialog__preview"
        aria-label="Vista previa"
        dangerouslySetInnerHTML={{ __html: preview }}
      />
      <label className="writer-page-setup__field">
        <span>Ejemplos</span>
        <select value="" onChange={(event) => event.target.value && setLatex(event.target.value)}>
          <option value="">Elegir una ecuación de ejemplo…</option>
          {SAMPLE_EQUATIONS.map((sample) => (
            <option key={sample.label} value={sample.latex}>
              {sample.label}
            </option>
          ))}
        </select>
      </label>
    </WriterDialog>
  )
}
