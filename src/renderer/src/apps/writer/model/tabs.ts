import { DEFAULT_TAB_STEP_CM, type TabStop } from './paragraphFormat'

/**
 * Anchos de los tabuladores de un párrafo, sin DOM: la extensión editor/TabStops.ts mide y aplica.
 *
 * Cada tabulador se mide con ancho 0 (así está todo lo que va detrás sin desplazar) y con lo que
 * mide el texto que lo sigue hasta el siguiente tabulador. Recorriéndolos en orden, cada uno sabe
 * cuánto han empujado los anteriores y puede calcular el suyo:
 *   - izquierda: el texto empieza en el tope;
 *   - derecha: el texto termina en el tope;
 *   - centro: el texto queda centrado en el tope;
 *   - decimal: la coma (o el punto) queda en el tope.
 */

export interface MeasuredTab {
  /** Dónde empieza el tabulador, en cm desde el margen izquierdo, con ancho 0. */
  x: number
  /** Ancho del texto que lo sigue (hasta el siguiente tabulador o el final de la línea). */
  segmentWidth: number
  /** Ancho del texto que lo sigue hasta el separador decimal (o todo, si no hay). */
  decimalOffset: number
  /** El tabulador empieza una línea nueva (el texto ha saltado de línea): no arrastra desplazamientos. */
  newLine?: boolean
}

/** Tabulación mínima: si el tope está tan cerca que no cabe nada, se salta al siguiente. */
const MIN_TAB_CM = 0.05

export interface TabLayout {
  width: number
  /** Se rellena con puntos (tope con relleno, "Capítulo ....... 12"). */
  dotted: boolean
}

export function layoutTabs(tabs: MeasuredTab[], stops: TabStop[], lineWidth: number): TabLayout[] {
  const sorted = [...stops].sort((a, b) => a.position - b.position)
  const result: TabLayout[] = []
  let shift = 0
  for (const tab of tabs) {
    if (tab.newLine) shift = 0
    const x = tab.x + shift
    const stop = sorted.find((candidate) => candidate.position > x + MIN_TAB_CM)
    let width: number
    if (!stop) {
      const next = (Math.floor(x / DEFAULT_TAB_STEP_CM + 1e-6) + 1) * DEFAULT_TAB_STEP_CM
      width = Math.min(next, lineWidth) - x
    } else {
      const textBefore = {
        left: 0,
        right: tab.segmentWidth,
        center: tab.segmentWidth / 2,
        decimal: tab.decimalOffset
      }[stop.align]
      width = stop.position - textBefore - x
    }
    width = Math.max(MIN_TAB_CM, width)
    result.push({ width, dotted: stop?.leader === 'dot' })
    shift += width
  }
  return result
}
