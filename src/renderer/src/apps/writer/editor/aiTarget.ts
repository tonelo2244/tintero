import type { Editor, JSONContent } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { ResultPlacement, WritingAction } from '../model/ai/writingActions'
import { MAX_INPUT_CHARS, splitParagraphs } from '../model/ai/writingActions'
import { documentToPlainText } from '../model/ai/plainText'

/** El trozo de documento sobre el que trabaja el asistente, capturado al pulsar el botón. */
export interface AiTarget {
  from: number
  to: number
  text: string
  /** Documento en ese momento (inmutable): sirve para saber si el usuario lo cambió mientras tanto. */
  doc: ProseMirrorNode
  wholeDocument: boolean
}

export type CaptureResult = { ok: true; target: AiTarget } | { ok: false; message: string }

export function captureTarget(editor: Editor, action: WritingAction): CaptureResult {
  const { state } = editor
  const { from, to, empty } = state.selection
  let target: AiTarget
  if (!empty) {
    target = {
      from,
      to,
      text: state.doc.textBetween(from, to, '\n\n', ' ').trim(),
      doc: state.doc,
      wholeDocument: false
    }
  } else if (action.allowsWholeDocument) {
    const text = documentToPlainText(editor.getJSON())
    target = { from: 0, to: state.doc.content.size, text, doc: state.doc, wholeDocument: true }
  } else {
    return { ok: false, message: `Selecciona el texto que quieres ${verbFor(action)}.` }
  }
  if (!target.text) return { ok: false, message: 'No hay texto que procesar.' }
  if (target.text.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      message: `El texto es demasiado largo para el modelo local (${target.text.length.toLocaleString('es')} caracteres; máximo ${MAX_INPUT_CHARS.toLocaleString('es')}). Selecciona un fragmento.`
    }
  }
  return { ok: true, target }
}

function verbFor(action: WritingAction): string {
  return action.id === 'proofread' ? 'corregir' : 'reescribir'
}

/**
 * Aplica el resultado. Si el usuario editó el documento mientras el modelo escribía, las posiciones
 * guardadas pueden apuntar a otro sitio; solo seguimos si el texto original sigue exactamente ahí.
 * Devuelve false si no se pudo aplicar.
 */
export function applyResult(editor: Editor, target: AiTarget, result: string, placement: ResultPlacement): boolean {
  const { state } = editor
  const paragraphs = splitParagraphs(result)
  if (paragraphs.length === 0) return false

  if (state.doc !== target.doc) {
    const stillThere =
      target.to <= state.doc.content.size &&
      state.doc.textBetween(target.from, target.to, '\n\n', ' ').trim() === target.text
    if (!stillThere && !(target.wholeDocument && placement === 'insertBelow')) return false
  }

  const paragraphNodes: JSONContent[] = paragraphs.map((text) => ({
    type: 'paragraph',
    content: [{ type: 'text', text }]
  }))

  if (placement === 'replace') {
    // Dentro de un mismo párrafo, un resultado de un párrafo se inserta como texto: no parte la línea.
    const sameBlock = state.doc.resolve(target.from).sameParent(state.doc.resolve(target.to))
    const content = sameBlock && paragraphs.length === 1 ? { type: 'text', text: paragraphs[0] } : paragraphNodes
    return editor.chain().focus().insertContentAt({ from: target.from, to: target.to }, content).run()
  }

  // Debajo del bloque donde acaba la selección (o al final del documento si era el documento entero).
  const end = Math.min(target.to, state.doc.content.size)
  const $end = state.doc.resolve(end)
  const position = target.wholeDocument || $end.depth === 0 ? state.doc.content.size : $end.after(1)
  return editor.chain().focus().insertContentAt(position, paragraphNodes).run()
}
