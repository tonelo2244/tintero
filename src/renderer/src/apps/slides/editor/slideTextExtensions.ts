import { Extension, type Extensions } from '@tiptap/core'
import TextAlign from '@tiptap/extension-text-align'
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
    FontSize,
    // Alineación por párrafo. Sin valor por defecto: un párrafo sin alineación propia sigue al cuadro.
    TextAlign.configure({ types: ['paragraph'], defaultAlignment: null }),
    ParagraphBullet
  ]
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphBullet: {
      /** Pone o quita la viñeta de los párrafos seleccionados. */
      setParagraphBullet: (bullet: boolean) => ReturnType
    }
  }
}

/**
 * Viñeta por párrafo: atributo `bullet` (true, false o null = la del cuadro), que se pinta como
 * `data-bullet`. Es un atributo y no una lista de Tiptap porque el modelo de la diapositiva no tiene
 * listas anidadas: cada párrafo es una línea con o sin viñeta, como en PowerPoint.
 */
const ParagraphBullet = Extension.create({
  name: 'paragraphBullet',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          bullet: {
            default: null,
            parseHTML: (element) => {
              const value = element.getAttribute('data-bullet')
              return value === null ? null : value === 'true'
            },
            renderHTML: (attributes) =>
              attributes.bullet === null || attributes.bullet === undefined
                ? {}
                : { 'data-bullet': String(attributes.bullet) }
          }
        }
      }
    ]
  },
  addCommands() {
    return {
      setParagraphBullet:
        (bullet) =>
        ({ commands }) =>
          commands.updateAttributes('paragraph', { bullet })
    }
  }
})
