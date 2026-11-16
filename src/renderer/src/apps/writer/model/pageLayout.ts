import { PAGE_COUNT_TOKEN, PAGE_NUMBER_TOKEN, type HeaderFooter } from './content'

/**
 * Paginación de Texto: en qué bloque empieza cada página. Es lógica pura (cajas medidas -> saltos),
 * sin DOM ni ProseMirror, para poder probarla con números. La extensión del editor
 * (editor/Pagination.ts) mide los bloques, llama a `paginate` y aplica el resultado.
 */

const PX_PER_CM = 96 / 2.54

/** Hoja A4 (21 x 29,7 cm) con márgenes de 2,5 cm, los mismos que `@page` al imprimir. */
export const PAGE = {
  width: 21 * PX_PER_CM,
  height: 29.7 * PX_PER_CM,
  margin: 2.5 * PX_PER_CM,
  /** Separación gris entre hojas en pantalla (no existe al imprimir). */
  gap: 24
} as const

/** Alto útil de una hoja: lo que cabe entre los márgenes. */
export const PAGE_CONTENT_HEIGHT = PAGE.height - 2 * PAGE.margin
/** Distancia en pantalla del principio de una hoja al de la siguiente. */
export const PAGE_PITCH = PAGE.height + PAGE.gap

/**
 * Holgura: un bloque que acaba a menos de esto del final de la hoja pasa a la siguiente. Evita que
 * un redondeo de medio píxel haga que Chromium, al imprimir, mande la última línea a otra hoja.
 */
const SAFETY_PX = 2

/** Un bloque medido sin paginar: su borde superior e inferior, desde el principio del texto. */
export interface MeasuredBlock {
  top: number
  bottom: number
}

/** Un bloque que debe empezar hoja nueva y cuánto hay que bajarlo para que lo haga. */
export interface PageBreak {
  index: number
  /** Espacio que se añade encima del bloque (además del hueco que ya tenía con el anterior). */
  shift: number
}

export interface PageLayout {
  breaks: PageBreak[]
  pageCount: number
}

/**
 * Reparte los bloques en hojas. Coordenadas: 0 es el principio del área de texto de la primera
 * hoja; la hoja `n` tiene su área de texto en [n·PAGE_PITCH, n·PAGE_PITCH + PAGE_CONTENT_HEIGHT).
 *
 * Un bloque que no cabe entero en lo que queda de hoja empieza en la siguiente (no se parten
 * párrafos: es la opción "conservar líneas juntas" de Word aplicada a todo). Un bloque más alto
 * que una hoja entera empieza arriba de una y se sale por abajo: es el caso raro que no cubrimos.
 */
export function paginate(blocks: MeasuredBlock[], pitch = PAGE_PITCH, contentHeight = PAGE_CONTENT_HEIGHT): PageLayout {
  const breaks: PageBreak[] = []
  let added = 0
  let lastBottom = 0
  blocks.forEach((block, index) => {
    const top = block.top + added
    const bottom = block.bottom + added
    const page = Math.max(0, Math.floor(top / pitch))
    const pageStart = page * pitch
    const pageEnd = pageStart + contentHeight - SAFETY_PX
    const startsInGap = top >= pageEnd
    const overflows = bottom > pageEnd && top > pageStart + SAFETY_PX
    if (startsInGap || overflows) {
      const shift = (page + 1) * pitch - top
      breaks.push({ index, shift })
      added += shift
    }
    lastBottom = Math.max(lastBottom, block.bottom + added)
  })
  const pageCount = Math.max(1, Math.floor(Math.max(0, lastBottom - 1) / pitch) + 1)
  return { breaks, pageCount }
}

/** En qué hoja (desde 1) cae una altura medida desde el principio del área de texto. */
export function pageAt(y: number, pageCount: number, pitch = PAGE_PITCH): number {
  return Math.min(pageCount, Math.max(1, Math.floor(y / pitch) + 1))
}

/** Texto del encabezado o pie de una hoja concreta: los marcadores pasan a números. */
export function headerFooterText(part: HeaderFooter, page: number, pageCount: number): string {
  return part.text.split(PAGE_NUMBER_TOKEN).join(String(page)).split(PAGE_COUNT_TOKEN).join(String(pageCount))
}

const MARGIN_BOX: Record<'header' | 'footer', Record<HeaderFooter['align'], string>> = {
  header: { left: '@top-left', center: '@top-center', right: '@top-right' },
  footer: { left: '@bottom-left', center: '@bottom-center', right: '@bottom-right' }
}

/**
 * Regla `@page` para imprimir y exportar a PDF, con encabezado y pie en las cajas de margen de la
 * hoja. Chromium numera las páginas con `counter(page)` y `counter(pages)`: así el número es el de
 * la hoja impresa, sin que tengamos que adivinarlo.
 */
export function printPageCss(header?: HeaderFooter, footer?: HeaderFooter): string {
  const box = (kind: 'header' | 'footer', part?: HeaderFooter) => {
    if (!part || part.text.trim() === '') return ''
    return `${MARGIN_BOX[kind][part.align]} { content: ${cssContent(part.text)}; font: 10pt Calibri, Carlito, 'Segoe UI', Arial, sans-serif; color: #555; white-space: pre-wrap; }`
  }
  return `@page { size: A4; margin: 2.5cm; ${box('header', header)} ${box('footer', footer)} }`
}

/** Texto con marcadores -> valor de `content` de CSS: cadenas escapadas y contadores. */
export function cssContent(text: string): string {
  const pieces = text.split(new RegExp(`(${escapeRegExp(PAGE_NUMBER_TOKEN)}|${escapeRegExp(PAGE_COUNT_TOKEN)})`))
  return pieces
    .filter((piece) => piece !== '')
    .map((piece) => {
      if (piece === PAGE_NUMBER_TOKEN) return 'counter(page)'
      if (piece === PAGE_COUNT_TOKEN) return 'counter(pages)'
      // En una cadena CSS: \ y " se escapan; el salto de línea es \A (con espacio para cortar el escape).
      return `"${piece.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\A ')}"`
    })
    .join(' ')
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
