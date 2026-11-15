import { generateJSON, type Extensions } from '@tiptap/core'
import JSZip from 'jszip'
import mammoth from 'mammoth'
import type { ImportResult } from '@/core/appModule'
import { createId } from '@/core/ids'
import { parseXml, readRelationships, relsPathFor } from '@/core/office/xml'
import type { HeaderFooter, WriterContent } from '../content'
import { annotateDocumentXml, applyAnnotations, type DocxAnnotations } from './directFormatting'
import { defaultHeaderFooterIds, readComments, readHeaderFooter, type DocxComment } from './docxParts'

/**
 * Importación de .docx en dos pasos:
 *   1. mammoth convierte el .docx en HTML semántico (títulos, listas, negrita, enlaces, imágenes...).
 *   2. Tiptap convierte ese HTML en su JSON con las mismas extensiones que usa el editor.
 *
 * Las tablas llegan como <table> (con colspan/rowspan) y las reconoce la extensión de tablas del editor.
 *
 * mammoth ignora a propósito el formato "directo" (fuente, tamaño, color, alineación), los
 * encabezados, los pies y el contenido de los comentarios. Esas partes las leemos nosotros del XML
 * (directFormatting.ts y docxParts.ts) en paralelo a mammoth. Lo que aún se pierde, se avisa.
 */

/** Estilos de Word -> HTML que entiende el editor. Los nombres son los que escribe nuestro exportador. */
const STYLE_MAP = [
  "p[style-name='Title'] => p.title:fresh",
  "p[style-name='Subtitle'] => p.subtitle:fresh",
  "p[style-name='Quote'] => p.quote:fresh",
  "p[style-name='No Spacing'] => p.no-spacing:fresh",
  "p[style-name='Block Text'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh",
  "p[style-name='HTML Preformatted'] => pre:separator('\\n')",
  // El editor solo tiene Título 1 a 3: los niveles inferiores pasan a ser Título 3.
  "p[style-name='Heading 4'] => h3:fresh",
  "p[style-name='Heading 5'] => h3:fresh",
  "p[style-name='Heading 6'] => h3:fresh",
  // Por defecto mammoth descarta el subrayado; aquí lo conservamos.
  'u => u'
]

/** Clases que pone el mapa de estilos -> atributo `data-style` que lee la extensión ParagraphFormat. */
const BLOCK_STYLE_CLASSES = ['title', 'subtitle', 'quote', 'no-spacing']

const BROWSER_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp', 'image/svg+xml']

/** Lo que no conseguimos conservar y queremos contar para el aviso. */
interface LostFormatting {
  alignedParagraphs: number
  unsupportedImages: number
}

const WORD_DOCUMENT = 'word/document.xml'

export async function importDocx(bytes: Uint8Array, extensions: Extensions): Promise<ImportResult<WriterContent>> {
  const lost: LostFormatting = { alignedParagraphs: 0, unsupportedImages: 0 }
  const parts = await readDocxParts(bytes)
  const arrayBuffer = (parts?.annotatedBytes ?? bytes).slice().buffer

  // mammoth lee `arrayBuffer` en el navegador y `buffer` en Node (tests). Le damos ambos.
  const input = { arrayBuffer, buffer: arrayBuffer } as unknown as { arrayBuffer: ArrayBuffer }

  const result = await mammoth.convertToHtml(input, {
    styleMap: STYLE_MAP,
    // Conservar los párrafos vacíos: en un procesador de texto son espacio intencionado.
    ignoreEmptyParagraphs: false,
    convertImage: mammoth.images.imgElement(async (image) => {
      if (!BROWSER_IMAGE_TYPES.includes(image.contentType)) {
        lost.unsupportedImages++
        return { src: '' }
      }
      return { src: `data:${image.contentType};base64,${await image.readAsBase64String()}` }
    })
  })

  const commentIds = new Map((parts?.comments ?? []).map(({ docxId, comment }) => [docxId, comment.id]))
  const html = prepareHtml(result.value, (body) => {
    if (!parts) return
    lost.alignedParagraphs += applyAnnotations(body, parts.annotations, commentIds).alignedParagraphs
  })
  const content: WriterContent = { doc: generateJSON(html, extensions) as WriterContent['doc'] }
  if (parts?.header) content.header = parts.header
  if (parts?.footer) content.footer = parts.footer
  if (parts && parts.comments.length > 0) content.comments = parts.comments.map(({ comment }) => comment)
  return { content, warnings: describeLosses(lost) }
}

