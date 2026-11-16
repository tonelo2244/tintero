import { attr, child, descendants, path } from '@/core/office/xml'
import { cssFontFamilyFor } from '@/ui/fonts'
import type { PageSetup } from '../pageSetup'
import { readSectionSetup } from './docxParts'
import { MAX_COLUMNS } from '../columns'
import {
  BULLET_STYLES,
  INDENT_STEP_CM,
  type NumberFormat,
  type ParagraphBorder,
  type TabAlign,
  type TabStop
} from '../paragraphFormat'

/**
 * Formato "directo" de Word (fuente, tamaño, color, resaltado, alineación) y comentarios.
 *
 * mammoth descarta estos atributos por diseño. En vez de reescribir todo el importador, leemos
 * nosotros el XML y dejamos *marcas invisibles* en el propio texto antes de dárselo a mammoth:
 *
 *   <w:t>Hola</w:t>  ->  <w:t>r3HolaR</w:t>
 *
 * mammoth copia el texto tal cual al HTML, así que las marcas salen en el sitio exacto, dentro
 * del párrafo, enlace o celda que les corresponda. Después las cambiamos por `<span style>` y
 * `text-align`, que el editor sí entiende. La ventaja frente a emparejar "el párrafo n de mammoth
 * con el párrafo n del XML" es que no hay nada que emparejar: la posición la conserva mammoth.
 *
 * Las marcas usan caracteres de uso privado de Unicode (U+E000...), que ningún documento real usa
 * para texto visible. Si alguna quedase suelta, se borra al final.
 */

const OPEN = ''
const CLOSE = ''
const MARKER = /([rRpcC])([^]*)/g
const STRAY_MARKERS = /[]/g

export type DocxAlignment = 'center' | 'right' | 'justify'

export interface DocxRunFormat {
  /** Valor CSS de `font-family`. */
  fontFamily?: string
  /** Puntos. */
  fontSize?: number
  /** "#rrggbb". */
  color?: string
  /** "#rrggbb". */
  highlight?: string
}

/** Formato de párrafo que mammoth no lee. Sangrías en centímetros. */
export interface DocxParagraphFormat {
  align?: DocxAlignment
  /** Sangría izquierda. */
  indentLeft?: number
  /** Primera línea respecto a la izquierda; negativa es francesa. */
  firstLine?: number
  /** `w:pageBreakBefore`: el párrafo empieza hoja nueva. */
  pageBreakBefore?: boolean
  /** Fase 13: espaciado (pt), interlineado múltiple, sangría derecha (cm), sombreado, bordes y topes. */
  spaceBefore?: number
  spaceAfter?: number
  lineHeight?: number
  indentRight?: number
  shading?: string
  border?: ParagraphBorder
  tabStops?: TabStop[]
  /** Formato de la lista a la que pertenece (solo el primer nivel; los anidados siguen la rotación). */
  list?: { bullet: string } | { numberFormat: NumberFormat }
  /**
   * El párrafo cierra una sección (lleva `w:sectPr`): detrás va un salto de sección con la hoja de
   * la sección siguiente (fase 15).
   */
  nextSection?: PageSetup
  /** El párrafo cierra una sección con estas columnas (`w:cols`): sus bloques van en columnas. */
  sectionEnd?: { columns: number }
}

export interface DocxAnnotations {
  formats: DocxRunFormat[]
  paragraphs: DocxParagraphFormat[]
  /** Columnas de la última sección (la del cuerpo, que no cierra ningún párrafo). */
  lastSectionColumns?: number
}

const TWIPS_PER_CM = 1440 / 2.54

const ALIGNMENTS: Record<string, DocxAlignment> = {
  center: 'center',
  right: 'right',
  end: 'right',
  both: 'justify',
  distribute: 'justify'
}

/** Los 16 colores de resaltado de Word. */
const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: '#ffff00',
  green: '#00ff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  blue: '#0000ff',
  red: '#ff0000',
  darkBlue: '#000080',
  darkCyan: '#008080',
  darkGreen: '#008000',
  darkMagenta: '#800080',
  darkRed: '#800000',
  darkYellow: '#808000',
  darkGray: '#808080',
  lightGray: '#c0c0c0',
  black: '#000000',
  white: '#ffffff'
}

const marker = (kind: string, payload = ''): string => `${OPEN}${kind}${payload}${CLOSE}`

