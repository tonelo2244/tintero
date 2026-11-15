import type { ReactNode } from 'react'
import { LoaderCircle, Sparkles, X } from 'lucide-react'
import './ai.css'

interface AiPanelProps {
  label: string
  title: ReactNode
  busy: boolean
  onClose(): void
  children: ReactNode
  footer?: ReactNode
  hint?: ReactNode
}

/** Marco común de los paneles de IA: cabecera con estado, cuerpo, acciones y nota al pie. */
export function AiPanel({ label, title, busy, onClose, children, footer, hint }: AiPanelProps) {
  return (
    <aside className="ai-panel" aria-label={label} aria-busy={busy}>
      <header className="ai-panel__header">
        {busy ? <LoaderCircle size={16} className="ai-spin" /> : <Sparkles size={16} />}
        <span>{title}</span>
        <button
          type="button"
          className="ai-button ai-button--icon ai-panel__close"
          title="Cerrar"
          aria-label="Cerrar"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>
      <div className="ai-panel__body" aria-live="polite">
        {children}
      </div>
      {footer && <footer className="ai-panel__footer">{footer}</footer>}
      {hint && <div className="ai-panel__hint">{hint}</div>}
    </aside>
  )
}
