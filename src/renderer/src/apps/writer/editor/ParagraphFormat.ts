import { Extension, type CommandProps } from '@tiptap/core'
import type { BlockStyle } from '../model/paragraphStyles'

const MAX_INDENT = 8
const INDENT_STEP_CM = 1.27
const BLOCK_TYPES = ['paragraph', 'heading']

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphFormat: {
      indent: () => ReturnType
      outdent: () => ReturnType
      setLineHeight: (lineHeight: string | null) => ReturnType
      setBlockStyle: (blockStyle: BlockStyle | null) => ReturnType
    }
  }
}

/**
 * Extensión propia: sangría, interlineado y estilo de bloque (Título, Subtítulo...)
 * como atributos de párrafo. Tiptap no trae sangría de párrafo de serie.
 */
export const ParagraphFormat = Extension.create({
  name: 'paragraphFormat',

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => Number(element.getAttribute('data-indent')) || 0,
            renderHTML: (attributes) =>
              attributes.indent
                ? { 'data-indent': attributes.indent, style: `margin-left: ${attributes.indent * INDENT_STEP_CM}cm` }
                : {}
          },
          lineHeight: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) =>
              attributes.lineHeight ? { style: `line-height: ${attributes.lineHeight}` } : {}
          }
        }
      },
      {
        types: ['paragraph'],
        attributes: {
          blockStyle: {
            default: null,
            // Como en las suites clásicas: tras un Título, Enter vuelve a "Normal".
            keepOnSplit: false,
            parseHTML: (element) => element.getAttribute('data-style'),
            renderHTML: (attributes) => (attributes.blockStyle ? { 'data-style': attributes.blockStyle } : {})
          }
        }
      }
    ]
  },

  addCommands() {
    const changeIndent =
      (delta: 1 | -1) =>
      ({ state, tr, commands }: CommandProps) => {
        // Dentro de una lista, "sangría" significa anidar/desanidar el elemento.
        if (this.editor.isActive('listItem')) {
          return delta > 0 ? commands.sinkListItem('listItem') : commands.liftListItem('listItem')
        }
        const { from, to } = state.selection
        let changed = false
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (!BLOCK_TYPES.includes(node.type.name)) return true
          const indent = Math.min(MAX_INDENT, Math.max(0, (node.attrs.indent ?? 0) + delta))
          if (indent !== node.attrs.indent) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent })
            changed = true
          }
          return false
        })
        return changed
      }

    return {
      indent: () => changeIndent(1),
      outdent: () => changeIndent(-1),
      setLineHeight:
        (lineHeight) =>
        ({ commands }) => {
          const paragraphs = commands.updateAttributes('paragraph', { lineHeight })
          const headings = commands.updateAttributes('heading', { lineHeight })
          return paragraphs || headings
        },
      setBlockStyle:
        (blockStyle) =>
        ({ commands, editor }) => {
          // setParagraph devuelve false si ya es un párrafo, por eso no lo encadenamos con &&.
          if (!editor.isActive('paragraph')) commands.setParagraph()
          return commands.updateAttributes('paragraph', { blockStyle })
        }
    }
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.indent(),
      'Shift-Tab': () => this.editor.commands.outdent()
    }
  }
})