/**
 * Deja las marcas en `word/document.xml`. `styles` es `word/styles.xml` (si existe): sirve para
 * no marcar lo que coincide con el estilo por defecto, que sería ruido en cada palabra.
 */
export function annotateDocumentXml(
  documentXml: string,
  stylesXml: string | null,
  numberingXml: string | null = null
): {
  xml: string
  annotations: DocxAnnotations
} {
  const document = new DOMParser().parseFromString(documentXml, 'application/xml')
  const root = document.documentElement
  const defaults = stylesXml ? readDefaultFormat(new DOMParser().parseFromString(stylesXml, 'application/xml')) : {}
  const formats: DocxRunFormat[] = []
  const paragraphs: DocxParagraphFormat[] = []
  const listFormats = numberingXml
    ? readListFormats(new DOMParser().parseFromString(numberingXml, 'application/xml'))
    : null

  for (const run of descendants(root, 'r')) {
    const format = withoutDefaults(readRunFormat(child(run, 'rPr')), defaults)
    if (Object.keys(format).length === 0) continue
    const id = formats.push(format) - 1
    for (const text of descendants(run, 't')) {
      text.textContent = `${marker('r', String(id))}${text.textContent ?? ''}${marker('R')}`
    }
  }

  // Secciones: Word guarda la hoja de cada una al final (en el último párrafo, y la última en el
  // cuerpo). Tintero la guarda en el salto que la abre: la del párrafo n es la sección n + 1.
  const sections = descendants(root, 'sectPr')
  for (const paragraph of descendants(root, 'p')) {
    const format = readParagraphFormat(child(paragraph, 'pPr'), listFormats)
    const sectionIndex = sections.indexOf(child(child(paragraph, 'pPr'), 'sectPr') as Element)
    // Una sección "continua" sigue en la misma hoja: no es un salto de sección de Tintero.
    const next = sections[sectionIndex + 1] ?? null
    const nextSection = sectionIndex >= 0 && !isContinuous(next) ? readSectionSetup(next) : null
    if (nextSection) format.nextSection = nextSection
    if (sectionIndex >= 0) format.sectionEnd = { columns: columnCount(sections[sectionIndex]) }
    if (Object.keys(format).length === 0) continue
    let firstText = descendants(paragraph, 't').find((text) => ownParagraph(text) === paragraph)
    // Word suele cerrar la sección en un párrafo vacío: se le da un texto vacío para llevar la marca.
    if (!firstText && format.sectionEnd) firstText = appendEmptyRun(paragraph)
    if (!firstText) continue // párrafo vacío: ni alineación ni sangría se notan
    const id = paragraphs.push(format) - 1
    firstText.textContent = `${marker('p', String(id))}${firstText.textContent ?? ''}`
  }

  for (const start of descendants(root, 'commentRangeStart'))
    insertMarkerRun(start, marker('c', attr(start, 'id') ?? ''))
  for (const end of descendants(root, 'commentRangeEnd')) insertMarkerRun(end, marker('C', attr(end, 'id') ?? ''))

  const annotations: DocxAnnotations = { formats, paragraphs }
  const lastColumns = columnCount(sections.at(-1) ?? null)
  if (lastColumns > 1) annotations.lastSectionColumns = lastColumns
  return { xml: new XMLSerializer().serializeToString(document), annotations }
}

function isContinuous(section: Element | null): boolean {
  return attr(child(section, 'type'), 'val') === 'continuous'
}

/** Columnas de una sección (`w:cols w:num`); 1 si no dice nada. */
function columnCount(section: Element | null): number {
  const count = Number(attr(child(section, 'cols'), 'num'))
  return Number.isFinite(count) && count > 1 ? Math.min(MAX_COLUMNS, Math.round(count)) : 1
}

/**
 * Mete en un bloque de columnas los bloques de cada sección de Word que tenga columnas. Las
 * secciones las delimitan las marcas `hr[data-docx-section-end]` que deja applyParagraphFormat.
 */
function groupSectionColumns(body: HTMLElement, lastSectionColumns: number): void {
  let pending: Element[] = []
  const wrap = (columns: number) => {
    if (columns > 1 && pending.length > 0) {
      const container = body.ownerDocument.createElement('div')
      container.setAttribute('data-columns', String(columns))
      pending[0].before(container)
      container.append(...pending)
    }
    pending = []
  }
  for (const element of [...body.children]) {
    if (element.matches('hr[data-docx-section-end]')) {
      wrap(Number(element.getAttribute('data-columns')) || 1)
      element.remove()
    } else if (!element.matches('hr[data-section-break]')) {
      pending.push(element)
    }
  }
  wrap(lastSectionColumns)
}