interface DocxParts {
  /** El mismo .docx con las marcas de formato directo en el texto (ver directFormatting.ts). */
  annotatedBytes: Uint8Array
  annotations: DocxAnnotations
  header: HeaderFooter | null
  footer: HeaderFooter | null
  comments: DocxComment[]
}

/**
 * Lo que leemos nosotros del zip, en paralelo a mammoth. Si el archivo no tiene la forma
 * esperada devolvemos null y mammoth hace la importación de siempre (o da su error).
 */
async function readDocxParts(bytes: Uint8Array): Promise<DocxParts | null> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    return null
  }
  const readText = (filePath: string): Promise<string | null> =>
    zip.file(filePath)?.async('string') ?? Promise.resolve(null)
  const documentXml = await readText(WORD_DOCUMENT)
  if (!documentXml) return null

  const { xml, annotations } = annotateDocumentXml(documentXml, await readText('word/styles.xml'))
  zip.file(WORD_DOCUMENT, xml)

  const rels = readRelationships(parseOptionalXml(await readText(relsPathFor(WORD_DOCUMENT))), WORD_DOCUMENT)
  const { header, footer } = defaultHeaderFooterIds(parseXml(documentXml))
  const readPart = async (relationId: string | null): Promise<Element | null> => {
    const target = relationId ? rels.get(relationId)?.target : undefined
    return target ? parseOptionalXml(await readText(target)) : null
  }
  const commentsTarget = [...rels.values()].find((rel) => rel.type.endsWith('/comments'))?.target

  return {
    annotatedBytes: await zip.generateAsync({ type: 'uint8array' }),
    annotations,
    header: readHeaderFooter(await readPart(header)),
    footer: readHeaderFooter(await readPart(footer)),
    comments: commentsTarget
      ? readComments(parseOptionalXml(await readText(commentsTarget)), () => createId('comment'))
      : []
  }
}

function parseOptionalXml(text: string | null): Element | null {
  return text ? parseXml(text) : null
}

/**
 * Ajusta el HTML de mammoth a lo que esperan las extensiones del editor.
 * `transform` permite trabajar sobre el DOM antes de serializarlo (lo usa la importación para
 * aplicar el formato directo) sin volver a parsear el HTML.
 */
export function prepareHtml(html: string, transform?: (body: HTMLElement) => void): string {
  const dom = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  transform?.(dom.body)
  for (const className of BLOCK_STYLE_CLASSES) {
    dom.querySelectorAll(`p.${className}`).forEach((paragraph) => {
      paragraph.setAttribute('data-style', className)
      paragraph.removeAttribute('class')
    })
  }
  dom.querySelectorAll('img[src=""]').forEach((image) => image.remove())
  // mammoth añade enlaces de vuelta en las notas al pie ("↑"); en el editor no llevan a ningún sitio.
  dom.querySelectorAll('a[href^="#"]').forEach((link) => link.replaceWith(...link.childNodes))
  return dom.body.innerHTML
}

export function describeLosses(lost: LostFormatting): string[] {
  const warnings: string[] = []
  if (lost.alignedParagraphs > 0) {
    warnings.push(`la alineación de ${plural(lost.alignedParagraphs, 'párrafo')} dentro de listas`)
  }
  if (lost.unsupportedImages > 0) {
    warnings.push(`${plural(lost.unsupportedImages, 'imagen', 'imágenes')} en formatos que no se pueden mostrar`)
  }
  return warnings
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}
