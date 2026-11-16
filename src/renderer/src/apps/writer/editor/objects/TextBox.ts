import { mergeAttributes, Node } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { objectView } from './ObjectView'
import { placementAttributes, sizeAttributes } from './placement'

/**
 * Cuadro de texto (fase 16): un bloque con sus propios párrafos, que se coloca como cualquier otro
 * objeto (cuadrado, arriba y abajo, detrás o delante del texto). El alto lo pone su contenido; el
 * ancho se arrastra o se escribe.
 */
export const TextBox = Node.create({
  name: 'textBox',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      ...sizeAttributes(),
      border: {
        default: '#444444',
        parseHTML: (element) => element.getAttribute('data-border'),
        renderHTML: (attrs) => (attrs.border ? { 'data-border': attrs.border } : {})
      },
      fill: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-fill'),
        renderHTML: (attrs) => (attrs.fill ? { 'data-fill': attrs.fill } : {})
      },
      ...placementAttributes()
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-text-box]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-text-box': '', class: 'writer-text-box' }), 0]
  },

  addProseMirrorPlugins() {
    // Con el cursor dentro, el cuadro enseña su marco y sus asas (no se selecciona como un objeto:
    // un clic dentro es para escribir).
    return [
      new Plugin({
        key: new PluginKey('textBoxEditing'),
        props: {
          decorations: ({ doc, selection }) => {
            const { $from } = selection
            for (let depth = $from.depth; depth > 0; depth--) {
              if ($from.node(depth).type.name !== this.name) continue
              const pos = $from.before(depth)
              return DecorationSet.create(doc, [
                Decoration.node(pos, pos + $from.node(depth).nodeSize, { class: 'is-editing' })
              ])
            }
            return null
          }
        }
      })
    ]
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const view = objectView({
        editor,
        node,
        getPos,
        keepRatio: false,
        widthOnly: true,
        naturalSize: (_node, body) => ({ width: body.offsetWidth || 240, height: body.offsetHeight || 60 })
      })
      const paintBox = (current: typeof node) => {
        const body = view.dom.firstElementChild as HTMLElement
        body.style.border = current.attrs.border ? `1px solid ${current.attrs.border}` : '1px dashed transparent'
        body.style.background = current.attrs.fill ?? ''
      }
      paintBox(node)
      const update = view.update!.bind(view)
      return {
        ...view,
        update: (updated, decorations, innerDecorations) => {
          if (!update(updated, decorations, innerDecorations)) return false
          paintBox(updated)
          return true
        }
      }
    }
  }
})
