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

/** Un renglón medido: su borde superior e inferior, en las mismas coordenadas que el bloque. */
export interface MeasuredLine {
  top: number
  bottom: number
}

/** Un bloque medido sin paginar: su borde superior e inferior, desde el principio del texto. */
export interface MeasuredBlock {
  top: number
  bottom: number
  /** Va detrás de un salto de página: empieza hoja nueva aunque quepa en la actual. */
  breakBefore?: boolean
  /**
   * Renglones del bloque, en orden. Con ellos el bloque se puede partir entre hojas (un párrafo
   * largo); sin ellos se mueve entero (una imagen, una fila de tabla).
   */
  lines?: MeasuredLine[]
  /** "Conservar con el siguiente": un título no se queda solo al pie de la hoja. */
  keepWithNext?: boolean
  /** Alto que aparece encima del bloque cuando abre hoja: la fila de encabezado que se repite. */
  repeatHeight?: number
}

/**
 * Dónde empieza una hoja nueva y cuánto hay que bajar lo que sigue para que lo haga. Sin `line`,
 * baja el bloque entero; con `line`, el bloque se parte y baja desde ese renglón.
 */
export interface PageBreak {
  index: number
  shift: number
  line?: number
}

export interface PageLayout {
  breaks: PageBreak[]
  pageCount: number
}

/** Control de viudas y huérfanas: al partir un párrafo quedan al menos dos renglones a cada lado. */
export const MIN_LINES = 2

/** Vueltas máximas para "conservar con el siguiente" (una cadena de títulos seguidos). */
const MAX_KEEP_PASSES = 20

/**
 * Reparte los bloques en hojas. Coordenadas: 0 es el principio del área de texto de la primera
 * hoja; la hoja `n` tiene su área de texto en [n·pitch, n·pitch + contentHeight).
 *
 * Un bloque que no cabe en lo que queda de hoja se parte por renglones si los trae (y deja al
 * menos MIN_LINES a cada lado); si no, baja entero a la siguiente. Un bloque sin renglones más
 * alto que una hoja empieza arriba de una y se sale por abajo: es el caso raro que no cubrimos.
 * Los títulos (`keepWithNext`) bajan con el bloque siguiente cuando este baja entero.
 */
export function paginate(
  blocks: MeasuredBlock[],
  pitch = DEFAULT_GEOMETRY.pitch,
  contentHeight = DEFAULT_GEOMETRY.contentHeight
): PageLayout {
  // "Conservar con el siguiente" se resuelve repitiendo el reparto con el título forzado a bajar:
  // así la pasada sigue siendo lineal y sencilla, y casi nunca hace falta más de una vuelta.
  const forced = new Set<number>()
  let pass = paginatePass(blocks, pitch, contentHeight, forced)
  for (let round = 0; round < MAX_KEEP_PASSES && pass.keepViolation !== null; round++) {
    forced.add(pass.keepViolation)
    pass = paginatePass(blocks, pitch, contentHeight, forced)
  }
  return { breaks: pass.breaks, pageCount: pass.pageCount }
}

interface Pass extends PageLayout {
  /** Bloque con "conservar con el siguiente" que se quedó al pie, separado del siguiente. */
  keepViolation: number | null
}

function paginatePass(blocks: MeasuredBlock[], pitch: number, contentHeight: number, forced: Set<number>): Pass {
  const pageOf = (y: number) => Math.max(0, Math.floor(y / pitch))
  const breaks: PageBreak[] = []
  const startsPage: boolean[] = []
  let keepViolation: number | null = null
  let added = 0
  let lastBottom = 0

  /** Primer renglón que ya no cabe en la hoja donde empieza `from`, o null si no hay que partir. */
  const splitLine = (lines: MeasuredLine[], from: number): number | null => {
    const end = pageOf(lines[from].top + added) * pitch + contentHeight - SAFETY_PX
    let line = from
    while (line < lines.length && lines[line].bottom + added <= end) line++
    if (line >= lines.length) return null
    line = Math.min(line, lines.length - MIN_LINES) // viudas: al menos dos renglones pasan
    return line - from >= MIN_LINES ? line : null // huérfanas: al menos dos se quedan
  }

  blocks.forEach((block, index) => {
    const top = block.top + added
    const bottom = block.bottom + added
    const pageStart = pageOf(top) * pitch
    const pageEnd = pageStart + contentHeight - SAFETY_PX
    const atPageStart = top <= pageStart + SAFETY_PX
    const lines = block.lines && block.lines.length >= 2 * MIN_LINES ? block.lines : undefined
    const forcedBreak = (block.breakBefore === true || forced.has(index)) && !atPageStart
    const overflows = bottom > pageEnd && !atPageStart
    let starts = atPageStart

    // Primero se intenta partir; si no se puede (pocos renglones o no caben dos), baja entero.
    const firstSplit = overflows && !forcedBreak && top < pageEnd && lines ? splitLine(lines, 0) : null
    if (firstSplit === null && (top >= pageEnd || overflows || forcedBreak)) {
      const shift = pageStart + pitch - top
      breaks.push({ index, shift })
      added += shift + (block.repeatHeight ?? 0)
      starts = true
      const previous = index - 1
      if (!forcedBreak && previous >= 0 && blocks[previous].keepWithNext && !startsPage[previous]) {
        keepViolation ??= previous
      }
    }
    // Lo que queda del bloque se parte tantas veces como haga falta (un párrafo de varias hojas).
    let from = 0
    let line = firstSplit ?? (lines ? splitLine(lines, 0) : null)
    while (line !== null && lines) {
      const shift = Math.max(0, (pageOf(lines[from].top + added) + 1) * pitch - (lines[line].top + added))
      breaks.push({ index, shift, line })
      added += shift
      from = line
      line = splitLine(lines, from)
    }
    startsPage[index] = starts
    lastBottom = Math.max(lastBottom, block.bottom + added)
  })
  const pageCount = Math.max(1, Math.floor(Math.max(0, lastBottom - 1) / pitch) + 1)
  return { breaks, pageCount, keepViolation }
}

/**
 * En qué hoja (desde 1) está una posición del documento, sabiendo dónde empieza cada una. Se cuenta
 * por posiciones y no por alturas en pantalla: funciona igual con zoom, con hojas de cualquier
 * tamaño y en "Varias páginas", donde las hojas van en columnas.
 */
export function pageOfPosition(pageStarts: number[], pos: number): number {
  let page = 1
  for (let index = 1; index < pageStarts.length && pageStarts[index] <= pos; index++) page = index + 1
  return page
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
