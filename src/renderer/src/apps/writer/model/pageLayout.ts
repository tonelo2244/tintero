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
  /** Sección del bloque (0, la del documento, si no se dice). */
  section?: number
}

/**
 * Dónde empieza una hoja nueva y cuánto hay que bajar lo que sigue para que lo haga. Sin `line`,
 * baja el bloque entero; con `line`, el bloque se parte y baja desde ese renglón.
 */
export interface PageBreak {
  index: number
  shift: number
  line?: number
  /** Hoja (desde 0) que empieza aquí. */
  page: number
}

/** Una hoja colocada: dónde empieza su área de texto y de qué sección es (qué tamaño tiene). */
export interface PlacedPage {
  top: number
  section: number
}

export interface PageLayout {
  breaks: PageBreak[]
  pageCount: number
  pages: PlacedPage[]
}

/** Alturas de la hoja de una sección, en las mismas unidades que los bloques. */
export interface PageFormat {
  contentHeight: number
  marginTop: number
  marginBottom: number
}

/** Control de viudas y huérfanas: al partir un párrafo quedan al menos dos renglones a cada lado. */
export const MIN_LINES = 2

/** Vueltas máximas para "conservar con el siguiente" (una cadena de títulos seguidos). */
const MAX_KEEP_PASSES = 20

/**
 * Reparte los bloques en hojas iguales. Coordenadas: 0 es el principio del área de texto de la
 * primera hoja; la hoja `n` tiene su área de texto en [n·pitch, n·pitch + contentHeight).
 */
export function paginate(
  blocks: MeasuredBlock[],
  pitch = DEFAULT_GEOMETRY.pitch,
  contentHeight = DEFAULT_GEOMETRY.contentHeight
): PageLayout {
  return paginateSections(blocks, [{ contentHeight, marginTop: 0, marginBottom: pitch - contentHeight }], 0)
}

/**
 * Reparte los bloques en hojas, cada sección con su tamaño (`formats[section]`; `gap` es el hueco
 * gris entre hojas). 0 es el principio del área de texto de la primera hoja.
 *
 * Un bloque que no cabe en lo que queda de hoja se parte por renglones si los trae (y deja al
 * menos MIN_LINES a cada lado); si no, baja entero a la siguiente. Un bloque sin renglones más
 * alto que una hoja empieza arriba de una y se sale por abajo: es el caso raro que no cubrimos.
 * Los títulos (`keepWithNext`) bajan con el bloque siguiente cuando este baja entero. El primer
 * bloque de otra sección empieza hoja (los saltos de sección son de "página siguiente").
 */
export function paginateSections(blocks: MeasuredBlock[], formats: PageFormat[], gap: number): PageLayout {
  // "Conservar con el siguiente" se resuelve repitiendo el reparto con el título forzado a bajar:
  // así la pasada sigue siendo lineal y sencilla, y casi nunca hace falta más de una vuelta.
  const forced = new Set<number>()
  let pass = paginatePass(blocks, formats, gap, forced)
  for (let round = 0; round < MAX_KEEP_PASSES && pass.keepViolation !== null; round++) {
    forced.add(pass.keepViolation)
    pass = paginatePass(blocks, formats, gap, forced)
  }
  return { breaks: pass.breaks, pageCount: pass.pages.length, pages: pass.pages }
}

interface Pass {
  breaks: PageBreak[]
  pages: PlacedPage[]
  /** Bloque con "conservar con el siguiente" que se quedó al pie, separado del siguiente. */
  keepViolation: number | null
}

