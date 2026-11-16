import { useMemo } from 'react'
import type { Editor } from '@tiptap/react'
import { BookOpenText, X } from 'lucide-react'
import { formatCount, wordCount, type WordCount } from '../model/wordCount'

interface WordCountDialogProps {
  editor: Editor
  /** Hojas del documento; `null` en las vistas sin paginar (no se sabe sin maquetar). */
  pages: number | null
  onClose(): void
}

/**
 * Revisar > Contar palabras. Con texto seleccionado cuenta solo la selección, como Word. Las
 * cuentas son puras (model/wordCount.ts); aquí solo se recoge el texto y se miden las líneas.
 */
export function WordCountDialog({ editor, pages, onClose }: WordCountDialogProps) {
  const { empty } = editor.state.selection
  // Se cuenta al abrir: es una foto, como el cuadro de Word (no se recalcula mientras escribes).
  const counts = useMemo(() => measureWordCount(editor, pages), [editor, pages])
  const rows: [string, number | null][] = [
    ['Páginas', counts.pages],
    ['Palabras', counts.words],
    ['Caracteres (sin espacios)', counts.charactersNoSpaces],
    ['Caracteres (con espacios)', counts.charactersWithSpaces],
    ['Párrafos', counts.paragraphs],
    ['Líneas', counts.lines]
  ]

  return (
    <div className="writer-comments writer-page-setup writer-word-count" role="dialog" aria-label="Contar palabras">
      <header className="writer-comments__header">
        <BookOpenText size={16} />
        <span>Contar palabras</span>
        <button type="button" className="writer-comments__icon" title="Cerrar" aria-label="Cerrar" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="writer-page-setup__body">
        <p className="writer-word-count__scope">{empty ? 'Todo el documento' : 'Texto seleccionado'}</p>
        <dl className="writer-word-count__list">
          {rows
            .filter(([, value]) => value !== null)
            .map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{formatCount(value!)}</dd>
              </div>
            ))}
        </dl>
        <div className="writer-page-setup__actions">
          <button type="button" className="is-primary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

/** Texto de cada párrafo (de la selección o de todo) y sus líneas tal como se ven en pantalla. */
function measureWordCount(editor: Editor, pages: number | null): WordCount {
  const { doc, selection } = editor.state
  const from = selection.empty ? 0 : selection.from
  const to = selection.empty ? doc.content.size : selection.to
  const paragraphs: string[] = []
  let lines = 0
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true
    const start = Math.max(from, pos + 1)
    const end = Math.min(to, pos + node.nodeSize - 1)
    paragraphs.push(doc.textBetween(start, end, ' ', ' '))
    lines += countLines(editor, pos)
    return false
  })
  return wordCount({ paragraphs, lines, pages: selection.empty ? pages : null })
}

/**
 * Líneas de un párrafo en pantalla. Una palabra en negrita o más grande es otra caja de texto en la
 * misma línea: dos cajas son de la misma línea si se solapan en vertical (como en TabStops.ts).
 * Escondido (vista Esquema plegada) = 0; vacío = 1, porque ocupa una línea.
 */
function countLines(editor: Editor, pos: number): number {
  const element = editor.view.nodeDOM(pos)
  if (!(element instanceof HTMLElement) || element.offsetParent === null) return 0
  const range = document.createRange()
  range.selectNodeContents(element)
  const boxes = [...range.getClientRects()].filter((rect) => rect.height > 0).sort((a, b) => a.top - b.top)
  let lines = 0
  let lineBottom = -Infinity
  for (const box of boxes) {
    if (box.top >= lineBottom - 1) {
      lines++
      lineBottom = box.bottom
    } else lineBottom = Math.max(lineBottom, box.bottom)
  }
  return Math.max(1, lines)
}