/** Añade `<w:r><w:t/></w:r>` al párrafo y devuelve el `w:t`. */
function appendEmptyRun(paragraph: Element): Element {
  const namespace = paragraph.namespaceURI
  const run = paragraph.ownerDocument.createElementNS(namespace, 'w:r')
  const text = paragraph.ownerDocument.createElementNS(namespace, 'w:t')
  run.appendChild(text)
  paragraph.appendChild(run)
  return text
}

/** Párrafo al que pertenece un texto (un cuadro de texto puede tener párrafos dentro de otro). */
function ownParagraph(element: Element): Element | null {
  let current = element.parentElement
  while (current && current.localName !== 'p') current = current.parentElement
  return current
}

/**
 * Inserta un run con la marca junto a `anchor`. Word permite los límites de un comentario
 * entre párrafos; mammoth solo lee runs dentro de un párrafo, así que en ese caso la marca va
 * al principio del párrafo siguiente.
 */
function insertMarkerRun(anchor: Element, text: string): void {
  const namespace = anchor.namespaceURI
  const prefix = anchor.prefix ? `${anchor.prefix}:` : ''
  const run = anchor.ownerDocument.createElementNS(namespace, `${prefix}r`)
  const runText = anchor.ownerDocument.createElementNS(namespace, `${prefix}t`)
  runText.textContent = text
  run.appendChild(runText)

  const parent = anchor.parentElement
  if (parent && (parent.localName === 'p' || parent.localName === 'hyperlink')) {
    parent.insertBefore(run, anchor)
    return
  }
  let next = anchor.nextElementSibling
  while (next && next.localName !== 'p') next = next.nextElementSibling
  if (next) next.insertBefore(run, next.firstChild)
}

function readParagraphFormat(properties: Element | null, listFormats: ListFormats | null): DocxParagraphFormat {
  if (!properties) return {}
  const format: DocxParagraphFormat = {}
  const align = ALIGNMENTS[attr(child(properties, 'jc'), 'val') ?? '']
  if (align) format.align = align
  const indent = child(properties, 'ind')
  // Sin redondear aquí: la izquierda se pasa luego a pasos de 1,27 cm y un redondeo previo se notaría.
  const cm = (name: string) => {
    const value = Number(attr(indent, name))
    return Number.isFinite(value) && value !== 0 ? value / TWIPS_PER_CM : null
  }
  const round2 = (value: number | null) => (value === null ? null : Math.round(value * 100) / 100)
  const left = cm('left') ?? cm('start')
  if (left !== null && left > 0) format.indentLeft = left
  const firstLine = round2(cm('firstLine'))
  const hanging = round2(cm('hanging'))
  if (hanging !== null) format.firstLine = -hanging
  else if (firstLine !== null) format.firstLine = firstLine
  const pageBreak = child(properties, 'pageBreakBefore')
  if (pageBreak && !['0', 'false', 'off'].includes(attr(pageBreak, 'val') ?? '')) format.pageBreakBefore = true

  const right = round2(cm('right') ?? cm('end'))
  if (right !== null && right > 0) format.indentRight = right
  const spacing = child(properties, 'spacing')
  const points = (name: string) => {
    const value = attr(spacing, name)
    return value !== null && Number.isFinite(Number(value)) ? Number(value) / 20 : null
  }
  const before = points('before')
  if (before !== null) format.spaceBefore = before
  const after = points('after')
  if (after !== null) format.spaceAfter = after
  const line = Number(attr(spacing, 'line'))
  if (line > 0 && (attr(spacing, 'lineRule') ?? 'auto') === 'auto')
    format.lineHeight = Math.round((line / 240) * 100) / 100
  const shading = hexColor(attr(child(properties, 'shd'), 'fill'))
  if (shading) format.shading = shading
  const border = readBorder(child(properties, 'pBdr'))
  if (border) format.border = border
  const tabStops = readTabStops(child(properties, 'tabs'))
  if (tabStops.length > 0) format.tabStops = tabStops
  const numbering = child(properties, 'numPr')
  if (numbering && listFormats && (attr(child(numbering, 'ilvl'), 'val') ?? '0') === '0') {
    const list = listFormats.get(attr(child(numbering, 'numId'), 'val') ?? '')
    if (list) format.list = list
  }
  return format
}

