/**
 * Configuración de página del documento: tamaño de papel, orientación y márgenes.
 *
 * Todo en centímetros, que es como lo piensa el usuario y como lo enseña la cinta. Las unidades de
 * pantalla (px) y de Word (twips) se calculan a partir de aquí, nunca al revés: así hay una única
 * fuente de verdad y ningún redondeo acumulado al ir y volver.
 */

export type PageOrientation = 'portrait' | 'landscape'

export interface PageMargins {
  top: number
  right: number
  bottom: number
  left: number
}

export interface PageSetup {
  /** Tamaño del papel en vertical (ancho < alto). La orientación decide si se gira. */
  size: { width: number; height: number }
  orientation: PageOrientation
  margins: PageMargins
}

export interface PaperSize {
  id: string
  label: string
  width: number
  height: number
}

export const PAPER_SIZES: PaperSize[] = [
  { id: 'a4', label: 'A4', width: 21, height: 29.7 },
  { id: 'a5', label: 'A5', width: 14.8, height: 21 },
  { id: 'letter', label: 'Carta', width: 21.59, height: 27.94 },
  { id: 'legal', label: 'Legal', width: 21.59, height: 35.56 }
]

export interface MarginPreset {
  id: string
  label: string
  margins: PageMargins
}

const uniform = (cm: number): PageMargins => ({ top: cm, right: cm, bottom: cm, left: cm })

export const MARGIN_PRESETS: MarginPreset[] = [
  { id: 'normal', label: 'Normal', margins: uniform(2.5) },
  { id: 'narrow', label: 'Estrecho', margins: uniform(1.27) },
  { id: 'moderate', label: 'Moderado', margins: { top: 2.54, right: 1.91, bottom: 2.54, left: 1.91 } },
  { id: 'wide', label: 'Ancho', margins: { top: 2.54, right: 5.08, bottom: 2.54, left: 5.08 } }
]

/** Sin configuración guardada, el documento es A4 vertical con 2,5 cm: lo que Tintero hacía siempre. */
export const DEFAULT_PAGE_SETUP: PageSetup = {
  size: { width: 21, height: 29.7 },
  orientation: 'portrait',
  margins: uniform(2.5)
}

/** Límites razonables: ni una hoja de sello ni un cartel, y siempre al menos 2 cm de texto útil. */
const MIN_PAPER_CM = 7
const MAX_PAPER_CM = 60
const MIN_CONTENT_CM = 2
const PX_PER_CM = 96 / 2.54
/** Separación gris entre hojas en pantalla (no existe al imprimir). */
const SHEET_GAP_PX = 24
/** Dos centímetros con dos decimales bastan: más precisión solo es ruido en el archivo. */
const round2 = (value: number) => Math.round(value * 100) / 100

/** Ancho y alto reales de la hoja, con la orientación aplicada. */
export function orientedSize(setup: PageSetup): { width: number; height: number } {
  const { width, height } = setup.size
  return setup.orientation === 'landscape' ? { width: height, height: width } : { width, height }
}

/** Medidas de la hoja en píxeles CSS (96 por pulgada), las que usan la pantalla y la paginación. */
export interface PageGeometry {
  width: number
  height: number
  margins: PageMargins
  contentWidth: number
  contentHeight: number
  /** Distancia en pantalla del principio de una hoja al de la siguiente. */
  pitch: number
  gap: number
}

export function pageGeometry(setup: PageSetup): PageGeometry {
  const size = orientedSize(setup)
  const toPx = (cm: number) => cm * PX_PER_CM
  const margins = {
    top: toPx(setup.margins.top),
    right: toPx(setup.margins.right),
    bottom: toPx(setup.margins.bottom),
    left: toPx(setup.margins.left)
  }
  const width = toPx(size.width)
  const height = toPx(size.height)
  return {
    width,
    height,
    margins,
    contentWidth: width - margins.left - margins.right,
    contentHeight: height - margins.top - margins.bottom,
    pitch: height + SHEET_GAP_PX,
    gap: SHEET_GAP_PX
  }
}

/** Papel conocido que coincide con el tamaño (en cualquier orientación), o null si es personalizado. */
export function paperSizeOf(setup: PageSetup): PaperSize | null {
  const close = (a: number, b: number) => Math.abs(a - b) < 0.05
  return (
    PAPER_SIZES.find((paper) => close(paper.width, setup.size.width) && close(paper.height, setup.size.height)) ?? null
  )
}

