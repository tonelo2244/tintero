import { generateJSON, type Extensions } from '@tiptap/core'
import mammoth from 'mammoth'
import type { ImportResult } from '@/core/appModule'
import type { WriterContent } from '../content'

/**
 * Importación de .docx en dos pasos:
 *   1. mammoth convierte el .docx en HTML semántico (títulos, listas, negrita, enlaces, imágenes...).
 *   2. Tiptap convierte ese HTML en su JSON con las mismas extensiones que usa el editor.
 *
 * Las tablas llegan como <table> (con colspan/rowspan) y las reconoce la extensión de tablas del editor.
 *
 * mammoth ignora a propósito el formato "directo" (fuente, tamaño, color, alineación) y se queda
 * con la estructura. Es una pérdida real; en vez de esconderla, la medimos y avisamos al usuario.
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

/** Lo que mammoth descarta y queremos contar para el aviso. */
interface LostFormatting {
  alignedParagraphs: number
  formattedRuns: number
  unsupportedImages: number
}

export async function importDocx(bytes: Uint8Array, extensions: Extensions): Promise<ImportResult<WriterContent>> {
  const lost: LostFormatting = { alignedParagraphs: 0, formattedRuns: 0, unsupportedImages: 0 }
  const arrayBuffer = bytes.slice().buffer

  // mammoth lee `arrayBuffer` en el navegador y `buffer` en Node (tests). Le damos ambos.
  const input = { arrayBuffer, buffer: arrayBuffer } as unknown as { arrayBuffer: ArrayBuffer }

  const result = await mammoth.convertToHtml(input, {
    styleMap: STYLE_MAP,
    // Conservar los párrafos vacíos: en un procesador de texto son espacio intencionado.
    ignoreEmptyParagraphs: false,
    // Solo leemos el documento para contar lo que se va a perder; no lo modificamos.
    transformDocument: (document: unknown) => {
      countLostFormatting(document as DocxElement, lost)
      return document
    },
    convertImage: mammoth.images.imgElement(async (image) => {
      if (!BROWSER_IMAGE_TYPES.includes(image.contentType)) {
        lost.unsupportedImages++
        return { src: '' }
      }
      return { src: `data:${image.contentType};base64,${await image.readAsBase64String()}` }
    })
  })

  const doc = generateJSON(prepareHtml(result.value), extensions) as WriterContent['doc']
  return { content: { doc }, warnings: describeLosses(lost) }
}

/** Ajusta el HTML de mammoth a lo que esperan las extensiones del editor. */
export function prepareHtml(html: string): string {
  const dom = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
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

interface DocxElement {
  type?: string
  alignment?: string | null
  font?: string | null
  fontSize?: number | null
  highlight?: string | null
  children?: DocxElement[]
}

function countLostFormatting(element: DocxElement, lost: LostFormatting): void {
  // mammoth solo informa de la alineación puesta a mano (la de los estilos, como "Cita", sí se conserva).
  if (element.type === 'paragraph' && isVisibleAlignment(element.alignment)) {
    lost.alignedParagraphs++
  }
  if (element.type === 'run' && (element.font || element.fontSize || element.highlight)) lost.formattedRuns++
  element.children?.forEach((child) => countLostFormatting(child, lost))
}

function isVisibleAlignment(alignment: string | null | undefined): boolean {
  return alignment === 'center' || alignment === 'right' || alignment === 'both'
}

export function describeLosses(lost: LostFormatting): string[] {
  const warnings: string[] = []
  if (lost.formattedRuns > 0) warnings.push('fuentes, tamaños, colores y resaltados aplicados a mano')
  if (lost.alignedParagraphs > 0) warnings.push(`la alineación de ${plural(lost.alignedParagraphs, 'párrafo')}`)
  if (lost.unsupportedImages > 0) {
    warnings.push(`${plural(lost.unsupportedImages, 'imagen', 'imágenes')} en formatos que no se pueden mostrar`)
  }
  return warnings
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}