const TAB_ALIGNS: Record<string, TabAlign> = {
  left: 'left',
  start: 'left',
  center: 'center',
  right: 'right',
  end: 'right',
  decimal: 'decimal'
}

function readTabStops(tabs: Element | null): TabStop[] {
  const stops: TabStop[] = []
  for (const tab of tabs ? [...tabs.children].filter((element) => element.localName === 'tab') : []) {
    const align = TAB_ALIGNS[attr(tab, 'val') ?? '']
    const position = Number(attr(tab, 'pos'))
    if (!align || !(position > 0)) continue // "clear" y "bar" no son topes de texto
    const stop: TabStop = { position: Math.round((position / TWIPS_PER_CM) * 100) / 100, align }
    if (['dot', 'middleDot'].includes(attr(tab, 'leader') ?? '')) stop.leader = 'dot'
    stops.push(stop)
  }
  return stops.sort((a, b) => a.position - b.position)
}

/** Bordes de Word -> los del editor: los cuatro es "cuadro"; si no, el más significativo. */
function readBorder(borders: Element | null): ParagraphBorder | null {
  if (!borders) return null
  const has = (side: string) => {
    const value = attr(child(borders, side), 'val')
    return value !== null && value !== 'nil' && value !== 'none'
  }
  if (has('top') && has('bottom') && has('left') && has('right')) return 'box'
  if (has('left')) return 'left'
  if (has('bottom')) return 'bottom'
  if (has('top')) return 'top'
  return null
}

/** numId -> formato del primer nivel de su lista (word/numbering.xml). */
type ListFormats = Map<string, NonNullable<DocxParagraphFormat['list']>>

const WORD_NUMBER_FORMATS: Record<string, Record<string, NumberFormat>> = {
  decimal: { '.': 'decimal', ')': 'decimal-paren' },
  lowerLetter: { '.': 'lower-alpha', ')': 'lower-alpha-paren' },
  upperLetter: { '.': 'upper-alpha' },
  lowerRoman: { '.': 'lower-roman' },
  upperRoman: { '.': 'upper-roman' }
}

function readListFormats(numbering: Document): ListFormats {
  const root = numbering.documentElement
  const abstract = new Map<string, NonNullable<DocxParagraphFormat['list']>>()
  for (const definition of descendants(root, 'abstractNum')) {
    const levels = descendants(definition, 'lvl')
    const level = (index: string) => levels.find((lvl) => attr(lvl, 'ilvl') === index)
    const first = level('0')
    const kind = attr(child(first ?? null, 'numFmt'), 'val')
    const text = attr(child(first ?? null, 'lvlText'), 'val') ?? ''
    let format: NonNullable<DocxParagraphFormat['list']> | null = null
    if (kind === 'bullet') {
      const bullet = BULLET_STYLES.find((candidate) => candidate.symbol === text.trim())
      if (bullet && bullet.id !== 'disc') format = { bullet: bullet.id }
    } else if (kind) {
      const second = attr(child(level('1') ?? null, 'lvlText'), 'val') ?? ''
      const numberFormat =
        kind === 'decimal' && /^%1\.%2\.?$/.test(second)
          ? 'legal'
          : WORD_NUMBER_FORMATS[kind]?.[text.replace('%1', '').trim()]
      if (numberFormat && numberFormat !== 'decimal') format = { numberFormat }
    }
    const id = attr(definition, 'abstractNumId')
    if (format && id) abstract.set(id, format)
  }
  const formats: ListFormats = new Map()
  for (const num of descendants(root, 'num')) {
    const format = abstract.get(attr(child(num, 'abstractNumId'), 'val') ?? '')
    const id = attr(num, 'numId')
    if (format && id) formats.set(id, format)
  }
  return formats
}

function readRunFormat(properties: Element | null): DocxRunFormat {
  if (!properties) return {}
  const format: DocxRunFormat = {}
  const fonts = child(properties, 'rFonts')
  const font = attr(fonts, 'ascii') ?? attr(fonts, 'hAnsi')
  if (font) format.fontFamily = cssFontFamilyFor(font)
  const halfPoints = Number(attr(child(properties, 'sz'), 'val'))
  if (halfPoints > 0) format.fontSize = halfPoints / 2
  const color = hexColor(attr(child(properties, 'color'), 'val'))
  if (color) format.color = color
  // Word tiene dos formas de "resaltar": el resaltado (16 colores) y el sombreado (cualquier color,
  // es lo que escribe nuestro exportador).
  const highlight =
    HIGHLIGHT_COLORS[attr(child(properties, 'highlight'), 'val') ?? ''] ??
    hexColor(attr(child(properties, 'shd'), 'fill'))
  if (highlight) format.highlight = highlight
  return format
}

