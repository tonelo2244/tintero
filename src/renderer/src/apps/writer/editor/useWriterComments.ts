import { useState } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import { createId } from '@/core/ids'
import type { WriterComment, WriterParts } from '../model/content'
import { commentRanges } from './CommentMark'

type UpdateParts = (change: (current: WriterParts) => WriterParts) => void

/**
 * Comentarios del documento: el texto marcado vive en Tiptap (marca `comment`) y el contenido de
 * cada comentario en las partes del documento. Este hook mantiene las dos cosas de acuerdo.
 */
export function useWriterComments(editor: Editor | null, comments: WriterComment[], updateParts: UpdateParts) {
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  // Qué comentarios siguen teniendo texto en el documento y cuál está bajo el cursor.
  const view = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) return { anchored: new Set<string>(), atCursor: null }
      return {
        anchored: new Set(commentRanges(current.state.doc).keys()),
        atCursor: (current.getAttributes('comment').commentId as string | undefined) ?? null
      }
    },
    equalityFn: (a, b) =>
      a?.atCursor === b?.atCursor &&
      a?.anchored.size === b?.anchored.size &&
      [...(a?.anchored ?? [])].every((id) => b?.anchored.has(id))
  })

  const add = () => {
    if (!editor || editor.state.selection.empty) return
    const id = createId('comment')
    editor.chain().focus().setComment(id).run()
    // El autor vacío se muestra como "Tú" y se exporta como "Tintero": no conocemos el nombre del usuario.
    updateParts((parts) => ({
      ...parts,
      comments: [...(parts.comments ?? []), { id, author: '', date: new Date().toISOString(), text: '' }]
    }))
    setActiveId(id)
    setOpen(true)
  }

  const changeText = (id: string, text: string) =>
    updateParts((parts) => ({
      ...parts,
      comments: parts.comments?.map((comment) => (comment.id === id ? { ...comment, text } : comment))
    }))

  const remove = (id: string) => {
    editor?.commands.removeComment(id)
    updateParts((parts) => {
      const rest = (parts.comments ?? []).filter((comment) => comment.id !== id)
      return { ...parts, comments: rest.length > 0 ? rest : undefined }
    })
    if (activeId === id) setActiveId(null)
  }

  /** Selecciona el texto comentado y lo lleva a la vista. */
  const select = (id: string) => {
    setActiveId(id)
    const range = editor ? commentRanges(editor.state.doc).get(id) : undefined
    if (editor && range) editor.chain().focus().setTextSelection(range).scrollIntoView().run()
  }

  return {
    open,
    setOpen,
    activeId: view?.atCursor ?? activeId,
    anchored: view?.anchored ?? new Set<string>(),
    count: comments.length,
    add,
    changeText,
    remove,
    select
  }
}
