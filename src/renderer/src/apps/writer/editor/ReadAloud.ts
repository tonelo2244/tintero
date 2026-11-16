import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { splitSentences, type Sentence } from '../model/readAloud'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    readAloud: {
      /** Resalta la frase que se está leyendo (`null` quita el resaltado). */
      setReadAloudRange: (range: { from: number; to: number } | null) => ReturnType
    }
  }
}

/** Una frase con su sitio en el documento, para resaltarla mientras se lee. */
export interface DocumentSentence extends Sentence {
  from: number
  to: number
}

/**
 * Frases del documento desde la posición `from` (la del cursor) hasta `to`. Se trocea cada párrafo
 * por separado (una frase nunca cruza dos párrafos) y cada carácter recuerda su posición en el
 * documento, así el resaltado cae justo encima aunque haya negritas, enlaces o tabuladores.
 */
export function documentSentences(doc: ProseMirrorNode, from = 0, to = doc.content.size): DocumentSentence[] {
  const sentences: DocumentSentence[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true
    let text = ''
    const positions: number[] = []
    node.forEach((child, offset) => {
      const start = pos + 1 + offset
      if (child.isText) {
        for (let index = 0; index < child.text!.length; index++) positions.push(start + index)
        text += child.text
      } else {
        // Tabulador, salto de línea o imagen: un espacio para la voz, ocupa su sitio en el documento.
        positions.push(start)
        text += ' '
      }
    })
    for (const sentence of splitSentences(text)) {
      const sentenceFrom = positions[sentence.start]
      const sentenceTo = positions[sentence.end - 1] + 1
      if (sentenceTo <= from || sentenceFrom >= to) continue
      sentences.push({ ...sentence, from: sentenceFrom, to: sentenceTo })
    }
    return false
  })
  return sentences
}

const readAloudKey = new PluginKey<DecorationSet>('readAloud')

/** El resaltado de la frase que se lee: una decoración, no una marca (no se guarda ni se deshace). */
export const ReadAloudHighlight = Extension.create({
  name: 'readAloud',

  addCommands() {
    return {
      setReadAloudRange:
        (range) =>
        ({ state, dispatch }) => {
          if (dispatch) {
            const decorations = range
              ? DecorationSet.create(state.doc, [
                  Decoration.inline(range.from, range.to, { class: 'writer-read-aloud' })
                ])
              : DecorationSet.empty
            dispatch(state.tr.setMeta(readAloudKey, decorations).setMeta('addToHistory', false))
          }
          return true
        }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: readAloudKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, decorations) => tr.getMeta(readAloudKey) ?? decorations.map(tr.mapping, tr.doc)
        },
        props: { decorations: (state) => readAloudKey.getState(state) }
      })
    ]
  }
})
