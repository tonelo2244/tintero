import { attr, child, childElements, path } from '@/core/office/xml'

/**
 * Colores y fuentes del tema de PowerPoint (`ppt/theme/theme1.xml`).
 *
 * En PowerPoint casi nada lleva un color RGB fijo: el texto es "tx1", el fondo "bg1", las formas
 * "accent1"... y además se aclaran u oscurecen con modificadores (`lumMod`, `lumOff`, `tint`,
 * `shade`). Para ver el color real hay que resolver tres capas:
 *   1. el mapa del patrón (`p:clrMap`): bg1 -> lt1, tx1 -> dk1...
 *   2. el esquema del tema (`a:clrScheme`): lt1 -> FFFFFF, accent1 -> 4472C4...
 *   3. los modificadores, sobre el color en HSL, como hace PowerPoint.
 */

export interface PptxThemeInfo {
  name: string | null
  /** Colores del esquema por nombre (dk1, lt1, dk2, lt2, accent1..6, hlink, folHlink), en "RRGGBB". */
  scheme: Record<string, string>
  /** Fuente de títulos (major) y de texto (minor). */
  majorFont: string | null
  minorFont: string | null
}

export function readThemeInfo(theme: Element | null): PptxThemeInfo {
  const elements = path(theme, 'themeElements')
  const scheme: Record<string, string> = {}
  for (const entry of childElements(child(elements, 'clrScheme'))) {
    const color = explicitColor(childElements(entry)[0] ?? null)
    if (color) scheme[entry.localName] = color
  }
  const font = (kind: 'majorFont' | 'minorFont') => {
    const typeface = attr(path(elements, 'fontScheme', kind, 'latin'), 'typeface')
    return typeface || null
  }
  return { name: attr(theme, 'name'), scheme, majorFont: font('majorFont'), minorFont: font('minorFont') }
}

/** Mapa del patrón: nombre que usan las formas -> nombre del esquema. Sin mapa, el estándar. */
export function readColorMap(master: Element | null): Record<string, string> {
  const map: Record<string, string> = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' }
  const clrMap = child(master, 'clrMap')
  if (clrMap) {
    for (const attribute of Array.from(clrMap.attributes)) map[attribute.localName ?? attribute.name] = attribute.value
  }
  return map
}

export type ColorResolver = (colorParent: Element | null) => string | null

/**
 * Devuelve una función que, dado un elemento que contiene un color (a:solidFill, a:gs, a:fontRef...),
 * da su valor "RRGGBB" o null si no hay color.
 */
export function createColorResolver(theme: PptxThemeInfo, colorMap: Record<string, string>): ColorResolver {
  return (colorParent) => {
    const colorElement = childElements(colorParent).find((element) => COLOR_ELEMENTS.has(element.localName))
    if (!colorElement) return null
    let base: string | null
    if (colorElement.localName === 'schemeClr') {
      const name = attr(colorElement, 'val') ?? ''
      // phClr = "el color del marcador" (lo usa el estilo de fondo); sin contexto, el texto principal.
      const schemeName = name === 'phClr' ? (colorMap.tx1 ?? 'dk1') : (colorMap[name] ?? name)
      base = theme.scheme[schemeName] ?? null
    } else {
      base = explicitColor(colorElement)
    }
    return base ? applyModifiers(base, colorElement) : null
  }
}

const COLOR_ELEMENTS = new Set(['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr'])

const PRESET_COLORS: Record<string, string> = {
  black: '000000',
  white: 'FFFFFF',
  red: 'FF0000',
  green: '008000',
  blue: '0000FF',
  yellow: 'FFFF00',
  gray: '808080'
}

