import { Extension, type CommandProps } from '@tiptap/core'
import type { BlockStyle } from '../model/paragraphStyles'

const MAX_INDENT = 8
/**
 * La sangría se guarda en "pasos" de 1,27 cm (los del botón Aumentar sangría). Desde la regla se
 * puede poner cualquier valor, así que un paso puede ser fraccionario: 0,5 pasos = 0,635 cm. Se
 * mantiene el atributo de siempre para que los archivos anteriores se sigan leyendo igual.
 */
export const INDENT_STEP_CM = 1.27
const BLOCK_TYPES = ['paragraph', 'heading']

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphFormat: {
      indent: () => ReturnType
      outdent: () => ReturnType
      setLineHeight: (lineHeight: string | null) => ReturnType
      setBlockStyle: (blockStyle: BlockStyle | null) => ReturnType
      /** Sangría izquierda exacta en centímetros (la regla); se guarda en pasos de 1,27 cm. */
      setIndentCm: (cm: number) => ReturnType
      /** Sangría de primera línea en centímetros; negativa es sangría francesa. */
      setFirstLineIndent: (cm: number | null) => ReturnType
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
                ? {
                    'data-indent': attributes.indent,
                    // Al centésimo de cm: un paso fraccionario (0,787) no debe pintar 0,99949 cm.
                    style: `margin-left: ${Math.round(attributes.indent * INDENT_STEP_CM * 100) / 100}cm`
                  }
                : {}
          },
          firstLineIndent: {
            default: null,
            parseHTML: (element) => parseCm(element.style.textIndent),
            renderHTML: (attributes) =>
              attributes.firstLineIndent ? { style: `text-indent: ${attributes.firstLineIndent}cm` } : {}
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
          // Desde una sangría fraccionaria (puesta con la regla), el botón salta al paso entero siguiente.
          const current = node.attrs.indent ?? 0
          const stepped = delta > 0 ? Math.floor(current + 1e-6) + 1 : Math.ceil(current - 1e-6) - 1
          const indent = Math.min(MAX_INDENT, Math.max(0, stepped))
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
      setIndentCm:
        (cm) =>
        ({ commands }) => {
          const indent =
            Math.round((Math.min(MAX_INDENT * INDENT_STEP_CM, Math.max(0, cm)) / INDENT_STEP_CM) * 1000) / 1000
          const paragraphs = commands.updateAttributes('paragraph', { indent })
          const headings = commands.updateAttributes('heading', { indent })
          return paragraphs || headings
        },
      setFirstLineIndent:
        (cm) =>
        ({ commands }) => {
          const firstLineIndent = cm === null || Math.abs(cm) < 0.005 ? null : Math.round(cm * 100) / 100
          const paragraphs = commands.updateAttributes('paragraph', { firstLineIndent })
          const headings = commands.updateAttributes('heading', { firstLineIndent })
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
      // Dentro de una tabla, Tab salta de celda (lo gestiona la extensión de tablas), como en Word.
      Tab: () => !this.editor.isActive('table') && this.editor.commands.indent(),
      'Shift-Tab': () => !this.editor.isActive('table') && this.editor.commands.outdent()
    }
  }
})

/** "1.5cm" -> 1.5. Otras unidades no las escribe el editor; se ignoran. */
function parseCm(value: string): number | null {
  const match = /^(-?[\d.]+)cm$/.exec(value.trim())
  return match ? Number(match[1]) || null : null
}
