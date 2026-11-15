import { useEditorState, type Editor } from '@tiptap/react'
import type { HorizontalAlign, TextElement } from '../model/types'
import type { SlideCommands } from './useSlideCommands'

export interface ParagraphFormat {
  align: HorizontalAlign
  bullets: boolean
}

/**
 * Alineación y viñetas para la cinta, con los mismos dos destinos que el formato de carácter
 * (useCharacterFormat):
 *  - escribiendo: a los párrafos donde está el cursor o la selección (formato por párrafo);
 *  - con el cuadro seleccionado sin escribir: al cuadro entero, y los párrafos dejan su formato propio.
 */
export function useParagraphFormat(textEditor: Editor | null, element: TextElement | null, commands: SlideCommands) {
  const editorFormat = useEditorState({
    editor: textEditor,
    selector: ({ editor }): ParagraphFormat | null => {
      if (!editor || !element) return null
      const attrs = editor.getAttributes('paragraph')
      return {
        align: (attrs.textAlign as HorizontalAlign | null) ?? element.style.align,
        bullets: (attrs.bullet as boolean | null) ?? element.style.bullets
      }
    }
  })

  const format: ParagraphFormat | null =
    editorFormat ?? (element ? { align: element.style.align, bullets: element.style.bullets } : null)

  return {
    format,
    setAlign(align: HorizontalAlign) {
      if (textEditor) textEditor.chain().focus().setTextAlign(align).run()
      else commands.setTextStyle({ align })
    },
    toggleBullets() {
      if (!format) return
      if (textEditor) textEditor.chain().focus().setParagraphBullet(!format.bullets).run()
      else commands.setTextStyle({ bullets: !format.bullets })
    }
  }
}
