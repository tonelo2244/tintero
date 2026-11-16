import { useEditorState, type Editor } from '@tiptap/react'
import { isInHeaderRow } from '../model/commands'
import { activeParagraphStyleId } from '../model/paragraphStyles'
import type { ParagraphIndents } from '../model/ruler'
import { INDENT_STEP_CM } from './ParagraphFormat'

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
        // No los pinta nadie: están para que la cinta se repinte cuando cambian (ver CommandButton).
        blockquote: current.isActive('blockquote'),
        codeBlock: current.isActive('codeBlock'),
        fontFamily: (textStyle.fontFamily as string | undefined) ?? null,
        fontSize: (textStyle.fontSize as string | undefined) ?? null,
        color: (textStyle.color as string | undefined) ?? null,
        highlight: (current.getAttributes('highlight').color as string | undefined) ?? null,
        align: ALIGNMENTS.find((align) => current.isActive({ textAlign: align })) ?? 'left',
        lineHeight: (current.getAttributes('paragraph').lineHeight as string | undefined) ?? null,
        paragraphStyleId: activeParagraphStyleId(current),
        indents: paragraphIndents(current),
        table: {
          active: current.isActive('table'),
          canMerge: current.can().mergeCells(),
          canSplit: current.can().splitCell(),
          headerRow: isInHeaderRow(current)
        },
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
        words: current.storage.characterCount.words() as number
      }
    }
  })
}

/**
 * Sangrías del párrafo del cursor, para la regla. En una tabla no se enseñan: la regla de Word
 * mide entonces la celda, y eso llega con la fase de disposición.
 */
function paragraphIndents(editor: Editor): ParagraphIndents | null {
  if (editor.isActive('table')) return null
  const { $from } = editor.state.selection
  const block = $from.parent
  if (block.type.name !== 'paragraph' && block.type.name !== 'heading') return null
  return {
    left: Math.round((Number(block.attrs.indent) || 0) * INDENT_STEP_CM * 100) / 100,
    firstLine: Number(block.attrs.firstLineIndent) || 0
  }
}

export type WriterToolbarState = NonNullable<ReturnType<typeof useWriterToolbarState>>
