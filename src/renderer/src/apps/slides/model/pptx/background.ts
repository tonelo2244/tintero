import { cssColorToHex } from '@/core/office/cssValues'

/**
 * Fondos de los temas -> franjas de color sólido.
 *
 * Los temas usan `background` de CSS, a veces con `linear-gradient` de cortes bruscos
 * (p. ej. Bosque: verde oscuro hasta el 78 % y una franja clara a la derecha). PowerPoint
 * sí tiene degradados, pero la librería que usamos no los expone, así que cada tramo del
 * degradado se convierte en un rectángulo de su color medio. Los cortes bruscos quedan
 * exactos; los degradados suaves se aproximan.
 */
export interface BackgroundBand {
  /** Inicio y fin del tramo, de 0 a 1, en el eje del degradado. */
  start: number
  end: number
  color: string
}

export interface SlideBackground {
  /** 'x': franjas verticales (de izquierda a derecha); 'y': horizontales (de arriba abajo). */
  axis: 'x' | 'y'
  bands: BackgroundBand[]
}

interface ColorStop {
  color: string
  position: number
}

const FALLBACK: SlideBackground = { axis: 'x', bands: [{ start: 0, end: 1, color: 'FFFFFF' }] }

export function parseBackground(css: string): SlideBackground {
  const solid = cssColorToHex(css)
  if (solid) return { axis: 'x', bands: [{ start: 0, end: 1, color: solid }] }

  const gradient = /^linear-gradient\((.*)\)$/s.exec(css.trim())
  if (!gradient) return FALLBACK

  const [direction, ...stopTexts] = splitTopLevelCommas(gradient[1])
  // Los temas solo usan 90deg (izquierda -> derecha) y 180deg (arriba -> abajo).
  const axis = direction.trim() === '180deg' ? 'y' : 'x'
  const stops = stopTexts.map(parseStop).filter((stop): stop is ColorStop => stop !== null)
  if (stops.length === 0) return FALLBACK

  return { axis, bands: bandsFromStops(stops) }
}

function bandsFromStops(stops: ColorStop[]): BackgroundBand[] {
  const bands: BackgroundBand[] = []
  const first = stops[0]
  if (first.position > 0) bands.push({ start: 0, end: first.position, color: first.color })

  for (let index = 0; index < stops.length - 1; index++) {
    const from = stops[index]
    const to = stops[index + 1]
    // Dos paradas en la misma posición = corte brusco: no hay tramo entre ellas.
    if (to.position > from.position) {
      bands.push({ start: from.position, end: to.position, color: mixColors(from.color, to.color) })
    }
  }

  const last = stops[stops.length - 1]
  if (last.position < 1) bands.push({ start: last.position, end: 1, color: last.color })
  return bands
}

/** "#1c2a22 78%" -> { color: '1C2A22', position: 0.78 }. Sin porcentaje, se reparte como hace CSS (simplificado). */
function parseStop(text: string): ColorStop | null {
  const match = /^(.*?)\s+(-?[\d.]+)%$/.exec(text.trim())
  const color = cssColorToHex(match ? match[1] : text)
  if (!color) return null
  return { color, position: match ? Math.min(1, Math.max(0, Number(match[2]) / 100)) : 0 }
}

function splitTopLevelCommas(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  parts.push(current)
  return parts
}

/** Punto medio entre dos colores "RRGGBB". */
export function mixColors(a: string, b: string): string {
  const channel = (hex: string, index: number) => parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  return [0, 1, 2]
    .map((index) => Math.round((channel(a, index) + channel(b, index)) / 2))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}
