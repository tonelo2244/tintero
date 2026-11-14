/**
 * Traducción de valores CSS (como los guarda el editor) a lo que esperan los formatos de Office.
 * Puro y sin DOM: lo usan los exportadores de .docx y .pptx y sus tests.
 */

/** "#abc", "#aabbcc" o "rgb(1, 2, 3)" -> "AABBCC". null si no se entiende el color. */
export function cssColorToHex(color: string | null | undefined): string | null {
  if (!color) return null
  const value = color.trim().toLowerCase()

  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(value)
  if (short)
    return short
      .slice(1)
      .map((digit) => digit + digit)
      .join('')
      .toUpperCase()

  const long = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(value)
  if (long) return long[1].toUpperCase()

  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value)
  if (rgb) {
    return rgb
      .slice(1, 4)
      .map((channel) => Math.min(255, Number(channel)).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  }
  return null
}

/** '"Times New Roman", Times, serif' -> "Times New Roman". Office guarda un único nombre de fuente. */
export function cssFontToName(fontFamily: string | null | undefined): string | null {
  if (!fontFamily) return null
  const first = fontFamily
    .split(',')[0]
    ?.trim()
    .replace(/^["']|["']$/g, '')
  return first || null
}

/** "12pt" -> 12, "16px" -> 12, "12" -> 12 (puntos). null si no es un tamaño absoluto. */
export function cssSizeToPt(size: string | null | undefined): number | null {
  if (!size) return null
  const match = /^\s*([\d.]+)\s*(pt|px)?\s*$/i.exec(size)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) return null
  return match[2]?.toLowerCase() === 'px' ? Math.round(value * 0.75 * 2) / 2 : value
}
