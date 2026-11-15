import type { JSONContent } from '@tiptap/core'
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type IParagraphOptions,
  type IRunOptions,
  type ParagraphChild
} from 'docx'
import { cssColorToHex, cssFontToName, cssSizeToPt } from '@/core/office/cssValues'
import { decodeImageDataUrl, fitWidth, imageSize } from '@/core/office/images'
import type { WriterContent } from '../content'
import {
  BULLET_LIST_REFERENCE,
  bulletLevels,
  DOCX_STYLE,
  docxStyles,
  halfPoints,
  numberedLevels,
  numberedListReference,
  TWIPS_PER_CM
} from './docxStyles'
import { columnWidthsTwips, readColumnWidths } from './tableLayout'

/** A4 con márgenes de 2,5 cm, igual que la hoja del editor. */
const PAGE = { width: 11906, height: 16838, margin: Math.round(2.5 * TWIPS_PER_CM) }
/** Ancho útil de la página en píxeles (16 cm a 96 ppp): las imágenes más anchas se reducen. */
const MAX_IMAGE_WIDTH_PX = 605
const INDENT_STEP_TWIPS = 720 // 1,27 cm, el mismo paso que la sangría del editor
const CONTENT_WIDTH_TWIPS = PAGE.width - 2 * PAGE.margin
/** Mismo gris que las celdas de encabezado en el editor. */
const HEADER_CELL_FILL = 'F2F2F2'
const TABLE_BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' }

/** Un bloque de Word: párrafo o tabla. */
type DocxBlock = Paragraph | Table

const HEADING_BY_LEVEL = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3
} as const

const ALIGNMENT = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED
} as const

const STYLE_BY_BLOCK_STYLE: Record<string, string> = {
  subtitle: DOCX_STYLE.subtitle,
  quote: DOCX_STYLE.quote,
  'no-spacing': DOCX_STYLE.noSpacing
}

interface ListContext {
  reference: string
  instance: number
  level: number
}

/**
 * Convierte el JSON de Tiptap en un documento de Word.
 * Es una función pura (no toca el disco ni la interfaz): recibe el contenido y devuelve los bytes.
 */
export async function exportDocx(content: WriterContent): Promise<Uint8Array> {
  const converter = new DocxConverter()
  const children = converter.blocks(content.doc.content ?? [])
  const document = new Document({
    creator: 'Tintero',
    styles: docxStyles,
    numbering: {
      config: [
        { reference: BULLET_LIST_REFERENCE, levels: bulletLevels() },
        ...[...converter.numberedListStarts].map((start) => ({
          reference: numberedListReference(start),
          levels: numberedLevels(start)
        }))
      ]
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE.width, height: PAGE.height },
            margin: { top: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, right: PAGE.margin }
          }
        },
        // Word exige al menos un párrafo por sección.
        children: children.length > 0 ? children : [new Paragraph({})]
      }
    ]
  })
  return new Uint8Array(await Packer.toArrayBuffer(document))
}

/** Recorre el árbol de nodos. Guarda estado (listas abiertas) por eso es una clase y no funciones sueltas. */
class DocxConverter {
  /** Cada lista nueva reinicia su numeración con una "instancia" distinta. */
  private nextListInstance = 1
  readonly numberedListStarts = new Set<number>()

  blocks(nodes: JSONContent[], list?: ListContext): DocxBlock[] {
    return nodes.flatMap((node) => this.block(node, list))
  }

