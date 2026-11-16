import { Extension, type Editor } from '@tiptap/core'
import type { Mark } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state'

declare module '@tiptap/core' {
  interface Storage {
    formatPainter: FormatPainterStorage
  }
  interface Commands<ReturnType> {
    formatPainter: {
      /** Copia el formato de la selección. `sticky`: se queda activo hasta Esc (doble clic en el botón). */
      copyFormat: (sticky: boolean) => ReturnType
      cancelFormatPainter: () => ReturnType
    }
  }
}

/** Atributos de párrafo que viajan con "Copiar formato" (los de estructura, como el nivel de título, no). */
const PARAGRAPH_ATTRS = [
  'textAlign',
  'lineHeight',
  'indent',
  'firstLineIndent',
  'indentRight',
  'spaceBefore',
  'spaceAfter',
  'shading',
  'border',
  'blockStyle'
]

interface CopiedFormat {
  marks: readonly Mark[]
  /** Solo si se copió con el cursor (o el párrafo entero): entonces también va el formato de párrafo. */
  paragraph: Record<string, unknown> | null
}

export interface FormatPainterStorage {
  copied: CopiedFormat | null
  sticky: boolean
}

const painterKey = new PluginKey('formatPainter')

/**
 * Copiar formato (la "brocha"): guarda las marcas y, si procede, el formato del párrafo; el
 * siguiente clic o arrastre en el texto lo aplica. Un clic en el botón aplica una vez; doble clic
 * lo deja fijo hasta pulsar Esc o el botón otra vez.
 */
export const FormatPainter = Extension.create<object, FormatPainterStorage>({
  name: 'formatPainter',

  addStorage() {
    return { copied: null, sticky: false }
  },

  addCommands() {
    return {
      copyFormat:
        (sticky) =>
        ({ state, tr, dispatch }) => {
          const { $from, empty, from, to } = state.selection
          const marks = empty ? (state.storedMarks ?? $from.marks()) : state.doc.resolve(from + 1).marks()
          const block = $from.parent
          const wholeBlock = !empty && from <= $from.start() && to >= $from.end()
          const paragraph =
            empty || wholeBlock
              ? Object.fromEntries(
                  PARAGRAPH_ATTRS.filter((name) => name in block.attrs).map((name) => [name, block.attrs[name]])
                )
              : null
          this.storage.copied = { marks, paragraph }
          this.storage.sticky = sticky
          // Una transacción vacía para que la cinta y el cursor se enteren de que la brocha está activa.
          dispatch?.(tr.setMeta(painterKey, true))
          return true
        },
      cancelFormatPainter:
        () =>
        ({ tr, dispatch }) => {
          this.storage.copied = null
          this.storage.sticky = false
          dispatch?.(tr.setMeta(painterKey, false))
          return true
        }
    }
  },

  addKeyboardShortcuts() {
    return {
      Escape: () => (this.storage.copied ? this.editor.commands.cancelFormatPainter() : false)
    }
  },

  addProseMirrorPlugins() {
    const storage = this.storage
    const editor = this.editor
    return [
      new Plugin({
        key: painterKey,
        props: {
          attributes: (): Record<string, string> => (storage.copied ? { class: 'format-painter-active' } : {}),
          handleDOMEvents: {
            // Al soltar el ratón la selección ya es la definitiva (clic o arrastre).
            mouseup: () => {
              if (!storage.copied) return false
              setTimeout(() => applyCopiedFormat(editor), 0)
              return false
            }
          }
        }
      })
    ]
  }
})

/** Pone el formato copiado en la selección (o en la palabra del clic). Exportada para las pruebas. */
export function applyCopiedFormat(editor: Editor): void {
  const storage = editor.storage.formatPainter
  const copied = storage.copied
  if (!copied) return
  let chain = editor.chain().focus()
  const { empty } = editor.state.selection
  // Con un clic sin arrastrar, como en Word: la palabra donde se ha hecho clic.
  if (empty) chain = chain.command(({ tr, state }) => selectWordAt(tr, state.selection.from))
  chain = chain.unsetAllMarks()
  for (const mark of copied.marks) chain = chain.setMark(mark.type.name, mark.attrs)
  if (copied.paragraph) {
    const attrs = copied.paragraph
    chain = chain.updateAttributes('paragraph', attrs).updateAttributes('heading', attrs)
  }
  chain.run()
  if (!storage.sticky) editor.commands.cancelFormatPainter()
}

function selectWordAt(tr: Transaction, pos: number): boolean {
  const $pos = tr.doc.resolve(pos)
  // Un carácter por posición (los nodos sin texto, como imágenes o tabuladores, cuentan como uno).
  const text = $pos.parent.textBetween(0, $pos.parent.content.size, undefined, '\ufffc')
  const offset = $pos.parentOffset
  const isWord = (char: string | undefined) => !!char && /[\p{L}\p{N}_]/u.test(char)
  let start = offset
  let end = offset
  while (start > 0 && isWord(text[start - 1])) start--
  while (end < text.length && isWord(text[end])) end++
  if (start === end) return true
  const base = $pos.start()
  tr.setSelection(TextSelection.create(tr.doc, base + start, base + end))
  return true
}
