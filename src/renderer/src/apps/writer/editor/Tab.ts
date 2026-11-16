import { Node } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tab: {
      insertTab: () => ReturnType
    }
  }
}

/**
 * Tabulador: un carácter que ocupa hasta el siguiente tope de tabulación del párrafo. En el HTML es
 * un <span> vacío; su ancho lo calcula editor/TabStops.ts midiendo dónde cae (como hace Word).
 */
export const Tab = Node.create({
  name: 'tab',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'span[data-tab]' }]
  },

  renderHTML() {
    return ['span', { 'data-tab': '', class: 'writer-tab' }]
  },

  renderText() {
    return '\t'
  },

  addCommands() {
    return {
      insertTab:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name })
    }
  }
})
