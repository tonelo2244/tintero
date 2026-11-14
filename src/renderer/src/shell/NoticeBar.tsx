import { AlertCircle, X } from 'lucide-react'

export function NoticeBar({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="notice-bar" role="alert">
      <AlertCircle size={16} />
      <span>{message}</span>
      <button type="button" className="notice-bar__close" onClick={onDismiss} aria-label="Cerrar aviso">
        <X size={14} />
      </button>
    </div>
  )
}
