import { attr, childElements, descendants, path, relationAttr } from '@/core/office/xml'
import {
  PAGE_COUNT_TOKEN,
  PAGE_NUMBER_TOKEN,
  type HeaderFooter,
  type HeaderFooterAlign,
  type WriterComment
} from '../content'

/**
 * Partes del .docx que mammoth no lee: encabezado, pie y el contenido de los comentarios.
 * Funciones puras sobre XML ya parseado; el zip lo abre importDocx.
 */

/** Campos de Word que conocemos -> marcador del modelo. */
const FIELD_TOKENS: Record<string, string> = {
  PAGE: PAGE_NUMBER_TOKEN,
  NUMPAGES: PAGE_COUNT_TOKEN,
  SECTIONPAGES: PAGE_COUNT_TOKEN
}

const ALIGN_BY_JC: Record<string, HeaderFooterAlign> = { center: 'center', right: 'right', end: 'right' }

/** Encabezado o pie (`word/header1.xml`, `word/footer1.xml`) -> texto plano con marcadores de página. */
export function readHeaderFooter(root: Element | null): HeaderFooter | null {
  if (!root) return null
  const paragraphs = childElements(root, 'p').concat(
    // Muchos encabezados ponen el texto en una tabla de una fila (izquierda | centro | derecha).
    descendants(root, 'tc').flatMap((cell) => childElements(cell, 'p'))
  )
  const lines = paragraphs.map(paragraphText).filter((line) => line.trim() !== '')
  if (lines.length === 0) return null
  const firstWithText = paragraphs.find((paragraph) => paragraphText(paragraph).trim() !== '')
  const align = ALIGN_BY_JC[attr(path(firstWithText, 'pPr', 'jc'), 'val') ?? ''] ?? 'left'
  return { text: lines.join('\n'), align }
}

/**
 * Texto de un párrafo, con los campos de número de página cambiados por marcadores.
 * Word escribe un campo de dos formas: `w:fldSimple` o, más a menudo, una secuencia de runs
 * `fldChar begin` · `instrText "PAGE"` · `fldChar separate` · resultado · `fldChar end`.
 * Del resultado (el número que había al guardar) no nos interesa nada: lo cambia el marcador.
 */
export function paragraphText(paragraph: Element): string {
  let text = ''
  let field: { instruction: string; inResult: boolean } | null = null
  const visit = (element: Element): void => {
    for (const node of childElements(element)) {
      switch (node.localName) {
        case 'fldSimple': {
          const token = fieldToken(attr(node, 'instr'))
          if (token) text += token
          else visit(node)
          break
        }
        case 'fldChar': {
          const type = attr(node, 'fldCharType')
          if (type === 'begin') field = { instruction: '', inResult: false }
          else if (type === 'separate' && field) {
            field.inResult = true
            const token = fieldToken(field.instruction)
            if (token) text += token
          } else if (type === 'end') field = null
          break
        }
        case 'instrText':
          if (field) field.instruction += node.textContent ?? ''
          break
        case 't':
          // Si el campo es uno de los nuestros, su resultado ya lo representa el marcador.
          if (!field || (field.inResult && !fieldToken(field.instruction))) text += node.textContent ?? ''
          break
        case 'tab':
          text += '\t'
          break
        case 'br':
          text += '\n'
          break
        case 'r':
        case 'hyperlink':
        case 'smartTag':
        case 'ins':
          visit(node)
          break
      }
    }
  }
  visit(paragraph)
  return text.replace(/\t+/g, '   ')
}

function fieldToken(instruction: string | null): string | null {
  const name = instruction?.trim().split(/\s+/)[0]?.toUpperCase()
  return (name && FIELD_TOKENS[name]) ?? null
}

/** Comentario de Word con su id original (el que usan `commentRangeStart/End` en el documento). */
export interface DocxComment {
  docxId: string
  comment: WriterComment
}

/** `word/comments.xml` -> comentarios. `createId` se inyecta para que los tests sean deterministas. */
export function readComments(root: Element | null, createId: () => string): DocxComment[] {
  return childElements(root, 'comment').flatMap((element) => {
    const docxId = attr(element, 'id')
    if (docxId === null) return []
    const text = childElements(element, 'p')
      .map(paragraphText)
      .filter((line) => line.trim() !== '')
      .join('\n')
    const date = attr(element, 'date')
    const comment: WriterComment = { id: createId(), author: attr(element, 'author') ?? '', text }
    if (date) comment.date = date
    return [{ docxId, comment }]
  })
}

/** Relación del encabezado/pie por defecto de la última sección (la que manda en casi todos los documentos). */
export function defaultHeaderFooterIds(documentRoot: Element): { header: string | null; footer: string | null } {
  const sections = descendants(documentRoot, 'sectPr')
  const section = sections.at(-1)
  const reference = (name: string): string | null => {
    const references = childElements(section, name)
    const chosen = references.find((ref) => attr(ref, 'type') === 'default') ?? references[0]
    return relationAttr(chosen, 'id')
  }
  return { header: reference('headerReference'), footer: reference('footerReference') }
}
