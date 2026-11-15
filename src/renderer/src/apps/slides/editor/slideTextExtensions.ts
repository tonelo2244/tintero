import type { Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style'

/**
 * Extensiones del editor de un cuadro de texto: solo párrafos y formato de carácter, lo mismo que
 * sabe guardar el modelo (model/richText.ts). Todo lo demás (títulos, listas, enlaces...) se apaga,
 * así lo que se pega desde fuera se reduce a texto con formato, sin estructuras que no podríamos guardar.
 */
export function createSlideTextExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: false,
      blockquote: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      codeBlock: false,
      code: false,
      horizontalRule: false,
      hardBreak: false,
      link: false,
      dropcursor: false,
      gapcursor: false,
      trailingNode: false
    }),
    TextStyle,
    Color,
    FontFamily,
    FontSize
  ]
}
