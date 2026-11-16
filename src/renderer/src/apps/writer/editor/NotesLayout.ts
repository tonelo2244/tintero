import { Decoration, type EditorView } from '@tiptap/pm/view'
import { NOTE_KIND_LABELS, noteMark } from '../model/notes'
import type { PlacedNote } from './references'

/**
 * Piezas de las notas para la paginación (fase 17). Las notas no son texto del documento: son
 * decoraciones (widgets) que pone la paginación, igual que los huecos entre hojas.
 *   - En pantalla, las notas al pie de cada hoja van en una capa por encima del texto, al pie de
 *     su hoja, en el sitio que la paginación les ha reservado.
 *   - Al imprimir, cada hoja lleva sus notas al pie justo antes del salto, empujadas hasta abajo.
 *   - Las notas al final van detrás del documento, como un bloque más que se reparte entre hojas.
 */

/** Alto de la raya que separa el texto de las notas al pie (con su aire). Igual que en global.css. */
export const NOTE_SEPARATOR_PX = 14

type OpenNote = (id: string) => void

/** Una nota como se ve: número y texto. Doble clic (o clic) abre su cuadro. */
function noteElement(note: PlacedNote, number: number): HTMLElement {
  const element = document.createElement('div')
  element.className = `writer-footnote writer-footnote--${note.kind}`
  element.dataset.noteId = note.id
  element.title = `${NOTE_KIND_LABELS[note.kind]} (clic para editarla)`
  const mark = document.createElement('sup')
  mark.textContent = noteMark(note.kind, number)
  element.append(mark, document.createTextNode(` ${note.text || ' '}`))
  return element
}

const separator = () => {
  const rule = document.createElement('div')
  rule.className = 'writer-notes-separator'
  return rule
}

/** Clic en una nota (en la capa o al final): su cuadro. Los widgets no dejan pasar el clic al texto. */
function listenOpen(element: HTMLElement, open: OpenNote): void {
  element.addEventListener('mousedown', (event) => {
    const note = (event.target as HTMLElement).closest<HTMLElement>('[data-note-id]')
    if (!note?.dataset.noteId) return
    event.preventDefault()
    open(note.dataset.noteId)
  })
}

/** Alto de cada nota al pie con el ancho del área de texto, midiéndolas fuera de la vista. */
export function measureFootnotes(
  view: EditorView,
  notes: PlacedNote[],
  numbers: Map<string, number>,
  width: number
): Map<string, number> {
  const heights = new Map<string, number>()
  const host = view.dom.parentElement
  if (!host || notes.length === 0) return heights
  const box = document.createElement('div')
  box.className = 'writer-footnotes writer-footnotes--measure'
  box.style.width = `${width}px`
  const elements = notes.map((note) => noteElement(note, numbers.get(note.id) ?? 1))
  box.append(...elements)
  host.appendChild(box)
  elements.forEach((element, index) => heights.set(notes[index].id, element.offsetHeight))
  box.remove()
  return heights
}

/** Lo que la paginación pone al final: notas al final (y, sin hojas, también las de pie). */
export interface EndNotesContent {
  /** Sin hojas (Borrador, Esquema, Lectura), las notas al pie también van al final. */
  footnotes: PlacedNote[]
  endnotes: PlacedNote[]
  numbers: Map<string, number>
  /** Margen superior de cada pieza (raya, notas...) cuando abre hoja: lo decide la paginación. */
  margins?: Map<number, number>
}

/** Piezas del final en orden; cada una es una unidad que la paginación puede bajar a otra hoja. */
export const endNotesPieceCount = (content: EndNotesContent) =>
  (content.footnotes.length > 0 ? 1 + content.footnotes.length : 0) +
  (content.endnotes.length > 0 ? 1 + content.endnotes.length : 0)

export function endNotesWidget(pos: number, content: EndNotesContent, open: OpenNote): Decoration | null {
  if (endNotesPieceCount(content) === 0) return null
  const key = JSON.stringify([
    content.footnotes.map((note) => [note.id, note.text, content.numbers.get(note.id)]),
    content.endnotes.map((note) => [note.id, note.text, content.numbers.get(note.id)]),
    [...(content.margins ?? [])]
  ])
  return Decoration.widget(
    pos,
    () => {
      const container = document.createElement('div')
      container.className = 'writer-endnotes'
      container.contentEditable = 'false'
      const pieces: HTMLElement[] = []
      for (const notes of [content.footnotes, content.endnotes]) {
        if (notes.length === 0) continue
        pieces.push(separator(), ...notes.map((note) => noteElement(note, content.numbers.get(note.id) ?? 1)))
      }
      pieces.forEach((piece, index) => {
        piece.dataset.unit = String(index)
        const margin = content.margins?.get(index)
        if (margin !== undefined) {
          piece.classList.add('writer-page-start')
          piece.style.marginTop = `${margin.toFixed(2)}px`
        }
      })
      container.append(...pieces)
      listenOpen(container, open)
      return container
    },
    { side: 1, key: `endnotes-${key}`, ignoreSelection: true, stopEvent: () => true }
  )
}

/** Una hoja con notas al pie: dónde va su zona de notas (en coordenadas de `.writer-content`). */
export interface FootnoteArea {
  top: number
  left: number
  width: number
  notes: PlacedNote[]
}

/** La capa de pantalla con las notas al pie de todas las hojas. */
export function footnoteLayerWidget(
  pos: number,
  areas: FootnoteArea[],
  numbers: Map<string, number>,
  open: OpenNote
): Decoration | null {
  if (areas.length === 0) return null
  const key = JSON.stringify(
    areas.map((area) => [
      area.top.toFixed(1),
      area.left.toFixed(1),
      area.width.toFixed(1),
      area.notes.map((note) => [note.id, note.text, numbers.get(note.id)])
    ])
  )
  return Decoration.widget(
    pos,
    () => {
      const layer = document.createElement('div')
      layer.className = 'writer-footnote-layer'
      layer.contentEditable = 'false'
      for (const area of areas) {
        const box = document.createElement('div')
        box.className = 'writer-footnotes'
        box.style.top = `${area.top.toFixed(2)}px`
        box.style.left = `${area.left.toFixed(2)}px`
        box.style.width = `${area.width.toFixed(2)}px`
        box.append(separator(), ...area.notes.map((note) => noteElement(note, numbers.get(note.id) ?? 1)))
        layer.appendChild(box)
      }
      listenOpen(layer, open)
      return layer
    },
    { side: 2, key: `footnotes-${key}`, ignoreSelection: true, stopEvent: () => true }
  )
}

/**
 * Las notas al pie de una hoja para imprimir: van justo antes del salto a la hoja siguiente, con un
 * margen que las baja hasta el pie (lo que sobra de la hoja). En pantalla no se ven.
 */
export function printFootnotesWidget(
  pos: number,
  notes: PlacedNote[],
  numbers: Map<string, number>,
  margin: number,
  side = -2
): Decoration {
  const key = JSON.stringify([margin.toFixed(1), notes.map((note) => [note.id, note.text, numbers.get(note.id)])])
  return Decoration.widget(
    pos,
    () => {
      const box = document.createElement('span')
      box.className = 'writer-footnotes-print'
      box.contentEditable = 'false'
      box.setAttribute('aria-hidden', 'true')
      box.style.marginTop = `${Math.max(0, margin).toFixed(2)}px`
      box.append(separator(), ...notes.map((note) => noteElement(note, numbers.get(note.id) ?? 1)))
      return box
    },
    { side, key: `print-notes-${key}`, ignoreSelection: true }
  )
}
