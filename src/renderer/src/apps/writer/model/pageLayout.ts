import { PAGE_COUNT_TOKEN, PAGE_NUMBER_TOKEN, type HeaderFooter } from './content'
import { cssPageSize, DEFAULT_PAGE_SETUP, pageGeometry, type PageSetup } from './pageSetup'

/**
 * Paginación de Texto: en qué bloque empieza cada página. Es lógica pura (cajas medidas -> saltos),
 * sin DOM ni ProseMirror, para poder probarla con números. La extensión del editor
 * (editor/Pagination.ts) mide los bloques, llama a `paginate` y aplica el resultado.
 */

/** Hoja por defecto (A4 con 2,5 cm). Las funciones reciben la geometría del documento; esto es su valor por omisión. */
export const DEFAULT_GEOMETRY = pageGeometry(DEFAULT_PAGE_SETUP)

/**
 * Holgura: un bloque que acaba a menos de esto del final de la hoja pasa a la siguiente. Evita que
 * un redondeo de medio píxel haga que Chromium, al imprimir, mande la última línea a otra hoja.
 */
const SAFETY_PX = 2

/** Un bloque medido sin paginar: su borde superior e inferior, desde el principio del texto. */
export interface MeasuredBlock {
  top: number
  bottom: number
  /** Va detrás de un salto de página: empieza hoja nueva aunque quepa en la actual. */
  breakBefore?: boolean
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
 * hoja; la hoja `n` tiene su área de texto en [n·pitch, n·pitch + contentHeight).
 *
 * Un bloque que no cabe entero en lo que queda de hoja empieza en la siguiente (no se parten
 * párrafos: es la opción "conservar líneas juntas" de Word aplicada a todo). Un bloque más alto
 * que una hoja entera empieza arriba de una y se sale por abajo: es el caso raro que no cubrimos.
 */
export function paginate(
  blocks: MeasuredBlock[],
  pitch = DEFAULT_GEOMETRY.pitch,
  contentHeight = DEFAULT_GEOMETRY.contentHeight
): PageLayout {
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
    const atPageStart = top <= pageStart + SAFETY_PX
    const overflows = bottom > pageEnd && !atPageStart
    const forced = block.breakBefore === true && !atPageStart
    if (startsInGap || overflows || forced) {
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
export function pageAt(y: number, pageCount: number, pitch = DEFAULT_GEOMETRY.pitch): number {
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
export function printPageCss(setup: PageSetup, header?: HeaderFooter, footer?: HeaderFooter): string {
  const box = (kind: 'header' | 'footer', part?: HeaderFooter) => {
    if (!part || part.text.trim() === '') return ''
    return `${MARGIN_BOX[kind][part.align]} { content: ${cssContent(part.text)}; font: 10pt Calibri, Carlito, 'Segoe UI', Arial, sans-serif; color: #555; white-space: pre-wrap; }`
  }
  const { top, right, bottom, left } = setup.margins
  const margin = `${top}cm ${right}cm ${bottom}cm ${left}cm`
  return `@page { size: ${cssPageSize(setup)}; margin: ${margin}; ${box('header', header)} ${box('footer', footer)} }`
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
