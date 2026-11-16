/**
 * Zoom de Texto: los límites y las cuentas de "Una página" y "Ancho de página". Puro: recibe el
 * tamaño del lienzo y de la hoja en píxeles y devuelve el factor (1 = 100 %). Quien mide el DOM es
 * WriterEditor; aquí solo hay aritmética que se prueba sin pantalla (zoom.test.ts).
 */

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 2

/** Presets de la pestaña Vista, como en Word. */
export type ZoomPreset = 'actual' | 'onePage' | 'pageWidth' | 'multiPage'

/** Zooms fijos del desplegable. */
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2]

/** Aire que se deja alrededor de la hoja al ajustar, para que la sombra no toque el borde. */
const FIT_PADDING_PX = 24

export const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100))

export interface FitArea {
  /** Ancho y alto visibles del lienzo (sin barras de desplazamiento). */
  width: number
  height: number
}

export interface SheetSize {
  width: number
  height: number
}

/**
 * Factor de zoom para un preset. `chromeHeight` es lo que ocupa encima de la hoja y no escala con
 * ella del todo (el relleno del lienzo); la regla sí escala, y va dentro de `sheet.height` si se pinta.
 */
export function zoomForPreset(preset: ZoomPreset, area: FitArea, sheet: SheetSize, chromeHeight = 0): number {
  if (preset === 'actual') return 1
  if (preset === 'multiPage') return multiPageLayout(area, sheet, 0, chromeHeight).zoom
  const byWidth = (area.width - 2 * FIT_PADDING_PX) / sheet.width
  if (preset === 'pageWidth') return clampZoom(byWidth)
  const byHeight = (area.height - chromeHeight - FIT_PADDING_PX) / sheet.height
  return clampZoom(Math.min(byWidth, byHeight))
}

/** Siguiente paso de zoom hacia arriba o abajo (los botones + y − de la barra de estado). */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  return clampZoom(Math.round((zoom + direction * 0.1) * 10) / 10)
}

/** Hojas por fila como mínimo en "Varias páginas": si no, sería "Una página". */
const MIN_PAGES_ACROSS = 2
const MAX_PAGES_ACROSS = 6

export interface MultiPageLayout {
  zoom: number
  /** Hojas en cada fila. */
  across: number
}

/**
 * "Varias páginas": hojas enteras a la vista, una al lado de otra. El zoom hace que una hoja quepa
 * de alto; caben tantas por fila como permita el ancho (al menos dos: si no caben, se reduce más).
 */
export function multiPageLayout(area: FitArea, sheet: SheetSize, gap: number, chromeHeight = 0): MultiPageLayout {
  const byHeight = (area.height - chromeHeight - FIT_PADDING_PX) / sheet.height
  const width = area.width - 2 * FIT_PADDING_PX
  const fits = (zoom: number) => Math.floor((width / zoom + gap) / (sheet.width + gap))
  let zoom = clampZoom(byHeight)
  if (fits(zoom) < MIN_PAGES_ACROSS) {
    zoom = clampZoom(width / (MIN_PAGES_ACROSS * sheet.width + (MIN_PAGES_ACROSS - 1) * gap))
  }
  const across = Math.min(MAX_PAGES_ACROSS, Math.max(MIN_PAGES_ACROSS, fits(zoom)))
  return { zoom, across }
}
