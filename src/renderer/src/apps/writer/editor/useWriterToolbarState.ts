import { useEditorState, type Editor } from '@tiptap/react'
import { isInHeaderRow } from '../model/commands'
import { activeCharStyleId, activeParagraphStyleId } from '../model/paragraphStyles'
import type { TabStop } from '../model/paragraphFormat'
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
        shading: (current.state.selection.$from.parent.attrs.shading as string | null | undefined) ?? null,
        align: ALIGNMENTS.find((align) => current.isActive({ textAlign: align })) ?? 'left',
        paragraphStyleId: activeParagraphStyleId(current),
        charStyleId: activeCharStyleId(current),
        // Formato de párrafo de la fase 13: los menús marcan con ✓ lo que tiene el párrafo.
        paragraph: paragraphAttrs(current),
        bulletStyle: (current.getAttributes('bulletList').bulletStyle as string | undefined) ?? null,
        numberFormat: (current.getAttributes('orderedList').numberFormat as string | undefined) ?? null,
        formatPainter: !!current.storage.formatPainter?.copied,
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

/** Atributos del bloque del cursor que enseñan la cinta y la pestaña Disposición. */
function paragraphAttrs(editor: Editor) {
  const attrs = editor.state.selection.$from.parent.attrs
  return {
    lineHeight: (attrs.lineHeight as string | null | undefined) ?? null,
    spaceBefore: (attrs.spaceBefore as number | null | undefined) ?? null,
    spaceAfter: (attrs.spaceAfter as number | null | undefined) ?? null,
    indentRight: (attrs.indentRight as number | null | undefined) ?? null,
    border: (attrs.border as string | null | undefined) ?? null,
    tabStops: (attrs.tabStops as TabStop[] | null | undefined) ?? []
  }
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
