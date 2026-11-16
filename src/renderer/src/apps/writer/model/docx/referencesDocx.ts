import type { JSONContent } from '@tiptap/core'
import {
  Bookmark,
  EndnoteReferenceRun,
  FootnoteReferenceRun,
  Paragraph,
  SimpleField,
  TableOfContents,
  TextRun,
  type ParagraphChild
} from 'docx'
import {
  Bibliography,
  Citation,
  CitationStyle as DocxCitationStyle,
  createBibliography,
  SourceType as DocxSourceType,
  type Source as DocxSource
} from 'docx/bibliography'
import {
  CAPTION_STYLE_ID,
  CROSS_REFERENCE,
  crossReferenceText,
  isCrossReferenceShow,
  isReferenceAnchor,
  SEQUENCE,
  type ReferenceTarget
} from '../captions'
import { formatCitation, type CitationStyle, type Person, type Source, type SourceType } from '../citations'
import { BOOKMARK } from '../links'
import { isNoteKind } from '../notes'
import { isHeadingsToc, normalizeTocEntries, tocTitle } from '../toc'

/**
 * Referencias de la fase 17 en Word, nativas: notas en footnotes.xml y endnotes.xml, la tabla de
 * contenido como campo TOC (con sus entradas ya escritas), los títulos como campos SEQ, las
 * referencias cruzadas como REF/PAGEREF y las citas y la bibliografía como las de Word (fuentes en
 * el documento, que Word enseña en su Administrador de fuentes).
 */

/** Lo que el exportador necesita saber del documento entero antes de escribir: números y destinos. */
export interface ReferenceIndex {
  /** Número de cada secuencia, por su nodo (el exportador recibe los mismos objetos). */
  sequenceNumbers: Map<JSONContent, number>
  targets: Map<string, ReferenceTarget>
  /** Posición de cada referencia cruzada en el recorrido (para "más arriba / más abajo"). */
  positions: Map<JSONContent, number>
}

/** Recorre el JSON en orden de documento, como el editor (editor/references.ts) recorre el árbol. */
export function referenceIndex(doc: JSONContent): ReferenceIndex {
  const sequenceNumbers = new Map<JSONContent, number>()
  const counters = new Map<string, number>()
  const targets = new Map<string, ReferenceTarget>()
  const positions = new Map<JSONContent, number>()
  let position = 0
  const textOf = (nodes: JSONContent[], numbers: number[]) => {
    let next = 0
    return nodes
      .map((node) => {
        if (node.type === 'text') return node.text ?? ''
        if (node.type === SEQUENCE) return String(numbers[next++] ?? '')
        if (node.type === 'hardBreak' || node.type === 'tab') return ' '
        return ''
      })
      .join('')
  }
  const visit = (node: JSONContent) => {
    position++
    const isHeading = node.type === 'heading'
    const isCaption = node.type === 'paragraph' && node.attrs?.blockStyle === CAPTION_STYLE_ID
    if (isHeading || isCaption) {
      const children = node.content ?? []
      const numbers: number[] = []
      let label: string | undefined
      let captionStart = -1
      children.forEach((child, index) => {
        if (child.type !== SEQUENCE) return
        const name = String(child.attrs?.label ?? 'Figura')
        const number = (counters.get(name) ?? 0) + 1
        counters.set(name, number)
        numbers.push(number)
        sequenceNumbers.set(child, number)
        if (label === undefined) {
          label = name
          captionStart = index + 1
        }
      })
      const anchor = children.find((child) => child.type === BOOKMARK && isReferenceAnchor(String(child.attrs?.name)))
      if (anchor) {
        const name = String(anchor.attrs?.name)
        const text = textOf(children, numbers).replace(/\s+/g, ' ').trim()
        const target: ReferenceTarget = isHeading
          ? { kind: 'heading', anchor: name, pos: position, text, level: Number(node.attrs?.level) || 1 }
          : {
              kind: 'caption',
              anchor: name,
              pos: position,
              text,
              label,
              number: numbers[0],
              captionText: textOf(children.slice(captionStart), numbers.slice(1))
                .replace(/^[\s:.\-–—]+/, '')
                .trim()
            }
        targets.set(name, target)
      }
      children.forEach((child) => {
        if (child.type === CROSS_REFERENCE) positions.set(child, position)
      })
      return
    }
    if (node.type === SEQUENCE) {
      const name = String(node.attrs?.label ?? 'Figura')
      const number = (counters.get(name) ?? 0) + 1
      counters.set(name, number)
      sequenceNumbers.set(node, number)
    }
    if (node.type === CROSS_REFERENCE) positions.set(node, position)
    if (node.type === BOOKMARK) {
      const name = String(node.attrs?.name ?? '')
      if (name && !targets.has(name)) {
        targets.set(name, { kind: 'bookmark', anchor: name, pos: position, text: name })
      }
    }
    node.content?.forEach(visit)
  }
  visit(doc)
  return { sequenceNumbers, targets, positions }
}

