import type { FormEvent, ReactNode } from 'react'
import { X } from 'lucide-react'

interface WriterDialogProps {
  title: string
  icon: ReactNode
  onClose(): void
  /** Con `onSubmit`, el cuerpo es un formulario: Intro acepta. */
  onSubmit?(): void
  /** Botones de abajo (Cancelar, Aceptar...). */
  actions?: ReactNode
  className?: string
  children: ReactNode
}

/**
 * Cuadro lateral de Texto con el mismo marco que Configurar página o los comentarios: los cuadros
 * de la fase 16 (vínculo, marcador, símbolo, ecuación, gráfico...) lo comparten en vez de repetir
 * la cabecera cada uno. Esc cierra.
 */
export function WriterDialog({ title, icon, onClose, onSubmit, actions, className, children }: WriterDialogProps) {
  const body = (
    <>
      {children}
      {actions && <div className="writer-page-setup__actions">{actions}</div>}
    </>
  )
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit?.()
  }
  return (
    <div
      className={`writer-comments writer-page-setup ${className ?? ''}`}
      role="dialog"
      aria-label={title}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <header className="writer-comments__header">
        {icon}
        <span>{title}</span>
        <button type="button" className="writer-comments__icon" title="Cerrar" aria-label="Cerrar" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      {onSubmit ? (
        <form className="writer-page-setup__body" onSubmit={submit}>
          {body}
        </form>
      ) : (
        <div className="writer-page-setup__body">{body}</div>
      )}
    </div>
  )
}
