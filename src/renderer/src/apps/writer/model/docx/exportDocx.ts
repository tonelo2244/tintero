import type { JSONContent } from '@tiptap/core'
import {
  Bookmark,
  BorderStyle,
  ColumnBreak,
  CommentRangeEnd,
  CommentRangeStart,
  CommentReference,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  InternalHyperlink,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  SimpleField,
  SectionType,
  ShadingType,
  Tab,
  TabStopType,
  LeaderType,
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
import {
  PAGE_COUNT_TOKEN,
  PAGE_NUMBER_TOKEN,
  type HeaderFooter,
  type WriterComment,
  type WriterContent
} from '../content'
import {
  ALIGNMENT,
  bulletLevels,
  bulletListReference,
  DOCX_STYLE,
  docxStyleId,
  docxStylesFor,
  halfPoints,
  HEADINGS_NUMBERING_REFERENCE,
  headingLevels,
  numberedLevels,
  numberedListReference,
  twips
} from './docxStyles'
import type { NumberFormat, ParagraphBorder, TabStop } from '../paragraphFormat'
import { DEFAULT_STYLES } from '../styles'
import { DEFAULT_PAGE_SETUP, orientedSize, type PageSetup } from '../pageSetup'
import { COLUMN_BREAK, COLUMN_GAP_CM, COLUMNS, normalizeColumnCount } from '../columns'
import { BOOKMARK, bookmarkOfHref } from '../links'
import { docxFieldInstruction, FIELD, fieldText, isFieldKind } from '../fields'
import { imageRun, objectParagraph, shapeRun, textBoxRun } from './objectsDocx'
import { SECTION_BREAK, sectionBreakSetup } from '../sections'
import { columnWidthsTwips, readColumnWidths } from './tableLayout'

const INDENT_STEP_TWIPS = 720 // 1,27 cm, el mismo paso que la sangría del editor
const PX_PER_CM = 96 / 2.54
/** Mismo gris que las celdas de encabezado en el editor. */
const HEADER_CELL_FILL = 'F2F2F2'
const TABLE_BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' }

/** Un bloque de Word: párrafo o tabla. */
type DocxBlock = Paragraph | Table

const HEADING_BY_LEVEL = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6
} as const

/** Bordes de párrafo: el mismo gris que en pantalla (paragraphFormat.ts). */
const PARAGRAPH_LINE = { style: BorderStyle.SINGLE, size: 6, color: '595959', space: 1 }
const PARAGRAPH_BORDERS: Record<ParagraphBorder, IParagraphOptions['border']> = {
  bottom: { bottom: PARAGRAPH_LINE },
  top: { top: PARAGRAPH_LINE },
  left: { left: { ...PARAGRAPH_LINE, size: 18, space: 4 } },
  box: { top: PARAGRAPH_LINE, bottom: PARAGRAPH_LINE, left: PARAGRAPH_LINE, right: PARAGRAPH_LINE }
}