/** Colores que no dependen del tema. */
function explicitColor(element: Element | null): string | null {
  if (!element) return null
  let value: string | null = null
  if (element.localName === 'srgbClr') value = attr(element, 'val')
  else if (element.localName === 'sysClr') value = attr(element, 'lastClr')
  else if (element.localName === 'prstClr') value = PRESET_COLORS[attr(element, 'val') ?? ''] ?? null
  return value && /^[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : null
}

/** Modificadores de DrawingML. Los valores vienen en milésimas de porcentaje (50000 = 50 %). */
function applyModifiers(hex: string, colorElement: Element): string {
  let [r, g, b] = hexToRgb(hex)
  for (const modifier of childElements(colorElement)) {
    const amount = Number(attr(modifier, 'val')) / 100000
    if (!Number.isFinite(amount)) continue
    switch (modifier.localName) {
      case 'lumMod':
      case 'lumOff': {
        const [h, s, l] = rgbToHsl(r, g, b)
        const lightness = modifier.localName === 'lumMod' ? l * amount : l + amount
        ;[r, g, b] = hslToRgb(h, s, Math.min(1, Math.max(0, lightness)))
        break
      }
      case 'tint': // hacia blanco: amount = cuánto queda del color original
        ;[r, g, b] = [r, g, b].map((channel) => channel + (255 - channel) * (1 - amount)) as [number, number, number]
        break
      case 'shade': // hacia negro
        ;[r, g, b] = [r, g, b].map((channel) => channel * amount) as [number, number, number]
        break
    }
  }
  return rgbToHex(r, g, b)
}

function hexToRgb(hex: string): [number, number, number] {
  return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16)) as [number, number, number]
}

function rgbToHex(r: number, g: number, b: number): string {
  return [r, g, b]
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')
    .toUpperCase()
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const [red, green, blue] = [r / 255, g / 255, b / 255]
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2
  if (max === min) return [0, 0, lightness]
  const delta = max - min
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let hue: number
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0)
  else if (max === green) hue = (blue - red) / delta + 2
  else hue = (red - green) / delta + 4
  return [hue / 6, saturation, lightness]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (offset: number) => {
    let t = h + offset
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return (p + (q - p) * 6 * t) * 255
    if (t < 1 / 2) return q * 255
    if (t < 2 / 3) return (p + (q - p) * (2 / 3 - t) * 6) * 255
    return p * 255
  }
  return [channel(1 / 3), channel(0), channel(-1 / 3)]
}

/**
 * Fondo de una diapositiva, diseño o patrón (`p:cSld/p:bg`) -> valor CSS de `background`.
 * `imageUrl` resuelve una imagen de fondo (r:embed) a una URL de datos; null si no se puede.
 * Devuelve null si la parte no define fondo (lo hereda de la siguiente).
 */
export function backgroundCss(
  root: Element | null,
  resolve: ColorResolver,
  imageUrl: (embedId: string) => string | null
): string | null {
  const background = path(root, 'cSld', 'bg')
  if (!background) return null
  const properties = child(background, 'bgPr')
  if (!properties) {
    // p:bgRef: un estilo de fondo del tema con un color; nos quedamos con el color.
    const color = resolve(child(background, 'bgRef'))
    return color ? `#${color.toLowerCase()}` : null
  }
  const solid = resolve(child(properties, 'solidFill'))
  if (solid) return `#${solid.toLowerCase()}`
  const gradient = child(properties, 'gradFill')
  if (gradient) return gradientCss(gradient, resolve)
  const embedId = attr(path(properties, 'blipFill', 'blip'), 'embed')
  if (embedId) {
    const url = imageUrl(embedId)
    return url ? `url("${url}") center / cover no-repeat` : null
  }
  const pattern = child(properties, 'pattFill') // trama: se queda en su color de primer plano
  const patternColor = resolve(child(pattern, 'fgClr'))
  return patternColor ? `#${patternColor.toLowerCase()}` : null
}

function gradientCss(gradient: Element, resolve: ColorResolver): string | null {
  const stops = childElements(child(gradient, 'gsLst'), 'gs')
    .map((stop) => ({ position: Number(attr(stop, 'pos') ?? 0) / 1000, color: resolve(stop) }))
    .filter((stop): stop is { position: number; color: string } => stop.color !== null)
    .sort((a, b) => a.position - b.position)
  if (stops.length === 0) return null
  if (stops.length === 1) return `#${stops[0].color.toLowerCase()}`
  // a:lin@ang: ángulo en 60000 de grado, 0 = de izquierda a derecha. En CSS, 90deg es eso mismo.
  const angle = Number(attr(child(gradient, 'lin'), 'ang') ?? 0) / 60000
  const cssAngle = Math.round((angle + 90) % 360)
  const list = stops.map((stop) => `#${stop.color.toLowerCase()} ${Math.round(stop.position * 10) / 10}%`).join(', ')
  return `linear-gradient(${cssAngle}deg, ${list})`
}