  private block(node: JSONContent, list?: ListContext): DocxBlock[] {
    switch (node.type) {
      case 'paragraph':
        return [this.paragraph(node, list)]
      case 'heading':
        return [this.paragraph(node, list)]
      case 'bulletList':
        return this.list(node, BULLET_LIST_REFERENCE, list)
      case 'orderedList': {
        const start = Number(node.attrs?.start) || 1
        this.numberedListStarts.add(start)
        return this.list(node, numberedListReference(start), list)
      }
      case 'listItem':
        return this.blocks(node.content ?? [], list)
      case 'blockquote':
        return (node.content ?? []).flatMap((child) =>
          child.type === 'paragraph'
            ? [new Paragraph({ style: DOCX_STYLE.blockQuote, children: this.inlines(child.content ?? []) })]
            : this.block(child, list)
        )
      case 'codeBlock':
        return codeLines(node).map(
          (line) => new Paragraph({ style: DOCX_STYLE.code, children: [new TextRun({ text: line })] })
        )
      case 'horizontalRule':
        return [
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BBBBBB', space: 1 } },
            children: []
          })
        ]
      case 'image':
        return [new Paragraph({ children: this.inline(node, []) })]
      case 'table':
        return [this.table(node, CONTENT_WIDTH_TWIPS)]
      default:
        // Nodo desconocido (extensión futura): mejor conservar su texto que perderlo.
        return node.content ? this.blocks(node.content, list) : []
    }
  }

  /**
   * Tabla de Tiptap -> tabla de Word. Tiptap y Word representan igual las celdas combinadas
   * (colspan/rowspan en la celda de origen y las demás omitidas), así que la traducción es directa.
   */
  private table(node: JSONContent, availableTwips: number): Table {
    const columnWidths = columnWidthsTwips(readColumnWidths(node), availableTwips)
    const rows = (node.content ?? []).map((row) => {
      const cells = row.content ?? []
      // Una fila hecha solo de encabezados se repite arriba de cada página, como en Word.
      const isHeaderRow = cells.length > 0 && cells.every((cell) => cell.type === 'tableHeader')
      let column = 0
      return new TableRow({
        // Solo se escribe cuando es cierto: algunos lectores (mammoth) tratan `w:tblHeader w:val="off"` como encabezado.
        tableHeader: isHeaderRow || undefined,
        children: cells.map((cell) => {
          const columnSpan = Math.max(1, Number(cell.attrs?.colspan) || 1)
          const width = columnWidths.slice(column, column + columnSpan).reduce((sum, value) => sum + value, 0)
          column += columnSpan
          const content = this.blocks(cell.content ?? [])
          return new TableCell({
            // Word exige que una celda termine en párrafo.
            children: content.at(-1) instanceof Paragraph ? content : [...content, new Paragraph({})],
            columnSpan,
            rowSpan: Math.max(1, Number(cell.attrs?.rowspan) || 1),
            width: { size: width, type: WidthType.DXA },
            verticalAlign: VerticalAlign.TOP,
            shading:
              cell.type === 'tableHeader'
                ? { type: ShadingType.CLEAR, fill: HEADER_CELL_FILL, color: 'auto' }
                : undefined
          })
        })
      })
    })
    return new Table({
      rows,
      columnWidths,
      width: { size: columnWidths.reduce((sum, value) => sum + value, 0), type: WidthType.DXA },
      borders: {
        top: TABLE_BORDER,
        bottom: TABLE_BORDER,
        left: TABLE_BORDER,
        right: TABLE_BORDER,
        insideHorizontal: TABLE_BORDER,
        insideVertical: TABLE_BORDER
      }
    })
  }

  private list(node: JSONContent, reference: string, parent?: ListContext): DocxBlock[] {
    // Una lista anidada del mismo tipo es el siguiente nivel de la misma lista; si cambia de tipo, empieza otra.
    const sameList = parent && parent.reference === reference
    const context: ListContext = {
      reference,
      instance: sameList ? parent.instance : this.nextListInstance++,
      level: parent ? parent.level + 1 : 0
    }
    return (node.content ?? []).flatMap((item) => {
      const [first, ...rest] = item.content ?? []
      const firstParagraphs = first ? this.block(first, context) : []
      // Solo el primer párrafo de cada elemento lleva viñeta; el resto (y las sublistas) cuelgan de él.
      const restParagraphs = rest.flatMap((child) =>
        child.type === 'paragraph' ? [this.paragraph(child, undefined, context.level + 1)] : this.block(child, context)
      )
      return [...firstParagraphs, ...restParagraphs]
    })
  }

  private paragraph(node: JSONContent, list?: ListContext, continuationLevel?: number): Paragraph {
    const attrs = node.attrs ?? {}
    const options: { -readonly [K in keyof IParagraphOptions]: IParagraphOptions[K] } = {
      children: this.inlines(node.content ?? [])
    }

    if (node.type === 'heading') {
      options.heading = HEADING_BY_LEVEL[attrs.level as 1 | 2 | 3] ?? HeadingLevel.HEADING_1
    } else if (attrs.blockStyle === 'title') {
      options.heading = HeadingLevel.TITLE
    } else if (attrs.blockStyle && STYLE_BY_BLOCK_STYLE[attrs.blockStyle]) {
      options.style = STYLE_BY_BLOCK_STYLE[attrs.blockStyle]
    }

    const alignment = ALIGNMENT[attrs.textAlign as keyof typeof ALIGNMENT]
    if (alignment && attrs.textAlign !== 'left') options.alignment = alignment

    if (list) {
      options.numbering = { reference: list.reference, level: list.level, instance: list.instance }
    } else if (continuationLevel !== undefined) {
      options.indent = { left: INDENT_STEP_TWIPS * (continuationLevel + 1) }
    } else if (attrs.indent > 0) {
      options.indent = { left: INDENT_STEP_TWIPS * attrs.indent }
    }

    const lineHeight = Number(attrs.lineHeight)
    if (lineHeight > 0) options.spacing = { line: Math.round(240 * lineHeight) }

    return new Paragraph(options)
  }

  private inlines(nodes: JSONContent[]): ParagraphChild[] {
    return nodes.flatMap((node) => this.inline(node, node.marks ?? []))
  }

  private inline(node: JSONContent, marks: NonNullable<JSONContent['marks']>): ParagraphChild[] {
    if (node.type === 'hardBreak') return [new TextRun({ break: 1 })]
    if (node.type === 'image') {
      const image = imageRun(node)
      return image ? [image] : []
    }
    if (node.type !== 'text' || !node.text) return []

    const run = new TextRun({ text: node.text, ...runOptions(marks) })
    const link = marks.find((mark) => mark.type === 'link')?.attrs?.href
    return typeof link === 'string' && link ? [new ExternalHyperlink({ link, children: [run] })] : [run]
  }
}