const TAB_TYPE = {
  left: TabStopType.LEFT,
  center: TabStopType.CENTER,
  right: TabStopType.RIGHT,
  decimal: TabStopType.DECIMAL
} as const

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
  const comments = content.comments ?? []
  const pageSetup = content.pageSetup ?? DEFAULT_PAGE_SETUP
  // Secciones de Word: una por salto de sección y otra por cada bloque de columnas (fase 15).
  const plans = planDocxSections(content.doc.content ?? [], pageSetup)
  const converter = new DocxConverter(comments, content.doc, contentWidthCm(pageSetup))
  converter.author = content.author ?? ''
  const sectionChildren = plans.map((plan) => {
    converter.setContentWidth(contentWidthCm(plan.setup))
    return converter.blocks(plan.blocks)
  })
  const document = new Document({
    // El campo AUTHOR de Word lee esta propiedad.
    creator: content.author ?? 'Tintero',
    // "Pares e impares diferentes" es un ajuste del documento entero en Word (settings.xml).
    ...(content.evenPages && { evenAndOddHeaderAndFooters: true }),
    // Disposición > Guiones > Automático: w:autoHyphenation en settings.xml.
    ...(content.hyphenation && { hyphenation: { autoHyphenation: true } }),
    styles: docxStylesFor(content.styles ?? DEFAULT_STYLES, content.numberedHeadings),
    comments: { children: comments.map(commentOptions) },
    numbering: {
      config: [
        { reference: bulletListReference(), levels: bulletLevels() },
        ...[...converter.bulletStyles].map((bulletId) => ({
          reference: bulletListReference(bulletId),
          levels: bulletLevels(bulletId)
        })),
        ...[...converter.numberedLists.values()].map(({ start, format }) => ({
          reference: numberedListReference(start, format),
          levels: numberedLevels(start, format)
        })),
        ...(content.numberedHeadings ? [{ reference: HEADINGS_NUMBERING_REFERENCE, levels: headingLevels() }] : [])
      ]
    },
    sections: plans.map((plan, index) => ({
      properties: {
        page: pageProperties(plan.setup),
        ...(index > 0 && { type: plan.continuous ? SectionType.CONTINUOUS : SectionType.NEXT_PAGE }),
        ...(plan.columns > 1 && { column: { count: plan.columns, space: twips(COLUMN_GAP_CM) } }),
        // "Primera página diferente" (w:titlePg).
        ...(index === 0 && content.firstPage && { titlePage: true })
      },
      // Solo la primera: en Word, una sección sin encabezado propio usa el de la anterior.
      ...(index === 0 && headersAndFooters(content)),
      // Word exige al menos un párrafo por sección.
      children: sectionChildren[index].length > 0 ? sectionChildren[index] : [new Paragraph({})]
    }))
  })
  return new Uint8Array(await Packer.toArrayBuffer(document))
}

/**
 * Encabezados y pies de la primera sección: el normal y, si están activados, el de la primera
 * hoja y el de las pares. Una variante activada pero vacía se escribe vacía (si no, Word usaría la normal).
 */
function headersAndFooters(content: WriterContent) {
  const part = (kind: 'header' | 'footer', value: HeaderFooter | undefined) =>
    kind === 'header'
      ? new Header({ children: value ? headerFooterParagraphs(value) : [new Paragraph({})] })
      : new Footer({ children: value ? headerFooterParagraphs(value) : [new Paragraph({})] })
  const set = (kind: 'header' | 'footer') => {
    const variants = {
      ...(content[kind] && { default: part(kind, content[kind]) }),
      ...(content.firstPage && { first: part(kind, content.firstPage[kind]) }),
      ...(content.evenPages && { even: part(kind, content.evenPages[kind]) })
    }
    return Object.keys(variants).length > 0 ? variants : undefined
  }
  return { headers: set('header'), footers: set('footer') }
}

/** Una sección de Word por escribir: su hoja, sus columnas y si empieza en la misma hoja. */
interface DocxSectionPlan {
  setup: PageSetup
  columns: number
  /** Continúa en la misma hoja (las columnas) en vez de empezar otra (el salto de sección). */
  continuous: boolean
  blocks: JSONContent[]
}

/**
 * Reparte los bloques de primer nivel en secciones de Word. En Word las columnas son de la
 * sección, así que un bloque de columnas se escribe como una sección continua con `w:cols`, entre
 * otras dos continuas. Las secciones continuas vacías se quitan (en Word serían un renglón en blanco).
 */
export function planDocxSections(blocks: JSONContent[], documentSetup: PageSetup): DocxSectionPlan[] {
  const plans: DocxSectionPlan[] = [{ setup: documentSetup, columns: 1, continuous: false, blocks: [] }]
  const current = () => plans[plans.length - 1]
  for (const block of blocks) {
    if (block.type === SECTION_BREAK) {
      const setup = sectionBreakSetup({ type: SECTION_BREAK, attrs: block.attrs }, current().setup)
      plans.push({ setup, columns: 1, continuous: false, blocks: [] })
    } else if (block.type === COLUMNS) {
      const { setup } = current()
      plans.push({
        setup,
        columns: normalizeColumnCount(block.attrs?.count),
        continuous: true,
        blocks: block.content ?? []
      })
      plans.push({ setup, columns: 1, continuous: true, blocks: [] })
    } else {
      current().blocks.push(block)
    }
  }
  const kept = plans.filter((plan, index) => plan.blocks.length > 0 || (index > 0 && !plan.continuous))
  if (kept.length === 0) return [plans[0]]
  // La primera sección del documento no "continúa" nada.
  return [{ ...kept[0], continuous: false }, ...kept.slice(1)]
}

