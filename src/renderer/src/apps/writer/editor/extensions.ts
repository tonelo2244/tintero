import type { Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { BackgroundColor, Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TextAlign from '@tiptap/extension-text-align'
import { CharacterCount, Placeholder } from '@tiptap/extensions'
import { Bookmark } from './Bookmark'
import { writerTableExtensions } from './WriterTable'
import { CharStyle } from './CharStyle'
import { Field } from './Field'
import { Chart } from './objects/Chart'
import { Shape } from './objects/Shape'
import { TextBox } from './objects/TextBox'
import { WriterImage } from './objects/WriterImage'
import { CommentMark } from './CommentMark'
import { FormatPainter } from './FormatPainter'
import { PageBreak } from './PageBreak'
import { SectionBreak } from './SectionBreak'
import { ColumnBreak, Columns } from './Columns'
import { ParagraphFormat } from './ParagraphFormat'
import { SearchAndReplace } from './SearchAndReplace'
import { Tab } from './Tab'

/**
 * Lista única de extensiones. La usan el editor y las plantillas (para convertir
 * HTML a JSON), así nunca se desincronizan.
 */
export function createWriterExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
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
    // Imagen con tamaño, recorte, giro y ajuste de texto (fase 16).
    WriterImage.configure({ allowBase64: true }),
    // Tablas con columnas redimensionables arrastrando el borde, estilos de tabla y bordes y sombreado de celda.
    ...writerTableExtensions(),
    CharacterCount,
    Placeholder.configure({ placeholder: 'Empieza a escribir…' }),
    ParagraphFormat,
    PageBreak,
    SectionBreak,
    Columns,
    ColumnBreak,
    Tab,
    CharStyle,
    FormatPainter,
    CommentMark,
    SearchAndReplace,
    Bookmark,
    Field,
    Shape,
    TextBox,
    Chart
  ]
}
