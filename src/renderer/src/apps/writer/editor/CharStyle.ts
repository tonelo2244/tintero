import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    charStyle: {
      /** Aplica un estilo de carácter a la selección, o lo quita si ya lo tiene. */
      toggleCharStyle: (styleId: string) => ReturnType
    }
  }
}

/**
 * Estilo de carácter (Énfasis, Texto destacado o uno propio): una marca que solo dice el id del
 * estilo. Su aspecto lo pone el CSS generado de model/styles.ts, así cambiar el estilo cambia
 * todos los textos que lo usan.
 */
export const CharStyle = Mark.create({
  name: 'charStyle',

  addAttributes() {
    return {
      styleId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-char-style'),
        renderHTML: (attributes) => (attributes.styleId ? { 'data-char-style': attributes.styleId } : {})
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-char-style]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },

  addCommands() {
    return {
      toggleCharStyle:
        (styleId) =>
        ({ commands, editor }) =>
          editor.isActive(this.name, { styleId })
            ? commands.unsetMark(this.name)
            : commands.setMark(this.name, { styleId })
    }
  }
})