/** Recorre el árbol de nodos. Guarda estado (listas abiertas) por eso es una clase y no funciones sueltas. */
class DocxConverter {
  /** Cada lista nueva reinicia su numeración con una "instancia" distinta. */
  private nextListInstance = 1
  /** Viñetas de la biblioteca que usa el documento (cada una es una definición de lista en Word). */
  readonly bulletStyles = new Set<string>()
  readonly numberedLists = new Map<string, { start: number; format: NumberFormat }>()
  /** Word numera los comentarios; nosotros usamos ids de texto. */
  private readonly commentNumbers: Map<string, number>
  /**
   * Trozos de texto que le quedan a cada comentario. Un comentario puede abarcar varios nodos (y
   * párrafos): el inicio va antes del primero y el final después del último.
   */
  private readonly pendingCommentTexts = new Map<string, number>()
  private readonly totalCommentTexts = new Map<string, number>()
  /** Ancho útil de la hoja: lo que ocupan las tablas y lo máximo que puede medir una imagen. */
  private contentWidthTwips = 0
  private maxImageWidthPx = 0
  /** Autor del documento: el valor que llevan escrito los campos Autor. */
  author = ''

  constructor(comments: WriterComment[], doc: JSONContent, contentWidthCm: number) {
    this.setContentWidth(contentWidthCm)
    this.commentNumbers = new Map(comments.map((comment, index) => [comment.id, index]))
    countCommentTexts(doc, this.totalCommentTexts)
    for (const [id, count] of this.totalCommentTexts) this.pendingCommentTexts.set(id, count)
  }

  /** Cada sección tiene su ancho útil (una horizontal es más ancha). */
  setContentWidth(contentWidthCm: number): void {
    this.contentWidthTwips = twips(contentWidthCm)
    this.maxImageWidthPx = Math.round(contentWidthCm * PX_PER_CM)
  }

  blocks(nodes: JSONContent[], list?: ListContext): DocxBlock[] {
    return nodes.flatMap((node) => this.block(node, list))
  }

