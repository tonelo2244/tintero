import type { JSONContent } from '@tiptap/core'

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

/** Contenido de un documento de texto tal y como se guarda en disco. */
export interface WriterContent {
  /** Documento en el formato JSON de ProseMirror/Tiptap. */
  doc: JSONContent
  header?: HeaderFooter
  footer?: HeaderFooter
  comments?: WriterComment[]
}

/** Todo lo del documento salvo el cuerpo: lo que el editor guarda aparte del estado de Tiptap. */
export type WriterParts = Omit<WriterContent, 'doc'>

export function writerParts(content: WriterContent): WriterParts {
  const parts: WriterParts = {}
  if (content.header) parts.header = content.header
  if (content.footer) parts.footer = content.footer
  if (content.comments && content.comments.length > 0) parts.comments = content.comments
  return parts
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
  return content
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
