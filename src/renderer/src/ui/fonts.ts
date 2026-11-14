/** Fuentes que existen en macOS y Windows (o tienen sustituto razonable). */
export const FONT_FAMILIES = [
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Calibri', value: 'Calibri, Carlito, "Segoe UI", Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Garamond', value: 'Garamond, "EB Garamond", Georgia, serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Sistema', value: 'system-ui, -apple-system, "Segoe UI", sans-serif' }
]

export const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 96]

export function nextFontSize(current: number, direction: 1 | -1): number {
  if (direction === 1) return FONT_SIZES.find((size) => size > current) ?? current
  return [...FONT_SIZES].reverse().find((size) => size < current) ?? current
}

export function fontLabel(value: string | undefined): string {
  if (!value) return ''
  return FONT_FAMILIES.find((font) => font.value === value)?.label ?? value.split(',')[0].replace(/"/g, '')
}
