import type { JSONContent } from '@tiptap/core'

/**
 * Letra capital (fase 16): la primera letra del párrafo, grande, ocupando tres renglones. "En texto"
 * la mete en el párrafo; "En margen", a su izquierda. En pantalla es CSS (`::first-letter`); en el
 * .docx, un marco de Word (`w:framePr w:dropCap`) con la letra, que es como lo guarda Word.
 */

export type DropCapMode = 'drop' | 'margin'

export const DROP_CAP_MODES: { mode: DropCapMode | null; label: string }[] = [
  { mode: null, label: 'Ninguna' },
  { mode: 'drop', label: 'En texto' },
  { mode: 'margin', label: 'En margen' }
]

/** Renglones que ocupa la letra (el valor por defecto de Word). */
export const DROP_CAP_LINES = 3

export const isDropCapMode = (value: unknown): value is DropCapMode => value === 'drop' || value === 'margin'

/**
 * Separa la primera letra del resto del párrafo, con sus marcas. Si el párrafo no empieza por
 * texto (una imagen, un campo) o está vacío, null: no hay letra que agrandar.
 */
export function splitDropCap(content: JSONContent[]): { letter: JSONContent; rest: JSONContent[] } | null {
  const [first, ...others] = content
  if (first?.type !== 'text' || !first.text) return null
  // Array.from respeta los caracteres de más de una unidad (emojis, letras fuera del plano básico).
  const [letter, ...tail] = Array.from(first.text)
  if (!letter.trim()) return null
  const rest = tail.length > 0 ? [{ ...first, text: tail.join('') }, ...others] : others
  return { letter: { ...first, text: letter }, rest }
}