/** Formato de los párrafos normales: valores por defecto del documento y estilo "Normal". */
function readDefaultFormat(styles: Document): DocxRunFormat {
  const root = styles.documentElement
  const base = readRunFormat(path(root, 'docDefaults', 'rPrDefault', 'rPr'))
  const normal = descendants(root, 'style').find(
    (style) => attr(style, 'type') === 'paragraph' && attr(style, 'default') === '1'
  )
  return { ...base, ...readRunFormat(child(normal ?? null, 'rPr')) }
}

function withoutDefaults(format: DocxRunFormat, defaults: DocxRunFormat): DocxRunFormat {
  const result: DocxRunFormat = {}
  for (const key of Object.keys(format) as (keyof DocxRunFormat)[]) {
    if (format[key] !== defaults[key]) Object.assign(result, { [key]: format[key] })
  }
  return result
}

function hexColor(value: string | null): string | null {
  return value && /^[0-9a-f]{6}$/i.test(value) ? `#${value.toLowerCase()}` : null
}

/** Lo que no se pudo colocar al aplicar las marcas (para avisar al usuario). */
export interface AnnotationLosses {
  /** Párrafos alineados que no llegan al editor como párrafo (por ejemplo, dentro de una lista). */
  alignedParagraphs: number
}

const ALIGNABLE_BLOCKS = 'p, h1, h2, h3, h4, h5, h6'

/**
 * Cambia las marcas del HTML de mammoth por formato que entiende el editor:
 *   - run con formato   -> `<span style="font-family; font-size; color">` y `<mark data-color>`
 *   - párrafo alineado  -> `style="text-align"` en el párrafo
 *   - comentario        -> `<span data-comment-id>` sobre el texto comentado (puede cruzar párrafos)
 *
 * `commentIds` traduce los ids de Word a los nuestros; un comentario sin traducción se ignora.
 */
export function applyAnnotations(
  body: HTMLElement,
  annotations: DocxAnnotations,
  commentIds: ReadonlyMap<string, string>
): AnnotationLosses {
  const losses: AnnotationLosses = { alignedParagraphs: 0 }
  const documentRef = body.ownerDocument
  const walker = documentRef.createTreeWalker(body, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text)

  let format: DocxRunFormat | null = null
  const openComments: string[] = []

  for (const node of textNodes) {
    const value = node.data
    if (!value.includes(OPEN) && !format && openComments.length === 0) continue

    const fragment = documentRef.createDocumentFragment()
    let last = 0
    const flush = (text: string): void => {
      if (text) fragment.appendChild(wrapSegment(documentRef, text, format, openComments.at(-1)))
    }
    for (const match of value.matchAll(MARKER)) {
      flush(value.slice(last, match.index))
      last = match.index + match[0].length
      const [, kind, payload] = match
      if (kind === 'r') format = annotations.formats[Number(payload)] ?? null
      else if (kind === 'R') format = null
      else if (kind === 'p') {
        const format = annotations.paragraphs[Number(payload)]
        const block = node.parentElement?.closest(ALIGNABLE_BLOCKS)
        if (format && block instanceof HTMLElement) applyParagraphFormat(block, format)
        else {
          // mammoth escribe los elementos de lista sin <p>: ahí solo se aprovecha el formato de la lista.
          const item = node.parentElement?.closest('li')
          if (format?.list && item) applyListFormat(item, format.list)
          if (format?.align) losses.alignedParagraphs++
        }
      } else if (kind === 'c') {
        const id = commentIds.get(payload)
        if (id) openComments.push(id)
      } else if (kind === 'C') {
        const id = commentIds.get(payload)
        const index = id ? openComments.lastIndexOf(id) : -1
        if (index >= 0) openComments.splice(index, 1)
      }
    }
    flush(value.slice(last))
    node.replaceWith(fragment)
  }

  // Por si mammoth hubiera movido alguna marca a un atributo o a un sitio inesperado.
  const leftovers = documentRef.createTreeWalker(body, NodeFilter.SHOW_TEXT)
  while (leftovers.nextNode()) {
    const text = leftovers.currentNode as Text
    if (STRAY_MARKERS.test(text.data)) text.data = text.data.replace(MARKER, '').replace(STRAY_MARKERS, '')
    STRAY_MARKERS.lastIndex = 0
  }
  if (annotations.lastSectionColumns || body.querySelector('hr[data-docx-section-end]')) {
    groupSectionColumns(body, annotations.lastSectionColumns ?? 1)
  }
  return losses
}

