import type { JSONContent } from '@tiptap/core'
import { isDefaultPageSetup, normalizePageSetup, type PageSetup } from './pageSetup'
import { isDefaultStyles, normalizeStyles, type WriterStyle } from './styles'

export type HeaderFooterAlign = 'left' | 'center' | 'right'

/**
 * Encabezado o pie de página: texto plano (una línea por párrafo) con marcadores para el número
 * de página. Es deliberadamente más simple que el cuerpo: en la práctica casi todos los
 * encabezados son "título · fecha" o "Página 3 de 10".
 */
export interface HeaderFooter {
  text: string
  align: HeaderFooterAlign
}

/** Marcadores que se sustituyen al imprimir. Se guardan tal cual en el archivo. */
export const PAGE_NUMBER_TOKEN = '{página}'
export const PAGE_COUNT_TOKEN = '{páginas}'

/**
 * Comentario al margen. El texto comentado se marca en el documento con la marca `comment`
 * (atributo `commentId`); aquí está el contenido del comentario.
 */
export interface WriterComment {
  id: string
  author: string
  /** Fecha ISO 8601, si el archivo la trae. */
  date?: string
  text: string
}

/** Encabezado y pie de una variante de hoja (primera, pares). */
export interface HeaderFooterSet {
  header?: HeaderFooter
  footer?: HeaderFooter
}

/** Contenido de un documento de texto tal y como se guarda en disco. */
export interface WriterContent {
  /** Documento en el formato JSON de ProseMirror/Tiptap. */
  doc: JSONContent
  header?: HeaderFooter
  footer?: HeaderFooter
  comments?: WriterComment[]
  /** Tamaño, orientación y márgenes. Sin él, A4 vertical con 2,5 cm (formato v4; ver pageSetup.ts). */
  pageSetup?: PageSetup
  /** Estilos del documento (fase 13). Sin ellos, los de partida (DEFAULT_STYLES). */
  styles?: WriterStyle[]
  /** Lista multinivel ligada a los títulos: 1, 1.1, 1.1.1… */
  numberedHeadings?: boolean
  /** Guiones automáticos al final de renglón (fase 15). Sin él, no se parten palabras. */
  hyphenation?: boolean
  /**
   * "Primera página diferente" (fase 15): si está, la primera hoja usa este encabezado y pie (sin
   * nada dentro, la primera hoja va sin encabezado ni pie, que es para lo que más se usa).
   */
  firstPage?: HeaderFooterSet
  /** "Pares e impares diferentes": si está, las hojas pares usan este encabezado y pie. */
  evenPages?: HeaderFooterSet
}

/** Todo lo del documento salvo el cuerpo: lo que el editor guarda aparte del estado de Tiptap. */
export type WriterParts = Omit<WriterContent, 'doc'>

export function writerParts(content: WriterContent): WriterParts {
  const parts: WriterParts = {}
  if (content.header) parts.header = content.header
  if (content.footer) parts.footer = content.footer
  if (content.comments && content.comments.length > 0) parts.comments = content.comments
  if (content.pageSetup) parts.pageSetup = content.pageSetup
  if (content.styles) parts.styles = content.styles
  if (content.numberedHeadings) parts.numberedHeadings = true
  if (content.hyphenation) parts.hyphenation = true
  if (content.firstPage) parts.firstPage = content.firstPage
  if (content.evenPages) parts.evenPages = content.evenPages
  return parts
}

/** Cambia los estilos. Los de partida no se guardan: el archivo queda igual que antes de la fase 13. */
export function withStyles(parts: WriterParts, styles: WriterStyle[]): WriterParts {
  const { styles: _previous, ...rest } = parts
  return isDefaultStyles(styles) ? rest : { ...rest, styles }
}

export function withNumberedHeadings(parts: WriterParts, numbered: boolean): WriterParts {
  const { numberedHeadings: _previous, ...rest } = parts
  return numbered ? { ...rest, numberedHeadings: true } : rest
}

export function withHyphenation(parts: WriterParts, hyphenation: boolean): WriterParts {
  const { hyphenation: _previous, ...rest } = parts
  return hyphenation ? { ...rest, hyphenation: true } : rest
}

/** Cambia la configuración de página. La de por defecto no se guarda: el archivo queda como en la v3. */
export function withPageSetup(parts: WriterParts, pageSetup: PageSetup): WriterParts {
  const { pageSetup: _previous, ...rest } = parts
  return isDefaultPageSetup(pageSetup) ? rest : { ...rest, pageSetup }
}

/** Cambia el encabezado o el pie sin tocar lo demás; sin valor, lo quita. */
export function withHeaderFooter(
  parts: WriterParts,
  part: 'header' | 'footer',
  value: HeaderFooter | undefined
): WriterParts {
  const { [part]: _previous, ...rest } = parts
  return value ? { ...rest, [part]: value } : rest
}

export function parseWriterContent(raw: unknown): WriterContent {
  const candidate = raw as Partial<WriterContent> | null
  if (!candidate || typeof candidate.doc !== 'object' || candidate.doc?.type !== 'doc') {
    throw new Error('El documento de texto está dañado.')
  }
  // Las partes opcionales se validan una a una: si alguna está mal, se descarta sin perder el documento.
  const content: WriterContent = { doc: candidate.doc }
  const header = parseHeaderFooter(candidate.header)
  if (header) content.header = header
  const footer = parseHeaderFooter(candidate.footer)
  if (footer) content.footer = footer
  const comments = Array.isArray(candidate.comments) ? candidate.comments.filter(isComment) : []
  if (comments.length > 0) content.comments = comments
  const pageSetup = normalizePageSetup(candidate.pageSetup)
  if (pageSetup && !isDefaultPageSetup(pageSetup)) content.pageSetup = pageSetup
  const styles = normalizeStyles(candidate.styles)
  if (styles && !isDefaultStyles(styles)) content.styles = styles
  if (candidate.numberedHeadings === true) content.numberedHeadings = true
  if (candidate.hyphenation === true) content.hyphenation = true
  const firstPage = parseHeaderFooterSet(candidate.firstPage)
  if (firstPage) content.firstPage = firstPage
  const evenPages = parseHeaderFooterSet(candidate.evenPages)
  if (evenPages) content.evenPages = evenPages
  return content
}

function parseHeaderFooterSet(raw: unknown): HeaderFooterSet | null {
  if (!raw || typeof raw !== 'object') return null
  const candidate = raw as Partial<Record<keyof HeaderFooterSet, unknown>>
  const set: HeaderFooterSet = {}
  const header = parseHeaderFooter(candidate.header)
  if (header) set.header = header
  const footer = parseHeaderFooter(candidate.footer)
  if (footer) set.footer = footer
  return set
}

function parseHeaderFooter(raw: unknown): HeaderFooter | null {
  const candidate = raw as Partial<HeaderFooter> | null | undefined
  if (!candidate || typeof candidate.text !== 'string' || candidate.text.trim() === '') return null
  const align = candidate.align === 'center' || candidate.align === 'right' ? candidate.align : 'left'
  return { text: candidate.text, align }
}

function isComment(raw: unknown): raw is WriterComment {
  const candidate = raw as Partial<WriterComment> | null
  return (
    !!candidate &&
    typeof candidate.id === 'string' &&
    typeof candidate.author === 'string' &&
    typeof candidate.text === 'string' &&
    (candidate.date === undefined || typeof candidate.date === 'string')
  )
}
