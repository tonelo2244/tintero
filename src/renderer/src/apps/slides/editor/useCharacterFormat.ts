import { useEditorState, type Editor } from '@tiptap/react'
import type { TextElement, TextStyle } from '../model/types'
import type { SlideCommands } from './useSlideCommands'

type ToggleKey = 'bold' | 'italic' | 'underline' | 'strike'

export interface CharacterFormat {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  fontFamily: string | null
  fontSize: number
  color: string | null
}

/**
 * Formato de carácter para la cinta, con dos destinos posibles:
 *  - escribiendo dentro de un cuadro: se aplica a la selección (formato por palabra, vía Tiptap);
 *  - con el cuadro seleccionado pero sin escribir: se aplica al cuadro entero (acción del reducer).
 * La cinta no necesita saber en cuál de los dos casos está.
 */
export function useCharacterFormat(textEditor: Editor | null, element: TextElement | null, commands: SlideCommands) {
  const editorFormat = useEditorState({
    editor: textEditor,
    selector: ({ editor }): CharacterFormat | null => {
      if (!editor || !element) return null
      const attrs = editor.getAttributes('textStyle')
      return {
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        underline: editor.isActive('underline'),
        strike: editor.isActive('strike'),
        fontFamily: (attrs.fontFamily as string | undefined) ?? element.style.fontFamily,
        fontSize: parseFloat(attrs.fontSize as string) || element.style.fontSize,
        color: (attrs.color as string | undefined) ?? element.style.color
      }
    }
  })

  const format: CharacterFormat | null = editorFormat ?? (element ? boxFormat(element.style) : null)
  const chain = () => textEditor!.chain().focus()

  return {
    format,
    toggle(key: ToggleKey) {
      if (!format) return
      if (!textEditor) return commands.setTextStyle({ [key]: !format[key] })
      const toggles = {
        bold: () => chain().toggleBold().run(),
        italic: () => chain().toggleItalic().run(),
        underline: () => chain().toggleUnderline().run(),
        strike: () => chain().toggleStrike().run()
      }
      toggles[key]()
    },
    setFontFamily(fontFamily: string) {
      if (textEditor) chain().setFontFamily(fontFamily).run()
      else commands.setTextStyle({ fontFamily })
    },
    setFontSize(fontSize: number) {
      if (textEditor) chain().setFontSize(`${fontSize}px`).run()
      else commands.setTextStyle({ fontSize })
    },
    setColor(color: string | null) {
      if (!textEditor) commands.setTextStyle({ color })
      else if (color) chain().setColor(color).run()
      else chain().unsetColor().run()
    }
  }
}

function boxFormat(style: TextStyle): CharacterFormat {
  const { bold, italic, underline, strike, fontFamily, fontSize, color } = style
  return { bold, italic, underline, strike, fontFamily, fontSize, color }
}
