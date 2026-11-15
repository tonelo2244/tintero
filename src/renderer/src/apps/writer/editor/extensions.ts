import type { Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { BackgroundColor, Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TextAlign from '@tiptap/extension-text-align'
import Image from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import { CharacterCount, Placeholder } from '@tiptap/extensions'
import { CommentMark } from './CommentMark'
import { ParagraphFormat } from './ParagraphFormat'
import { SearchAndReplace } from './SearchAndReplace'

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
    // Tablas con columnas redimensionables arrastrando el borde, como en un procesador de texto.
    TableKit.configure({ table: { resizable: true, cellMinWidth: 40 } }),
    CharacterCount,
    Placeholder.configure({ placeholder: 'Empieza a escribir…' }),
    ParagraphFormat,
    CommentMark,
    SearchAndReplace
  ]
}