function applyParagraphFormat(block: HTMLElement, format: DocxParagraphFormat): void {
  if (format.align) block.style.textAlign = format.align
  // En las listas, la sangría la pone la propia lista (numbering.xml): aplicarla otra vez la duplicaría.
  const inList = block.closest('li') !== null
  if (!inList && format.indentLeft) {
    block.setAttribute('data-indent', String(Math.round((format.indentLeft / INDENT_STEP_CM) * 1000) / 1000))
  }
  if (!inList && format.firstLine) block.style.textIndent = `${format.firstLine}cm`
  // Fase 13: lo que lee la extensión ParagraphFormat (las mismas unidades que escribe).
  if (format.spaceBefore !== undefined) block.style.marginTop = `${format.spaceBefore}pt`
  if (format.spaceAfter !== undefined) block.style.marginBottom = `${format.spaceAfter}pt`
  if (format.lineHeight) block.style.lineHeight = String(format.lineHeight)
  if (format.indentRight) block.style.marginRight = `${format.indentRight}cm`
  if (format.shading) block.setAttribute('data-shading', format.shading)
  if (format.border) block.setAttribute('data-border', format.border)
  if (format.tabStops) block.setAttribute('data-tab-stops', JSON.stringify(format.tabStops))
  if (inList && format.list) applyListFormat(block, format.list)
  // Solo entre bloques del documento: en una tabla o una lista no hay hoja nueva que empezar.
  if (format.pageBreakBefore && block.parentElement === block.ownerDocument.body) {
    const pageBreak = block.ownerDocument.createElement('hr')
    pageBreak.setAttribute('data-page-break', '')
    block.before(pageBreak)
  }
  if (format.nextSection && block.parentElement === block.ownerDocument.body) {
    const sectionBreak = block.ownerDocument.createElement('hr')
    sectionBreak.setAttribute('data-section-break', '')
    sectionBreak.setAttribute('data-page-setup', JSON.stringify(format.nextSection))
    block.after(sectionBreak)
  }
  // Fin de sección de Word: marca temporal para agrupar las columnas (groupSectionColumns la quita).
  if (format.sectionEnd && block.parentElement === block.ownerDocument.body) {
    const end = block.ownerDocument.createElement('hr')
    end.setAttribute('data-docx-section-end', '')
    end.setAttribute('data-columns', String(format.sectionEnd.columns))
    block.after(end)
  }
}

/** Viñeta o formato de número en la lista que contiene `element` (la primera vez que se sabe). */
function applyListFormat(element: HTMLElement, format: NonNullable<DocxParagraphFormat['list']>): void {
  const list = element.closest('ul, ol')
  if (!list || list.hasAttribute('data-bullet') || list.hasAttribute('data-number-format')) return
  if ('bullet' in format && list.tagName === 'UL') list.setAttribute('data-bullet', format.bullet)
  if ('numberFormat' in format && list.tagName === 'OL') list.setAttribute('data-number-format', format.numberFormat)
}

function wrapSegment(
  documentRef: Document,
  text: string,
  format: DocxRunFormat | null,
  commentId: string | undefined
): Node {
  let node: Node = documentRef.createTextNode(text)
  if (format?.highlight) {
    const mark = documentRef.createElement('mark')
    mark.setAttribute('data-color', format.highlight)
    mark.style.backgroundColor = format.highlight
    mark.appendChild(node)
    node = mark
  }
  if (format && (format.fontFamily || format.fontSize || format.color)) {
    const span = documentRef.createElement('span')
    if (format.fontFamily) span.style.fontFamily = format.fontFamily
    if (format.fontSize) span.style.fontSize = `${format.fontSize}pt`
    if (format.color) span.style.color = format.color
    span.appendChild(node)
    node = span
  }
  if (commentId) {
    const span = documentRef.createElement('span')
    span.setAttribute('data-comment-id', commentId)
    span.appendChild(node)
    node = span
  }
  return node
}
