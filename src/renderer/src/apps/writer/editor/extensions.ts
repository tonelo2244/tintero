import type { Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { BackgroundColor, Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TextAlign from '@tiptap/extension-text-align'
import Image from '@tiptap/extension-image'
import { CharacterCount, Placeholder } from '@tiptap/extensions'
import { ParagraphFormat } from './ParagraphFormat'

/**
 * Lista única de extensiones. La usan el editor y las plantillas (para convertir
 * HTML a JSON), así nunca se desincronizan.
 */
export function createWriterExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false }
    }),
    TextStyle,
    FontFamily,
    FontSize,
    Color,
    BackgroundColor,
    Highlight.configure({ multicolor: true }),
    Subscript,
    Superscript,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Image.configure({ allowBase64: true }),
    CharacterCount,
    Placeholder.configure({ placeholder: 'Empieza a escribir…' }),
    ParagraphFormat
  ]
}
