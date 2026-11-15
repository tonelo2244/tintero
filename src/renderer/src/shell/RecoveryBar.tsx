import { History } from 'lucide-react'
import type { RecoverySnapshot } from '@shared/ipc'
import { formatLastOpened } from '@/core/formatDate'

interface RecoveryBarProps {
  snapshots: RecoverySnapshot[]
  onRecover(snapshot: RecoverySnapshot): void
  onDiscard(snapshot: RecoverySnapshot): void
}

/** Ofrece, de una en una, las copias que quedaron de un cierre inesperado. */
export function RecoveryBar({ snapshots, onRecover, onDiscard }: RecoveryBarProps) {
  const [current] = snapshots
  if (!current) return null
  const others = snapshots.length - 1

  return (
    <div className="notice-bar recovery-bar" role="status">
      <History size={16} />
      <span>
        Hay una copia sin guardar de <strong>{current.name}</strong> ({formatLastOpened(current.savedAt)}).
        {others > 0 && ` Y ${others} más.`}
      </span>
      <button type="button" className="recovery-bar__button" onClick={() => onRecover(current)}>
        Recuperar
      </button>
      <button type="button" className="recovery-bar__button" onClick={() => onDiscard(current)}>
        Descartar
      </button>
    </div>
  )
}