export function marginPresetOf(setup: PageSetup): MarginPreset | null {
  const { margins } = setup
  return (
    MARGIN_PRESETS.find((preset) =>
      (Object.keys(margins) as (keyof PageMargins)[]).every(
        (side) => Math.abs(preset.margins[side] - margins[side]) < 0.01
      )
    ) ?? null
  )
}

export function isDefaultPageSetup(setup: PageSetup): boolean {
  return (
    setup.orientation === DEFAULT_PAGE_SETUP.orientation &&
    paperSizeOf(setup)?.id === 'a4' &&
    marginPresetOf(setup)?.id === 'normal'
  )
}

/**
 * Devuelve una configuración válida a partir de cualquier cosa (un archivo editado a mano, un .docx
 * raro): tamaños dentro de límites, ancho menor que alto y márgenes que dejan sitio al texto.
 * Si no hay nada aprovechable, null (y el documento usa la configuración por defecto).
 */
export function normalizePageSetup(raw: unknown): PageSetup | null {
  const candidate = raw as Partial<PageSetup> | null | undefined
  if (!candidate || typeof candidate !== 'object') return null
  const width = finite(candidate.size?.width)
  const height = finite(candidate.size?.height)
  if (width === null || height === null) return null
  const clampPaper = (cm: number) => round2(Math.min(MAX_PAPER_CM, Math.max(MIN_PAPER_CM, cm)))
  // Un tamaño "apaisado" escrito a mano se guarda en vertical y se gira con la orientación.
  const size = { width: clampPaper(Math.min(width, height)), height: clampPaper(Math.max(width, height)) }
  const orientation: PageOrientation = candidate.orientation === 'landscape' ? 'landscape' : 'portrait'
  const margins = candidate.margins ?? DEFAULT_PAGE_SETUP.margins
  const setup: PageSetup = {
    size,
    orientation,
    margins: {
      top: finite(margins.top) ?? DEFAULT_PAGE_SETUP.margins.top,
      right: finite(margins.right) ?? DEFAULT_PAGE_SETUP.margins.right,
      bottom: finite(margins.bottom) ?? DEFAULT_PAGE_SETUP.margins.bottom,
      left: finite(margins.left) ?? DEFAULT_PAGE_SETUP.margins.left
    }
  }
  return withMargins(setup, setup.margins)
}

/**
 * Cambia los márgenes asegurando que queda texto útil: si dos márgenes opuestos no caben, se
 * reducen los dos en la misma proporción. Así arrastrar un margen en la regla nunca "rompe" la hoja.
 */
export function withMargins(setup: PageSetup, margins: Partial<PageMargins>): PageSetup {
  const size = orientedSize(setup)
  const next = { ...setup.margins, ...margins }
  const fit = (a: number, b: number, available: number): [number, number] => {
    const first = Math.max(0, a)
    const second = Math.max(0, b)
    const max = available - MIN_CONTENT_CM
    if (first + second <= max) return [round2(first), round2(second)]
    const scale = max / (first + second)
    return [round2(first * scale), round2(second * scale)]
  }
  const [left, right] = fit(next.left, next.right, size.width)
  const [top, bottom] = fit(next.top, next.bottom, size.height)
  return { ...setup, margins: { top, right, bottom, left } }
}

export function withOrientation(setup: PageSetup, orientation: PageOrientation): PageSetup {
  if (orientation === setup.orientation) return setup
  // Como en los procesadores de texto: al girar la hoja, los márgenes giran con ella.
  const { top, right, bottom, left } = setup.margins
  const turned =
    orientation === 'landscape'
      ? { top: left, right: top, bottom: right, left: bottom }
      : { top: right, right: bottom, bottom: left, left: top }
  return withMargins({ ...setup, orientation }, turned)
}

export function withPaperSize(setup: PageSetup, size: { width: number; height: number }): PageSetup {
  return withMargins(normalizePageSetup({ ...setup, size }) ?? setup, setup.margins)
}

/** Valor de `size` de la regla `@page`, con la orientación ya aplicada. */
export function cssPageSize(setup: PageSetup): string {
  const { width, height } = orientedSize(setup)
  return `${width}cm ${height}cm`
}

/** "2,5 cm": decimales con coma, como en el resto de la interfaz. */
export function formatCm(cm: number): string {
  return `${round2(cm).toLocaleString('es-ES')} cm`
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