type MutableRunOptions = { -readonly [K in keyof IRunOptions]: IRunOptions[K] }

/** Marcas de Tiptap (negrita, color, fuente...) -> propiedades de un "run" de Word. */
export function runOptions(marks: NonNullable<JSONContent['marks']>): MutableRunOptions {
  const options: MutableRunOptions = {}
  for (const mark of marks) {
    const attrs = mark.attrs ?? {}
    switch (mark.type) {
      case 'bold':
        options.bold = true
        break
      case 'italic':
        options.italics = true
        break
      case 'underline':
        options.underline = {}
        break
      case 'strike':
        options.strike = true
        break
      case 'subscript':
        options.subScript = true
        break
      case 'superscript':
        options.superScript = true
        break
      case 'code':
        options.font = 'Courier New'
        break
      case 'link':
        options.style = 'Hyperlink'
        break
      case 'highlight': {
        // Word solo tiene 16 colores de resaltado; el sombreado admite cualquier color.
        const fill = cssColorToHex(attrs.color) ?? 'FFF176'
        options.shading = { type: ShadingType.CLEAR, fill, color: 'auto' }
        break
      }
      case 'textStyle': {
        const font = cssFontToName(attrs.fontFamily)
        if (font) options.font = font
        const size = cssSizeToPt(attrs.fontSize)
        if (size) options.size = halfPoints(size)
        const color = cssColorToHex(attrs.color)
        if (color) options.color = color
        const background = cssColorToHex(attrs.backgroundColor)
        if (background) options.shading = { type: ShadingType.CLEAR, fill: background, color: 'auto' }
        break
      }
    }
  }
  return options
}

function imageRun(node: JSONContent): ImageRun | null {
  const decoded = typeof node.attrs?.src === 'string' ? decodeImageDataUrl(node.attrs.src) : null
  if (!decoded) return null // imagen enlazada o formato que Word no entiende (SVG, WebP)
  const declaredWidth = Number(node.attrs?.width)
  const declaredHeight = Number(node.attrs?.height)
  const size =
    declaredWidth > 0 && declaredHeight > 0
      ? { width: declaredWidth, height: declaredHeight }
      : (imageSize(decoded) ?? { width: MAX_IMAGE_WIDTH_PX, height: Math.round(MAX_IMAGE_WIDTH_PX * 0.75) })
  const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''
  return new ImageRun({
    type: decoded.kind,
    data: decoded.bytes,
    transformation: fitWidth(size, MAX_IMAGE_WIDTH_PX),
    altText: { name: alt || 'Imagen', description: alt, title: alt }
  })
}

function codeLines(node: JSONContent): string[] {
  const text = (node.content ?? []).map((child) => child.text ?? '').join('')
  return text.split('\n')
}
