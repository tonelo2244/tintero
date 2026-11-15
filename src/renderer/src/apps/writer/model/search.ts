import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/**
 * Búsqueda de texto sobre el documento de ProseMirror. Es lógica pura (sin editor ni DOM):
 * recibe el documento y devuelve posiciones, así se prueba con tests y la reutiliza la extensión.
 */

export interface SearchOptions {
  matchCase: boolean
  wholeWord: boolean
}

export interface TextRange {
  from: number
  to: number
}

/**
 * Los nodos en línea que no son texto (saltos de línea, imágenes) cuentan como un carácter
 * "separador": una coincidencia nunca los atraviesa, igual que en Word.
 */
const INLINE_SEPARATOR = '￼'

/** Letras y números de cualquier idioma: "camión" es una palabra entera, no "cami" + "n". */
const WORD_CHAR = '[\\p{L}\\p{N}_]'

export function buildSearchRegExp(query: string, options: SearchOptions): RegExp | null {
  if (!query) return null
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = options.wholeWord ? `(?<!${WORD_CHAR})${escaped}(?!${WORD_CHAR})` : escaped
  return new RegExp(pattern, options.matchCase ? 'gu' : 'giu')
}

/** Todas las coincidencias, en orden. Busca párrafo a párrafo: nunca une texto de dos bloques. */
export function findMatches(doc: ProseMirrorNode, query: string, options: SearchOptions): TextRange[] {
  const regexp = buildSearchRegExp(query, options)
  if (!regexp) return []

  const matches: TextRange[] = []
  doc.descendants((block, blockPos) => {
    if (!block.isTextblock) return true

    // Texto del párrafo + la posición del documento donde empieza cada carácter.
    let text = ''
    const positions: number[] = []
    block.forEach((child, offset) => {
      const start = blockPos + 1 + offset
      const piece = child.isText ? child.text! : INLINE_SEPARATOR
      for (let index = 0; index < piece.length; index++) positions.push(start + index)
      text += piece
    })

    for (const match of text.matchAll(regexp)) {
      if (match[0].length === 0) continue
      const first = match.index
      const last = first + match[0].length - 1
      matches.push({ from: positions[first], to: positions[last] + 1 })
    }
    return false
  })
  return matches
}

/**
 * Índice de la coincidencia a la que saltar desde `position`. Si se llega al final del documento,
 * vuelve a empezar (como Word). -1 si no hay coincidencias.
 */
export function nextMatchIndex(matches: TextRange[], position: number, direction: 1 | -1): number {
  if (matches.length === 0) return -1
  if (direction === 1) {
    const index = matches.findIndex((match) => match.from >= position)
    return index === -1 ? 0 : index
  }
  for (let index = matches.length - 1; index >= 0; index--) {
    if (matches[index].to <= position) return index
  }
  return matches.length - 1
}

/** Índice de la coincidencia que ocupa exactamente la selección, o -1. */
export function matchIndexAt(matches: TextRange[], selection: TextRange): number {
  return matches.findIndex((match) => match.from === selection.from && match.to === selection.to)
}
