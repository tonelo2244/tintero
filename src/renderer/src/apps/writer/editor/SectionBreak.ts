import { mergeAttributes, Node } from '@tiptap/core'
import { normalizePageSetup, type PageSetup } from '../model/pageSetup'
import { SECTION_BREAK } from '../model/sections'
import { insertBreak } from './PageBreak'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sectionBreak: {
      /** Inserta un salto de sección (página siguiente); lo que va detrás usa `pageSetup`. */
      setSectionBreak: (pageSetup: PageSetup) => ReturnType
      /** Cambia la hoja de la sección que abre el salto que está en `pos`. */
      setSectionPageSetup: (pos: number, pageSetup: PageSetup) => ReturnType
    }
  }
}

/**
 * Salto de sección (de "página siguiente"): como el salto de página, un bloque vacío que no ocupa
 * sitio, pero además guarda la hoja (tamaño, orientación, márgenes) de la sección que empieza
 * detrás. Ver model/sections.ts. En el HTML, `<hr data-section-break data-page-setup="{…}">`.
 */
export const SectionBreak = Node.create({
  name: SECTION_BREAK,
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      pageSetup: {
        default: null,
        parseHTML: (element) => {
          try {
            return normalizePageSetup(JSON.parse(element.getAttribute('data-page-setup') ?? 'null'))
          } catch {
            return null
          }
        },
        renderHTML: (attributes) =>
          attributes.pageSetup ? { 'data-page-setup': JSON.stringify(attributes.pageSetup) } : {}
      }
    }
  },

  parseHTML() {
    // Antes que la línea horizontal (50) y el salto de página (60): los tres son <hr>.
    return [{ tag: 'hr[data-section-break]', priority: 70 }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['hr', mergeAttributes(HTMLAttributes, { 'data-section-break': '', class: 'writer-section-break' })]
  },

  addCommands() {
    return {
      setSectionBreak:
        (pageSetup) =>
        ({ chain, state }) =>
          insertBreak(chain, state, { type: this.name, attrs: { pageSetup } }),
      setSectionPageSetup:
        (pos, pageSetup) =>
        ({ tr, dispatch }) => {
          const node = tr.doc.nodeAt(pos)
          if (node?.type.name !== this.name) return false
          if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, pageSetup })
          return true
        }
    }
  }
})
