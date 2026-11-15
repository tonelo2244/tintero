import { MessageSquare, Trash2, X } from 'lucide-react'
import type { WriterComment } from '../model/content'

interface CommentsPanelProps {
  comments: WriterComment[]
  activeId: string | null
  /** Comentarios cuyo texto sigue en el documento (si se borró el texto, el comentario queda suelto). */
  anchored: ReadonlySet<string>
  onSelect(id: string): void
  onChangeText(id: string, text: string): void
  onDelete(id: string): void
  onClose(): void
}

const DATE_FORMAT = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit'
})

/** Panel lateral con los comentarios, en el orden del archivo (el mismo que muestra Word). */
export function CommentsPanel({
  comments,
  activeId,
  anchored,
  onSelect,
  onChangeText,
  onDelete,
  onClose
}: CommentsPanelProps) {
  return (
    <aside className="writer-comments" aria-label="Comentarios">
      <header className="writer-comments__header">
        <MessageSquare size={16} />
        <span>Comentarios</span>
        <button type="button" className="writer-comments__icon" title="Cerrar" aria-label="Cerrar" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      {comments.length === 0 ? (
        <p className="writer-comments__empty">Selecciona texto y pulsa «Comentario» en Insertar para añadir uno.</p>
      ) : (
        <ul className="writer-comments__list">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className={`writer-comments__item ${comment.id === activeId ? 'is-active' : ''}`}
              onClick={() => onSelect(comment.id)}
            >
              <div className="writer-comments__meta">
                <strong>{comment.author || 'Tú'}</strong>
                {comment.date && <span>{formatDate(comment.date)}</span>}
                <button
                  type="button"
                  className="writer-comments__icon"
                  title="Eliminar comentario"
                  aria-label="Eliminar comentario"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDelete(comment.id)
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <textarea
                aria-label={`Comentario de ${comment.author || 'Tú'}`}
                value={comment.text}
                placeholder="Escribe el comentario…"
                rows={Math.min(6, Math.max(2, comment.text.split('\n').length))}
                autoFocus={comment.id === activeId && comment.text === ''}
                // Escribir en el comentario no debe llevar el foco al documento (lo haría el clic del elemento).
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => onChangeText(comment.id, event.target.value)}
              />
              {!anchored.has(comment.id) && <p className="writer-comments__orphan">El texto comentado ya no está.</p>}
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : DATE_FORMAT.format(date)
}