  private block(node: JSONContent, list?: ListContext): DocxBlock[] {
    switch (node.type) {
      case 'paragraph':
        return [this.paragraph(node, list)]
      case 'heading':
        return [this.paragraph(node, list)]
      case 'bulletList': {
        const bulletId = (node.attrs?.bulletStyle as string | null) ?? undefined
        if (bulletId) this.bulletStyles.add(bulletId)
        return this.list(node, bulletListReference(bulletId), list)
      }
      case 'orderedList': {
        const start = Number(node.attrs?.start) || 1
        const format = (node.attrs?.numberFormat as NumberFormat | null) ?? 'decimal'
        const reference = numberedListReference(start, format)
        this.numberedLists.set(reference, { start, format })
        return this.list(node, reference, list)
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
        return [objectParagraph(node, imageRun(node, this.maxImageWidthPx))]
      case 'shape':
        return [objectParagraph(node, shapeRun(node))]
      case 'textBox':
        return [
          objectParagraph(
            node,
            textBoxRun(
              node,
              this.blocks(node.content ?? []).filter((block): block is Paragraph => block instanceof Paragraph)
            )
          )
        ]
      case 'pageBreak':
        // Como hace Word con Ctrl+Intro: un párrafo que solo contiene el salto.
        return [new Paragraph({ children: [new PageBreak()] })]
      case COLUMN_BREAK:
        return [new Paragraph({ children: [new ColumnBreak()] })]
      case COLUMNS:
        // Solo dentro de otra cosa (una lista): las de primer nivel ya son secciones de Word.
        return this.blocks(node.content ?? [])
      case SECTION_BREAK:
        return []
      case 'table':
        return [this.table(node, this.contentWidthTwips)]
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
      options.heading = HEADING_BY_LEVEL[attrs.level as keyof typeof HEADING_BY_LEVEL] ?? HeadingLevel.HEADING_1
    } else if (attrs.blockStyle === 'title') {
      options.heading = HeadingLevel.TITLE
    } else if (typeof attrs.blockStyle === 'string' && attrs.blockStyle) {
      options.style = docxStyleId(attrs.blockStyle)
    }

    const alignment = ALIGNMENT[attrs.textAlign as keyof typeof ALIGNMENT]
    if (alignment && attrs.textAlign !== 'left') options.alignment = alignment

    if (list) {
      options.numbering = { reference: list.reference, level: list.level, instance: list.instance }
    } else if (continuationLevel !== undefined) {
      options.indent = { left: INDENT_STEP_TWIPS * (continuationLevel + 1) }
    } else if (attrs.indent > 0 || attrs.firstLineIndent) {
      options.indent = paragraphIndent(attrs.indent, attrs.firstLineIndent)
    }

    const indentRight = Number(attrs.indentRight)
    if (indentRight > 0) options.indent = { ...options.indent, right: twips(indentRight) }

    const spacing: { before?: number; after?: number; line?: number } = {}
    const lineHeight = Number(attrs.lineHeight)
    if (lineHeight > 0) spacing.line = Math.round(240 * lineHeight)
    if (typeof attrs.spaceBefore === 'number') spacing.before = Math.round(attrs.spaceBefore * 20)
    if (typeof attrs.spaceAfter === 'number') spacing.after = Math.round(attrs.spaceAfter * 20)
    if (Object.keys(spacing).length > 0) options.spacing = spacing

    const shading = cssColorToHex(attrs.shading)
    if (shading) options.shading = { type: ShadingType.CLEAR, fill: shading, color: 'auto' }
    const border = PARAGRAPH_BORDERS[attrs.border as ParagraphBorder]
    if (border) options.border = border
    const tabStops = (attrs.tabStops as TabStop[] | null) ?? []
    if (tabStops.length > 0) {
      options.tabStops = tabStops.map((stop) => ({
        type: TAB_TYPE[stop.align],
        position: twips(stop.position),
        leader: stop.leader === 'dot' ? LeaderType.DOT : undefined
      }))
    }

    return new Paragraph(options)
  }

  private inlines(nodes: JSONContent[]): ParagraphChild[] {
    return nodes.flatMap((node) => this.inline(node, node.marks ?? []))
  }

  private inline(node: JSONContent, marks: NonNullable<JSONContent['marks']>): ParagraphChild[] {
    if (node.type === 'hardBreak') return [new TextRun({ break: 1 })]
    if (node.type === 'tab') return [new TextRun({ ...runOptions(marks), children: [new Tab()] })]
    if (node.type === 'image') {
      const image = imageRun(node, this.maxImageWidthPx)
      return image ? [image] : []
    }
    if (node.type === BOOKMARK) {
      // Un marcador de Tintero es un punto: en Word, un w:bookmarkStart y su w:bookmarkEnd seguidos.
      const name = node.attrs?.name
      return typeof name === 'string' && name ? [new Bookmark({ id: name, children: [] })] : []
    }
    if (node.type === FIELD && isFieldKind(node.attrs?.kind)) {
      // Word recalcula fecha y páginas al abrir; el valor escrito es el que se ve hasta entonces.
      const kind = node.attrs.kind
      const cached = fieldText(kind, { date: new Date(), page: 1, pages: 1, fileName: '', author: this.author })
      return [new SimpleField(docxFieldInstruction(kind), kind === 'fileName' ? '' : cached)]
    }
    if (node.type !== 'text' || !node.text) return []

    const run = new TextRun({ text: node.text, ...runOptions(marks) })
    return this.withCommentRange(linked(run, marks), commentIdOf(marks))
  }

  private withCommentRange(text: ParagraphChild, commentId: string | null): ParagraphChild[] {
    const number = commentId === null ? undefined : this.commentNumbers.get(commentId)
    if (commentId === null || number === undefined) return [text]
    const pending = this.pendingCommentTexts.get(commentId) ?? 1
    const total = this.totalCommentTexts.get(commentId) ?? pending
    this.pendingCommentTexts.set(commentId, pending - 1)
    const children: ParagraphChild[] = []
    if (pending === total) children.push(new CommentRangeStart(number))
    children.push(text)
    if (pending === 1) {
      children.push(new CommentRangeEnd(number), new TextRun({ children: [new CommentReference(number)] }))
    }
    return children
  }
}

/** Texto dentro de su vínculo, si lo tiene: a un marcador (`#nombre`) o a una dirección. */
function linked(run: TextRun, marks: NonNullable<JSONContent['marks']>): ParagraphChild {
  const href = marks.find((mark) => mark.type === 'link')?.attrs?.href
  if (typeof href !== 'string' || !href) return run
  const anchor = bookmarkOfHref(href)
  return anchor
    ? new InternalHyperlink({ anchor, children: [run] })
    : new ExternalHyperlink({ link: href, children: [run] })
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
      case 'charStyle':
        if (typeof attrs.styleId === 'string') options.style = docxStyleId(attrs.styleId)
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

/** Sangría izquierda (en pasos de 1,27 cm) y de primera línea (cm, negativa = francesa) en twips. */
function paragraphIndent(
  steps: unknown,
  firstLineCm: unknown
): { left?: number; firstLine?: number; hanging?: number } {
  const indent: { left?: number; firstLine?: number; hanging?: number } = {}
  const left = Math.round(INDENT_STEP_TWIPS * (Number(steps) || 0))
  if (left > 0) indent.left = left
  const firstLine = Number(firstLineCm) || 0
  if (firstLine > 0) indent.firstLine = twips(firstLine)
  if (firstLine < 0) indent.hanging = twips(-firstLine)
  return indent
}

/** Configuración de página -> `w:sectPr`. La librería gira el tamaño ella misma con la orientación. */
function pageProperties(setup: PageSetup) {
  const { margins } = setup
  return {
    size: {
      width: twips(setup.size.width),
      height: twips(setup.size.height),
      orientation: setup.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT
    },
    margin: {
      top: twips(margins.top),
      bottom: twips(margins.bottom),
      left: twips(margins.left),
      right: twips(margins.right)
    }
  }
}

function contentWidthCm(setup: PageSetup): number {
  return orientedSize(setup).width - setup.margins.left - setup.margins.right
}

function commentIdOf(marks: NonNullable<JSONContent['marks']>): string | null {
  const id = marks.find((mark) => mark.type === 'comment')?.attrs?.commentId
  return typeof id === 'string' && id ? id : null
}

function countCommentTexts(node: JSONContent, counts: Map<string, number>): void {
  const id = node.type === 'text' && node.text ? commentIdOf(node.marks ?? []) : null
  if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  node.content?.forEach((child) => countCommentTexts(child, counts))
}

function commentOptions(comment: WriterComment, index: number) {
  const date = comment.date ? new Date(comment.date) : undefined
  return {
    id: index,
    author: comment.author || 'Tintero',
    date: date && !Number.isNaN(date.getTime()) ? date : undefined,
    children: comment.text.split('\n').map((line) => new Paragraph({ children: [new TextRun(line)] }))
  }
}

const PAGE_TOKENS = new RegExp(`(${escapeRegExp(PAGE_NUMBER_TOKEN)}|${escapeRegExp(PAGE_COUNT_TOKEN)})`)

/** Encabezado o pie -> párrafos de Word, con los marcadores cambiados por campos de número de página. */
function headerFooterParagraphs(part: HeaderFooter): Paragraph[] {
  return part.text.split('\n').map(
    (line) =>
      new Paragraph({
        alignment: ALIGNMENT[part.align],
        children: line
          .split(PAGE_TOKENS)
          .filter((piece) => piece !== '')
          .map((piece) => {
            if (piece === PAGE_NUMBER_TOKEN) return new TextRun({ children: [PageNumber.CURRENT] })
            if (piece === PAGE_COUNT_TOKEN) return new TextRun({ children: [PageNumber.TOTAL_PAGES] })
            return new TextRun(piece)
          })
      })
  )
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function codeLines(node: JSONContent): string[] {
  const text = (node.content ?? []).map((child) => child.text ?? '').join('')
  return text.split('\n')
}
