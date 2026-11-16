import { mergeAttributes, Node } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { EQUATION } from '../model/equation'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    equation: {
      /** Inserta una ecuación en el cursor o, si hay una seleccionada, le cambia el LaTeX. */
      setEquation: (latex: string) => ReturnType
    }
  }
  interface Storage {
    equation: EquationStorage
  }
}

interface EquationStorage {
  /** Lo pone el editor: abre el cuadro de la ecuación (doble clic sobre una). */
  openEditor: (() => void) | null
}

/**
 * Ecuación (fase 16): un átomo en línea con su LaTeX, pintado con KaTeX. Si el LaTeX tiene un
 * error, KaTeX lo pinta en rojo en vez de fallar: se ve dónde está y el documento sigue entero.
 */
export const Equation = Node.create<object, EquationStorage>({
  name: EQUATION,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addStorage() {
    return { openEditor: null }
  },

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-latex') ?? '',
        renderHTML: (attrs) => ({ 'data-latex': attrs.latex })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-latex]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'writer-equation' })]
  },

  renderText({ node }) {
    return node.attrs.latex
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span')
      dom.className = 'writer-equation'
      dom.contentEditable = 'false'
      let latex = ''
      const paint = (next: string) => {
        if (next === latex) return
        latex = next
        dom.setAttribute('data-latex', latex)
        dom.title = 'Ecuación (doble clic para editarla)'
        katex.render(latex || '\\square', dom, { throwOnError: false, displayMode: false, output: 'htmlAndMathml' })
      }
      paint(node.attrs.latex)
      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== EQUATION) return false
          paint(updated.attrs.latex)
          return true
        },
        ignoreMutation: () => true
      }
    }
  },

  addCommands() {
    return {
      setEquation:
        (latex) =>
        ({ state, tr, dispatch }) => {
          const type = state.schema.nodes[EQUATION]
          const { selection } = state
          const selected = 'node' in selection && (selection.node as { type: unknown }).type === type
          if (dispatch) {
            if (selected) tr.setNodeMarkup(selection.from, undefined, { latex })
            else tr.replaceSelectionWith(type.create({ latex }), false)
          }
          return true
        }
    }
  },

  addProseMirrorPlugins() {
    const storage = this.storage
    return [
      new Plugin({
        key: new PluginKey('equationDoubleClick'),
        props: {
          handleDoubleClickOn: (_view, _pos, node) => {
            if (node.type.name !== EQUATION || !storage.openEditor) return false
            storage.openEditor()
            return true
          }
        }
      })
    ]
  }
})
