import { useEditorState, type Editor } from '@tiptap/react'
import { activeParagraphStyleId } from '../model/paragraphStyles'

export type TextAlignment = 'left' | 'center' | 'right' | 'justify'
const ALIGNMENTS: TextAlignment[] = ['left', 'center', 'right', 'justify']

/**
 * Todo lo que la cinta necesita saber del editor en un solo objeto.
 * `useEditorState` solo re-renderiza cuando cambia alguno de estos valores,
 * no en cada pulsación de tecla.
 */
export function useWriterToolbarState(editor: Editor | null) {
  return useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) return null
      const textStyle = current.getAttributes('textStyle')
      return {
        bold: current.isActive('bold'),
        italic: current.isActive('italic'),
        underline: current.isActive('underline'),
        strike: current.isActive('strike'),
        subscript: current.isActive('subscript'),
        superscript: current.isActive('superscript'),
        bulletList: current.isActive('bulletList'),
        orderedList: current.isActive('orderedList'),
        fontFamily: (textStyle.fontFamily as string | undefined) ?? null,
        fontSize: (textStyle.fontSize as string | undefined) ?? null,
        color: (textStyle.color as string | undefined) ?? null,
        highlight: (current.getAttributes('highlight').color as string | undefined) ?? null,
        align: ALIGNMENTS.find((align) => current.isActive({ textAlign: align })) ?? 'left',
        lineHeight: (current.getAttributes('paragraph').lineHeight as string | undefined) ?? null,
        paragraphStyleId: activeParagraphStyleId(current),
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
        words: current.storage.characterCount.words() as number
      }
    }
  })
}

export type WriterToolbarState = NonNullable<ReturnType<typeof useWriterToolbarState>>
