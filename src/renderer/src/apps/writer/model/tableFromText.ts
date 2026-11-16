import type { JSONContent } from '@tiptap/core'

/**
 * Convertir texto en tabla (fase 16): cada párrafo es una fila y sus trozos, las celdas. Como en
 * Word, el separador se adivina: tabulaciones si las hay, si no punto y coma; sin ninguno, cada
 * párrafo es una celda. La coma no se usa: en español es la coma decimal ("4,5").
 */

export type TextSeparator = 'tab' | ';' | null

/** Inline de un párrafo, en JSON. */
type Inline = JSONContent[]

const TAB_NODE = 'tab'

export function detectSeparator(paragraphs: JSONContent[]): TextSeparator {
  const inlines = paragraphs.flatMap((paragraph) => paragraph.content ?? [])
  if (inlines.some((node) => node.type === TAB_NODE)) return 'tab'
  if (inlines.some((node) => node.type === 'text' && node.text?.includes(';'))) return ';'
  return null
}

/** Parte el contenido de un párrafo en celdas, conservando las marcas (negrita, color...) de cada trozo. */
export function splitInline(content: Inline, separator: TextSeparator): Inline[] {
  const cells: Inline[] = [[]]
  const current = () => cells[cells.length - 1]
  for (const node of content) {
    if (separator === 'tab' && node.type === TAB_NODE) {
      cells.push([])
    } else if (separator === ';' && node.type === 'text' && node.text?.includes(';')) {
      node.text.split(';').forEach((piece, index) => {
        if (index > 0) cells.push([])
        if (piece) current().push({ ...node, text: piece })
      })
    } else {
      current().push(node)
    }
  }
  return cells.map(trimCell)
}

/** Sin espacios al principio ni al final de la celda ("Ana; 30" -> "Ana" y "30"). */
function trimCell(cell: Inline): Inline {
  const trimmed = cell.map((node) => ({ ...node }))
  const first = trimmed[0]
  if (first?.type === 'text') first.text = first.text?.replace(/^\s+/, '')
  const last = trimmed[trimmed.length - 1]
  if (last?.type === 'text') last.text = last.text?.replace(/\s+$/, '')
  return trimmed.filter((node) => node.type !== 'text' || node.text)
}

/**
 * Párrafos -> tabla de Tiptap. Todas las filas tienen tantas celdas como la más larga (las que
 * faltan van vacías). Sin párrafos, null.
 */
export function paragraphsToTable(
  paragraphs: JSONContent[],
  separator = detectSeparator(paragraphs)
): JSONContent | null {
  if (paragraphs.length === 0) return null
  const rows = paragraphs.map((paragraph) => splitInline(paragraph.content ?? [], separator))
  const columns = Math.max(...rows.map((cells) => cells.length))
  return {
    type: 'table',
    content: rows.map((cells) => ({
      type: 'tableRow',
      content: Array.from({ length: columns }, (_, index) => ({
        type: 'tableCell',
        content: [cells[index]?.length ? { type: 'paragraph', content: cells[index] } : { type: 'paragraph' }]
      }))
    }))
  }
}
