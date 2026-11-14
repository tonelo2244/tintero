import { useState, type ComponentType } from 'react'
import { Pin, PinOff, X } from 'lucide-react'
import type { RecentFile } from '@shared/ipc'
import { formatLastOpened } from '@/core/formatDate'

type Tab = 'recent' | 'pinned'

interface RecentFilesTableProps {
  items: RecentFile[]
  fileLabel: string
  Icon: ComponentType<{ size?: number }>
  onOpen(item: RecentFile): void
  onTogglePin(item: RecentFile): void
  onRemove(item: RecentFile): void
}

/** "/Users/ana/Escritorio/informe.tdoc" -> "Users » ana » Escritorio" */
function folderBreadcrumb(filePath: string): string {
  const parts = filePath.split(/[\\/]/).filter(Boolean)
  return parts.slice(0, -1).join(' » ')
}

export function RecentFilesTable({ items, fileLabel, Icon, onOpen, onTogglePin, onRemove }: RecentFilesTableProps) {
  const [tab, setTab] = useState<Tab>('recent')
  const visible = tab === 'pinned' ? items.filter((item) => item.pinned) : items

  return (
    <section className="recents">
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'recent'} onClick={() => setTab('recent')}>
          Recientes
        </button>
        <button type="button" role="tab" aria-selected={tab === 'pinned'} onClick={() => setTab('pinned')}>
          Anclado
        </button>
      </div>

      <div className="recents__head">
        <span>Nombre</span>
        <span>Lo abrió por última vez</span>
      </div>

      {visible.length === 0 ? (
        <p className="recents__empty">
          {tab === 'pinned'
            ? 'Ancla documentos con el icono de chincheta para tenerlos siempre a mano.'
            : `Aún no hay ${fileLabel.toLowerCase()} recientes. Empieza con una plantilla o abre un archivo del disco.`}
        </p>
      ) : (
        <ul className="recents__list">
          {visible.map((item) => (
            <li key={item.path}>
              <button type="button" className="recents__row" onClick={() => onOpen(item)} title={item.path}>
                <span className="recents__icon">
                  <Icon size={22} />
                </span>
                <span className="recents__name">
                  <strong>{item.name}</strong>
                  <small>{folderBreadcrumb(item.path)}</small>
                </span>
                <span className="recents__date">{formatLastOpened(item.lastOpenedAt)}</span>
              </button>
              <div className="recents__actions">
                <button
                  type="button"
                  className={`icon-button ${item.pinned ? 'is-on' : ''}`}
                  onClick={() => onTogglePin(item)}
                  title={item.pinned ? 'Desanclar' : 'Anclar'}
                >
                  {item.pinned ? <PinOff size={15} /> : <Pin size={15} />}
                </button>
                <button type="button" className="icon-button" onClick={() => onRemove(item)} title="Quitar de la lista">
                  <X size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
