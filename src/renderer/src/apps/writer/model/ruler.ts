/**
 * Cuentas de la regla horizontal, sin DOM: qué marcas pintar y cómo convertir un arrastre en
 * centímetros. Las posiciones se miden, como en los procesadores de texto, desde el margen izquierdo
 * (el 0 de la regla es donde empieza el texto).
 */

export const PX_PER_CM = 96 / 2.54
/** Los arrastres saltan de 0,25 en 0,25 cm: suficiente precisión y valores "redondos". */
export const RULER_STEP_CM = 0.25

export interface RulerTick {
  /** Centímetros desde el borde izquierdo de la hoja. */
  at: number
  kind: 'number' | 'half' | 'quarter'
  /** Número que se pinta (centímetros desde el margen), solo en las marcas enteras. */
  label?: number
}

/** Marcas cada 0,25 cm a lo ancho de toda la hoja, numeradas desde el margen izquierdo. */
export function rulerTicks(pageWidthCm: number, leftMarginCm: number): RulerTick[] {
  const ticks: RulerTick[] = []
  const first = Math.ceil(-leftMarginCm / RULER_STEP_CM)
  const last = Math.floor((pageWidthCm - leftMarginCm) / RULER_STEP_CM)
  for (let step = first; step <= last; step++) {
    const fromMargin = step * RULER_STEP_CM
    const at = leftMarginCm + fromMargin
    if (at < 0.1 || at > pageWidthCm - 0.1) continue
    if (step % 4 === 0) ticks.push({ at, kind: 'number', label: Math.abs(fromMargin) })
    else ticks.push({ at, kind: step % 2 === 0 ? 'half' : 'quarter' })
  }
  return ticks
}

export function snapCm(cm: number, step = RULER_STEP_CM): number {
  // `|| 0` evita el -0, que se ve raro en el archivo y en los tests.
  return Math.round(Math.round(cm / step) * step * 100) / 100 || 0
}

/** Píxeles arrastrados en pantalla -> centímetros de la hoja, descontando el zoom. */
export function dragDeltaCm(deltaPx: number, zoom: number): number {
  return deltaPx / (zoom || 1) / PX_PER_CM
}

export interface ParagraphIndents {
  /** Sangría izquierda desde el margen. */
  left: number
  /** Primera línea respecto a la sangría izquierda (negativa: francesa). */
  firstLine: number
}

/**
 * Límites al arrastrar las sangrías: el texto no puede salirse del área útil ni a la izquierda del
 * margen. La primera línea se mueve sola; la izquierda arrastra a la primera línea con ella (como en
 * Word, donde mover el cuadradito desplaza todo el párrafo).
 */
export function clampIndents(indents: ParagraphIndents, contentWidthCm: number): ParagraphIndents {
  const max = Math.max(0, contentWidthCm - 1)
  const left = Math.min(max, Math.max(0, indents.left))
  const firstLine = Math.min(max - left, Math.max(-left, indents.firstLine))
  return { left: snapCm(left), firstLine: snapCm(firstLine) }
}