/** Nota al pie o al final: Word la numera solo; aquí va su texto (un párrafo por renglón). */
export function noteRun(node: JSONContent): ParagraphChild {
  const lines = String(node.attrs?.text ?? '').split('\n')
  const content = { children: lines.map((line) => new Paragraph({ children: [new TextRun(line)] })) }
  const kind = isNoteKind(node.attrs?.kind) ? node.attrs.kind : 'footnote'
  return kind === 'endnote' ? new EndnoteReferenceRun(content) : new FootnoteReferenceRun(content)
}

/** Número de un título: SEQ Figura, con el número que tiene ahora como valor escrito. */
export const sequenceField = (label: string, number: number): ParagraphChild =>
  new SimpleField(`SEQ ${label} \\* ARABIC`, String(number))

/**
 * En Word, REF copia el texto que abarca el marcador, así que el de un encabezado o título lo envuelve
 * entero (el de Tintero es un punto). Un título lleva además dos marcadores dentro, como los que crea
 * Word: el rótulo y número ("Figura 3") y el texto del título, para "solo rótulo y número" y "solo texto".
 */
const LABEL_NUMBER_SUFFIX = '_n'
const CAPTION_TEXT_SUFFIX = '_c'

export function referenceAnchorChildren(
  node: JSONContent,
  convert: (nodes: JSONContent[]) => ParagraphChild[]
): ParagraphChild[] | null {
  const children = node.content ?? []
  const anchor = children.find((child) => child.type === BOOKMARK && isReferenceAnchor(String(child.attrs?.name)))
  if (!anchor) return null
  const name = String(anchor.attrs?.name)
  const rest = children.filter((child) => child !== anchor)
  const sequence = rest.findIndex((child) => child.type === SEQUENCE)
  if (node.attrs?.blockStyle !== CAPTION_STYLE_ID || sequence < 0) {
    return [new Bookmark({ id: name, children: convert(rest) })]
  }
  // El separador (": ") queda fuera de los dos marcadores interiores.
  const after = rest.slice(sequence + 1)
  const separator: JSONContent[] = []
  const first = after[0]
  const match = first?.type === 'text' ? /^[\s:.\-–—]+/.exec(first.text ?? '') : null
  if (first && match) {
    separator.push({ ...first, text: match[0] })
    const remainder = (first.text ?? '').slice(match[0].length)
    after.splice(0, 1, ...(remainder ? [{ ...first, text: remainder }] : []))
  }
  return [
    new Bookmark({
      id: name,
      children: [
        new Bookmark({ id: name + LABEL_NUMBER_SUFFIX, children: convert(rest.slice(0, sequence + 1)) }),
        ...convert(separator),
        new Bookmark({ id: name + CAPTION_TEXT_SUFFIX, children: convert(after) })
      ]
    })
  ]
}

/** Referencia cruzada: REF (texto), PAGEREF (página) o REF \p (más arriba / más abajo). */
export function crossReferenceField(node: JSONContent, index: ReferenceIndex): ParagraphChild {
  const anchor = String(node.attrs?.anchor ?? '')
  const show = isCrossReferenceShow(node.attrs?.show) ? node.attrs.show : 'text'
  const target = index.targets.get(anchor) ?? null
  // La página se calcula al abrir en Word (updateFields): aquí no hay paginación.
  const cached = crossReferenceText(show, target, { referencePos: index.positions.get(node) ?? 0, page: 1 })
  const bookmark =
    target?.kind === 'caption' && show === 'labelNumber'
      ? anchor + LABEL_NUMBER_SUFFIX
      : target?.kind === 'caption' && show === 'captionText'
        ? anchor + CAPTION_TEXT_SUFFIX
        : anchor
  const instruction =
    show === 'page'
      ? `PAGEREF ${bookmark} \\h`
      : show === 'position'
        ? `REF ${bookmark} \\p \\h`
        : `REF ${bookmark} \\h`
  return new SimpleField(instruction, cached)
}

