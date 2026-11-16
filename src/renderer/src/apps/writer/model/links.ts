import type { JSONContent } from '@tiptap/core'

/**
 * Vínculos y marcadores (fase 16). Funciones puras: qué dirección guardar a partir de lo que se
 * escribe en el cuadro, cómo se llama un marcador válido y qué marcadores hay en el documento.
 *
 * Un vínculo a un marcador es un vínculo normal cuyo destino es `#nombre`, igual que en HTML; así la
 * marca `link` de Tiptap sirve para los dos y el .docx los distingue por ese `#`.
 */

/** Esquemas que se guardan tal cual. Cualquier otro texto se trata como una web o un correo. */
const KNOWN_SCHEME = /^(https?|mailto|tel|file):/i
const EMAIL = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/

/**
 * Dirección que se guarda a partir de lo que escribe la persona: "tintero.app" pasa a
 * "https://tintero.app" y "ana@correo.es" a "mailto:ana@correo.es", como hace Word. Vacía, `null`.
 */
export function normalizeHref(input: string): string | null {
  const value = input.trim()
  if (!value) return null
  if (value.startsWith('#') || KNOWN_SCHEME.test(value)) return value
  if (EMAIL.test(value)) return `mailto:${value}`
  return `https://${value}`
}

export const bookmarkHref = (name: string) => `#${name}`

/** Nombre del marcador al que apunta un vínculo interno, o null si es externo. */
export function bookmarkOfHref(href: string | null | undefined): string | null {
  return href?.startsWith('#') && href.length > 1 ? href.slice(1) : null
}

export const BOOKMARK_NAME_MAX = 40

/**
 * Las reglas de Word, para que el marcador sobreviva al .docx: empieza por letra, solo letras,
 * números y guion bajo (sin espacios), y como mucho 40 caracteres.
 */
export function isValidBookmarkName(name: string): boolean {
  return name.length <= BOOKMARK_NAME_MAX && /^\p{L}[\p{L}\p{N}_]*$/u.test(name)
}

/**
 * Nombre propuesto a partir del texto seleccionado ("Resultados del año" -> "Resultados_del_año").
 * Si no queda nada válido, "Marcador".
 */
export function suggestBookmarkName(text: string): string {
  const cleaned = text
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_]/gu, '')
    .replace(/^[^\p{L}]+/u, '')
    .slice(0, BOOKMARK_NAME_MAX)
  return cleaned || 'Marcador'
}

/** Nombre que no choca con los que ya hay: "Marcador", "Marcador2", "Marcador3"... */
export function uniqueBookmarkName(name: string, existing: readonly string[]): string {
  if (!existing.includes(name)) return name
  for (let index = 2; ; index++) {
    const suffix = String(index)
    const candidate = `${name.slice(0, BOOKMARK_NAME_MAX - suffix.length)}${suffix}`
    if (!existing.includes(candidate)) return candidate
  }
}

export const BOOKMARK = 'bookmark'

/** Marcadores del documento, en orden de aparición. Los ocultos de Word (`_GoBack`, `_Toc…`) no salen. */
export function listBookmarks(doc: JSONContent): string[] {
  const names: string[] = []
  const visit = (node: JSONContent) => {
    if (node.type === BOOKMARK) {
      const name = node.attrs?.name
      if (typeof name === 'string' && name && !isHiddenBookmark(name) && !names.includes(name)) names.push(name)
    }
    node.content?.forEach(visit)
  }
  visit(doc)
  return names
}

/** Word crea marcadores propios que empiezan por "_" (la última edición, las entradas del índice...). */
export const isHiddenBookmark = (name: string) => name.startsWith('_')
