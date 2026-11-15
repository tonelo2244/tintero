import { Mark, mergeAttributes } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      /** Marca la selección como comentada por `commentId`. */
      setComment: (commentId: string) => ReturnType
      /** Quita del documento la marca de un comentario, esté donde esté. */
      removeComment: (commentId: string) => ReturnType
    }
  }
}

/**
 * Texto comentado. La marca solo guarda el id; el contenido del comentario (autor, texto) vive
 * en `WriterContent.comments`, igual que en Word, donde el documento y `comments.xml` van aparte.
 * Así borrar o editar un comentario no obliga a recorrer el documento.
 */
export const CommentMark = Mark.create({
  name: 'comment',
  // Que el texto escrito justo después de un comentario no quede comentado.
  inclusive: false,

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-comment-id'),
        renderHTML: (attributes) => (attributes.commentId ? { 'data-comment-id': attributes.commentId } : {})
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'writer-comment' }), 0]
  },

  addCommands() {
    return {
      setComment:
        (commentId) =>
        ({ commands }) =>
          commands.setMark(this.name, { commentId }),
      removeComment:
        (commentId) =>
        ({ tr, state, dispatch }) => {
          const markType = state.schema.marks[this.name]
          state.doc.descendants((node, position) => {
            const mark = node.marks.find(
              (candidate) => candidate.type === markType && candidate.attrs.commentId === commentId
            )
            if (mark) tr.removeMark(position, position + node.nodeSize, mark)
          })
          if (dispatch) dispatch(tr)
          return true
        }
    }
  }
})

/** Tramo del documento que abarca cada comentario (del primer al último carácter comentado). */
export function commentRanges(doc: ProseMirrorNode): Map<string, { from: number; to: number }> {
  const ranges = new Map<string, { from: number; to: number }>()
  doc.descendants((node, position) => {
    for (const mark of node.marks) {
      const id = mark.type.name === 'comment' ? (mark.attrs.commentId as string | null) : null
      if (!id) continue
      const range = ranges.get(id)
      const end = position + node.nodeSize
      ranges.set(
        id,
        range ? { from: Math.min(range.from, position), to: Math.max(range.to, end) } : { from: position, to: end }
      )
    }
  })
  return ranges
}