/** La tabla de contenido: título y campo TOC con las entradas de la última actualización. */
export function tableOfContentsBlocks(node: JSONContent): (Paragraph | TableOfContents)[] {
  const source = String(node.attrs?.source ?? '')
  const levels = Math.min(9, Math.max(1, Number(node.attrs?.levels) || 3))
  const entries = normalizeTocEntries(node.attrs?.entries)
  const title = new Paragraph({ style: 'TOCHeading', children: [new TextRun(tocTitle(source))] })
  const toc = new TableOfContents(tocTitle(source), {
    hyperlink: true,
    ...(isHeadingsToc(source) ? { headingStyleRange: `1-${levels}` } : { captionLabelIncludingNumbers: source }),
    // Se escribe "limpia": Word la enseña tal cual, con nuestras páginas, hasta que se actualice.
    beginDirty: false,
    cachedEntries: entries.map((entry) => ({
      title: entry.text,
      level: entry.level,
      page: entry.page,
      href: entry.anchor
    }))
  })
  return [title, toc]
}

// --- Citas y bibliografía ---

const SOURCE_TYPE: Record<SourceType, (typeof DocxSourceType)[keyof typeof DocxSourceType]> = {
  book: DocxSourceType.BOOK,
  bookSection: DocxSourceType.BOOK_SECTION,
  journalArticle: DocxSourceType.JOURNAL_ARTICLE,
  website: DocxSourceType.WEBSITE,
  report: DocxSourceType.REPORT,
  other: DocxSourceType.MISCELLANEOUS
}

const docxPeople = (people: readonly Person[] | undefined) =>
  (people ?? []).map((person) => ({ lastName: person.family, ...(person.given && { firstName: person.given }) }))

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

/** Una fuente de Tintero, en los campos que usa Word. */
export function docxSource(source: Source): DocxSource {
  const container = source.container
  const accessed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(source.accessed ?? '')
  const url =
    source.url ??
    (source.doi ? `https://doi.org/${source.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}` : undefined)
  const optional: Record<string, unknown> = {
    corporateAuthor: source.authors.length === 0 ? source.corporateAuthor : undefined,
    editors: source.editors?.length ? docxPeople(source.editors) : undefined,
    year: source.year,
    publisher: source.publisher,
    city: source.city,
    edition: source.edition,
    volume: source.volume,
    issue: source.issue,
    pages: source.pages,
    reportType: source.reportType,
    url,
    journalName: source.type === 'journalArticle' ? container : undefined,
    bookTitle: source.type === 'bookSection' ? container : undefined,
    websiteName: source.type === 'website' ? container : undefined,
    publicationTitle: source.type === 'other' ? container : undefined,
    yearAccessed: accessed?.[1],
    monthAccessed: accessed ? MONTHS[Number(accessed[2]) - 1] : undefined,
    dayAccessed: accessed ? String(Number(accessed[3])) : undefined
  }
  return {
    tag: source.id,
    type: SOURCE_TYPE[source.type],
    authors: docxPeople(source.authors),
    title: source.title,
    ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== undefined && value !== ''))
  }
}

export function documentBibliography(sources: readonly Source[], style: CitationStyle) {
  return createBibliography({
    style: style === 'iso690' ? DocxCitationStyle.ISO_690_FIRST_ELEMENT_AND_DATE : DocxCitationStyle.APA,
    sources: sources.map(docxSource)
  })
}

/** Cita: la de Word si la fuente existe; si se borró, su texto tal cual (Word no admite citas rotas). */
export function citationRun(node: JSONContent, sources: readonly Source[], style: CitationStyle): ParagraphChild {
  const sourceId = String(node.attrs?.sourceId ?? '')
  const pages = String(node.attrs?.pages ?? '').trim()
  const source = sources.find((candidate) => candidate.id === sourceId)
  if (!source) return new TextRun(formatCitation(undefined, style))
  return new Citation(pages ? { source: sourceId, pages } : sourceId)
}

export function bibliographyBlock(node: JSONContent, sources: readonly Source[]): Bibliography | null {
  if (sources.length === 0) return null
  const title = String(node.attrs?.title ?? '')
  return new Bibliography(title ? { title } : {})
}