function paginatePass(blocks: MeasuredBlock[], formats: PageFormat[], gap: number, forced: Set<number>): Pass {
  const format = (section: number) => formats[section] ?? formats[0]
  let current: PlacedPage = { top: 0, section: blocks[0]?.section ?? 0 }
  const pages = [current]
  const endOf = (page: PlacedPage) => page.top + format(page.section).contentHeight - SAFETY_PX
  const nextTop = (section: number) => {
    const previous = format(current.section)
    return current.top + previous.contentHeight + previous.marginBottom + gap + format(section).marginTop
  }
  const openPage = (section: number) => {
    current = { top: nextTop(section), section }
    pages.push(current)
    return current
  }
  const breaks: PageBreak[] = []
  const startsPage: boolean[] = []
  let keepViolation: number | null = null
  let added = 0

  /** Primer renglón que ya no cabe en la hoja actual desde `from`, o null si no hay que partir. */
  const splitLine = (lines: MeasuredLine[], from: number): number | null => {
    const end = endOf(current)
    let line = from
    while (line < lines.length && lines[line].bottom + added <= end) line++
    if (line >= lines.length) return null
    line = Math.min(line, lines.length - MIN_LINES) // viudas: al menos dos renglones pasan
    return line - from >= MIN_LINES ? line : null // huérfanas: al menos dos se quedan
  }

  blocks.forEach((block, index) => {
    const section = block.section ?? 0
    const top = block.top + added
    const atPageStart = Math.abs(top - current.top) <= SAFETY_PX
    // Detrás de un bloque más alto que una hoja, el siguiente puede caer en el hueco entre hojas.
    const inGap = top < current.top - SAFETY_PX
    if (section !== current.section && atPageStart) current.section = section
    const pageEnd = endOf(current)
    const lines = block.lines && block.lines.length >= 2 * MIN_LINES ? block.lines : undefined
    const forcedBreak = (block.breakBefore === true || forced.has(index) || section !== current.section) && !atPageStart
    const overflows = block.bottom + added > pageEnd && !atPageStart
    let starts = atPageStart

    // Primero se intenta partir; si no se puede (pocos renglones o no caben dos), baja entero.
    const firstSplit = overflows && !forcedBreak && !inGap && top < pageEnd && lines ? splitLine(lines, 0) : null
    if (inGap || (firstSplit === null && (top >= pageEnd || overflows || forcedBreak))) {
      const page = inGap ? current : openPage(section)
      const shift = page.top - top
      breaks.push({ index, shift, page: pages.length - 1 })
      added += shift + (block.repeatHeight ?? 0)
      starts = true
      const previous = index - 1
      if (!forcedBreak && previous >= 0 && blocks[previous].keepWithNext && !startsPage[previous]) {
        keepViolation ??= previous
      }
    }
    // Lo que queda del bloque se parte tantas veces como haga falta (un párrafo de varias hojas).
    let line = firstSplit ?? (lines ? splitLine(lines, 0) : null)
    while (line !== null && lines) {
      const page = openPage(current.section)
      const shift = Math.max(0, page.top - (lines[line].top + added))
      breaks.push({ index, shift, line, page: pages.length - 1 })
      added += shift
      line = splitLine(lines, line)
    }
    // Un bloque que no se puede partir y no cabe en una hoja ocupa también las siguientes.
    if (!lines) {
      while (block.bottom + added > nextTop(current.section) + SAFETY_PX) openPage(current.section)
    }
    startsPage[index] = starts
  })
  return { breaks, pages, keepViolation }
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
 * Reglas `@page` para imprimir y exportar a PDF, con encabezado y pie en las cajas de margen de la
 * hoja. Chromium numera las páginas con `counter(page)` y `counter(pages)`: así el número es el de
 * la hoja impresa, sin que tengamos que adivinarlo.
 *
 * Con secciones (`setup` es una lista), la primera es la hoja por defecto y cada una de las demás
 * es una hoja con nombre (`@page tintero-section-N`) que usan sus bloques (clase `writer-section-N`,
 * que pone la paginación). Chromium cambia de hoja entre bloques con distinto nombre.
 */
export function printPageCss(setup: PageSetup | PageSetup[], header?: HeaderFooter, footer?: HeaderFooter): string {
  const setups = Array.isArray(setup) ? setup : [setup]
  const box = (kind: 'header' | 'footer', part?: HeaderFooter) => {
    if (!part || part.text.trim() === '') return ''
    return `${MARGIN_BOX[kind][part.align]} { content: ${cssContent(part.text)}; font: 10pt Calibri, Carlito, 'Segoe UI', Arial, sans-serif; color: #555; white-space: pre-wrap; }`
  }
  const rule = (page: PageSetup) => {
    const { top, right, bottom, left } = page.margins
    const margin = `${top}cm ${right}cm ${bottom}cm ${left}cm`
    return `{ size: ${cssPageSize(page)}; margin: ${margin}; ${box('header', header)} ${box('footer', footer)} }`
  }
  return setups
    .map((page, index) =>
      index === 0
        ? `@page ${rule(page)}`
        : `@page tintero-section-${index} ${rule(page)} .writer-section-${index} { page: tintero-section-${index}; }`
    )
    .join('\n')
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
