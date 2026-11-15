import { attr, child, descendants, path } from '@/core/office/xml'
import { cssFontFamilyFor } from '@/ui/fonts'

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

export interface DocxAnnotations {
  formats: DocxRunFormat[]
}

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
  stylesXml: string | null
): {
  xml: string
  annotations: DocxAnnotations
} {
  const document = new DOMParser().parseFromString(documentXml, 'application/xml')
  const root = document.documentElement
  const defaults = stylesXml ? readDefaultFormat(new DOMParser().parseFromString(stylesXml, 'application/xml')) : {}
  const formats: DocxRunFormat[] = []

  for (const run of descendants(root, 'r')) {
    const format = withoutDefaults(readRunFormat(child(run, 'rPr')), defaults)
    if (Object.keys(format).length === 0) continue
    const id = formats.push(format) - 1
    for (const text of descendants(run, 't')) {
      text.textContent = `${marker('r', String(id))}${text.textContent ?? ''}${marker('R')}`
    }
  }

  for (const paragraph of descendants(root, 'p')) {
    const alignment = ALIGNMENTS[attr(path(paragraph, 'pPr', 'jc'), 'val') ?? '']
    const firstText = alignment && descendants(paragraph, 't').find((text) => ownParagraph(text) === paragraph)
    if (firstText) firstText.textContent = `${marker('p', alignment)}${firstText.textContent ?? ''}`
  }

  for (const start of descendants(root, 'commentRangeStart'))
    insertMarkerRun(start, marker('c', attr(start, 'id') ?? ''))
  for (const end of descendants(root, 'commentRangeEnd')) insertMarkerRun(end, marker('C', attr(end, 'id') ?? ''))

  return { xml: new XMLSerializer().serializeToString(document), annotations: { formats } }
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
        const block = node.parentElement?.closest(ALIGNABLE_BLOCKS)
        if (block instanceof HTMLElement) block.style.textAlign = payload
        else losses.alignedParagraphs++
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
  return losses
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
