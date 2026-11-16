import type { JSONContent } from '@tiptap/core'

/**
 * Notas al pie y al final (fase 17). Una nota es un nodo en línea (`note`) en el punto del texto
 * donde va su número; el texto de la nota viaja dentro del nodo. Así cortar, pegar o deshacer
 * mueven la nota con su referencia, sin una lista aparte que mantener sincronizada.
 *
 * El número no se guarda: se calcula por el orden en el documento (renumeración automática). Las
 * notas al pie van con 1, 2, 3...; las del final con i, ii, iii..., como en Word.
 */

export const NOTE = 'note'

export type NoteKind = 'footnote' | 'endnote'

export const isNoteKind = (value: unknown): value is NoteKind => value === 'footnote' || value === 'endnote'

export const NOTE_KIND_LABELS: Record<NoteKind, string> = {
  footnote: 'Nota al pie',
  endnote: 'Nota al final'
}

/** Una nota tal como la ve quien la numera: su id, su tipo y su texto, en orden del documento. */
export interface NoteInfo {
  id: string
  kind: NoteKind
  text: string
}

/** Notas del documento en orden de aparición (dentro de tablas, listas y cuadros también). */
export function listNotes(doc: JSONContent): NoteInfo[] {
  const notes: NoteInfo[] = []
  const visit = (node: JSONContent) => {
    if (node.type === NOTE) {
      const kind = isNoteKind(node.attrs?.kind) ? node.attrs.kind : 'footnote'
      notes.push({ id: String(node.attrs?.id ?? ''), kind, text: String(node.attrs?.text ?? '') })
    }
    node.content?.forEach(visit)
  }
  visit(doc)
  return notes
}

/** Número de cada nota (por id), contando cada tipo por separado: pies 1, 2, 3; finales 1, 2, 3. */
export function noteNumbers(notes: readonly Pick<NoteInfo, 'id' | 'kind'>[]): Map<string, number> {
  const counters: Record<NoteKind, number> = { footnote: 0, endnote: 0 }
  const numbers = new Map<string, number>()
  for (const note of notes) numbers.set(note.id, ++counters[note.kind])
  return numbers
}

/** Lo que se escribe como marca de la nota: "3" para una al pie, "iii" para una al final. */
export function noteMark(kind: NoteKind, number: number): string {
  return kind === 'endnote' ? toRoman(number).toLowerCase() : String(number)
}

const ROMAN: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I']
]

/** Número romano (1–3999). Fuera de rango, el número tal cual. */
export function toRoman(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 3999) return String(value)
  let rest = value
  let roman = ''
  for (const [amount, letters] of ROMAN) {
    while (rest >= amount) {
      roman += letters
      rest -= amount
    }
  }
  return roman
}

/**
 * Notas al pie de cada hoja: la hoja de una nota es la de su referencia (`pageOf` es la de la
 * paginación). Devuelve, por hoja (desde 1), los ids en orden.
 */
export function footnotesByPage<T extends { kind: NoteKind; pos: number }>(
  notes: readonly T[],
  pageOf: (pos: number) => number
): Map<number, T[]> {
  const pages = new Map<number, T[]>()
  for (const note of notes) {
    if (note.kind !== 'footnote') continue
    const page = pageOf(note.pos)
    const list = pages.get(page)
    if (list) list.push(note)
    else pages.set(page, [note])
  }
  return pages
}
