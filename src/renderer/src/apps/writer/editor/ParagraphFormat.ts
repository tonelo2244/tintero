import { Extension, type CommandProps } from '@tiptap/core'
import { BORDER_CSS, INDENT_STEP_CM, type ParagraphBorder, type TabStop } from '../model/paragraphFormat'

const MAX_INDENT = 8
/**
 * La sangría se guarda en "pasos" de 1,27 cm (los del botón Aumentar sangría). Desde la regla se
 * puede poner cualquier valor, así que un paso puede ser fraccionario: 0,5 pasos = 0,635 cm. Se
 * mantiene el atributo de siempre para que los archivos anteriores se sigan leyendo igual.
 */
export { INDENT_STEP_CM }
const BLOCK_TYPES = ['paragraph', 'heading']

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphFormat: {
      indent: () => ReturnType
      outdent: () => ReturnType
      setLineHeight: (lineHeight: string | null) => ReturnType
      /** Estilo de párrafo que no es un título (null = Normal). */
      setBlockStyle: (blockStyle: string | null) => ReturnType
      /** Espacio antes y después del párrafo, en puntos (null = el del estilo). */
      setSpacing: (spacing: { before?: number | null; after?: number | null }) => ReturnType
      setIndentRight: (cm: number | null) => ReturnType
      setShading: (color: string | null) => ReturnType
      setParagraphBorder: (border: ParagraphBorder | 'none' | null) => ReturnType
      setTabStops: (stops: TabStop[] | null) => ReturnType
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
          },
          // Solo se leen valores en pt: la paginación pone margin-top en px como decoración, y al
          // copiar y pegar un párrafo no debe convertirse en "espacio antes".
          spaceBefore: {
            default: null,
            parseHTML: (element) => parseUnit(element.style.marginTop, 'pt'),
            renderHTML: (attributes) =>
              attributes.spaceBefore !== null ? { style: `margin-top: ${attributes.spaceBefore}pt` } : {}
          },
          spaceAfter: {
            default: null,
            parseHTML: (element) => parseUnit(element.style.marginBottom, 'pt'),
            renderHTML: (attributes) =>
              attributes.spaceAfter !== null ? { style: `margin-bottom: ${attributes.spaceAfter}pt` } : {}
          },
          indentRight: {
            default: null,
            parseHTML: (element) => parseUnit(element.style.marginRight, 'cm'),
            renderHTML: (attributes) =>
              attributes.indentRight ? { style: `margin-right: ${attributes.indentRight}cm` } : {}
          },
          shading: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-shading'),
            renderHTML: (attributes) =>
              attributes.shading
                ? { 'data-shading': attributes.shading, style: `background-color: ${attributes.shading}` }
                : {}
          },
          border: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-border'),
            renderHTML: (attributes) => {
              const css = BORDER_CSS[attributes.border as ParagraphBorder]
              return css ? { 'data-border': attributes.border, style: css } : {}
            }
          },
          tabStops: {
            default: null,
            parseHTML: (element) => parseTabStops(element.getAttribute('data-tab-stops')),
            renderHTML: (attributes) =>
              attributes.tabStops?.length ? { 'data-tab-stops': JSON.stringify(attributes.tabStops) } : {}
          }
        }
      },
      {
        types: ['bulletList'],
        attributes: {
          bulletStyle: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-bullet'),
            renderHTML: (attributes) => (attributes.bulletStyle ? { 'data-bullet': attributes.bulletStyle } : {})
          }
        }
      },
      {
        types: ['orderedList'],
        attributes: {
          numberFormat: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-number-format'),
            renderHTML: (attributes) =>
              attributes.numberFormat ? { 'data-number-format': attributes.numberFormat } : {}
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

    const setBlockAttrs =
      (attrs: Record<string, unknown>) =>
      ({ commands }: CommandProps) => {
        const paragraphs = commands.updateAttributes('paragraph', attrs)
        const headings = commands.updateAttributes('heading', attrs)
        return paragraphs || headings
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
      setSpacing:
        (spacing) =>
        ({ commands }) => {
          const attrs: Record<string, number | null> = {}
          if (spacing.before !== undefined) attrs.spaceBefore = spacing.before
          if (spacing.after !== undefined) attrs.spaceAfter = spacing.after
          const paragraphs = commands.updateAttributes('paragraph', attrs)
          const headings = commands.updateAttributes('heading', attrs)
          return paragraphs || headings
        },
      setIndentRight: (cm) => setBlockAttrs({ indentRight: cm && cm > 0 ? Math.round(cm * 100) / 100 : null }),
      setShading: (color) => setBlockAttrs({ shading: color }),
      setParagraphBorder: (border) => setBlockAttrs({ border: border === 'none' ? null : border }),
      setTabStops: (stops) => setBlockAttrs({ tabStops: stops && stops.length > 0 ? stops : null }),
      setBlockStyle:
        (blockStyle) =>
        ({ chain, editor }) => {
          // En una cadena: con `commands` sueltos, updateAttributes no ve el párrafo recién creado
          // a partir de un título y no hace nada.
          const steps = chain()
          if (!editor.isActive('paragraph')) steps.setParagraph()
          return steps.updateAttributes('paragraph', { blockStyle }).run()
        }
    }
  },

  addKeyboardShortcuts() {
    return {
      // Dentro de una tabla, Tab salta de celda (lo gestiona la extensión de tablas), como en Word.
      Tab: () => {
        if (this.editor.isActive('table')) return false
        // Como en Word: al principio del párrafo (o en una lista) sangra; en medio del texto, tabulador.
        const { $from, empty } = this.editor.state.selection
        const atStart = empty && $from.parentOffset === 0
        if (atStart || this.editor.isActive('listItem') || this.editor.isActive('codeBlock')) {
          return this.editor.commands.indent()
        }
        return this.editor.commands.insertTab()
      },
      'Shift-Tab': () => !this.editor.isActive('table') && this.editor.commands.outdent()
    }
  }
})

/** "1.5cm" -> 1.5. Otras unidades no las escribe el editor; se ignoran. */
function parseCm(value: string): number | null {
  return parseUnit(value, 'cm') || null
}

/** "12pt" -> 12 si la unidad es la pedida; si no, null. */
function parseUnit(value: string, unit: 'pt' | 'cm'): number | null {
  const match = new RegExp(`^(-?[\\d.]+)${unit}$`).exec(value.trim())
  return match ? Number(match[1]) : null
}

function parseTabStops(raw: string | null): TabStop[] | null {
  if (!raw) return null
  try {
    const stops = JSON.parse(raw) as TabStop[]
    return Array.isArray(stops) && stops.length > 0 ? stops : null
  } catch {
    return null
  }
}
