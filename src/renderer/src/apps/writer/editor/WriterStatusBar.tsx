import { BookOpen, FileText, Minus, Plus, ScrollText } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ViewMode } from '../model/views'
import { viewModeLabel } from '../model/views'
import { clampZoom, MAX_ZOOM, MIN_ZOOM, stepZoom } from '../model/zoom'

interface WriterStatusBarProps {
  /** `null` en las vistas sin hojas. */
  currentPage: number | null
  totalPages: number | null
  words: number
  zoom: number
  onZoomChange(zoom: number): void
  onWordCount(): void
  viewMode: ViewMode
  onViewModeChange(mode: ViewMode): void
}

/** Las vistas de la esquina de la barra de estado, como los tres botones de Word. */
const STATUS_VIEWS: { id: ViewMode; icon: ReactNode }[] = [
  { id: 'read', icon: <BookOpen size={13} /> },
  { id: 'print', icon: <FileText size={13} /> },
  { id: 'draft', icon: <ScrollText size={13} /> }
]

export function WriterStatusBar(props: WriterStatusBarProps) {
  const { currentPage, totalPages, words } = props
  return (
    <>
      {currentPage !== null && totalPages !== null && (
        <span>
          Página {currentPage} de {totalPages}
        </span>
      )}
      <button type="button" className="statusbar__button" title="Contar palabras" onClick={props.onWordCount}>
        {words} {words === 1 ? 'palabra' : 'palabras'}
      </button>
      <span>Español (España)</span>
      <span className="statusbar__spacer" />
      <span className="statusbar__views">
        {STATUS_VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            className={props.viewMode === view.id ? 'is-active' : ''}
            title={viewModeLabel(view.id)}
            aria-label={viewModeLabel(view.id)}
            aria-pressed={props.viewMode === view.id}
            onClick={() => props.onViewModeChange(view.id)}
          >
            {view.icon}
          </button>
        ))}
      </span>
      <ZoomControl zoom={props.zoom} onZoomChange={props.onZoomChange} />
    </>
  )
}

export function ZoomControl({ zoom, onZoomChange }: { zoom: number; onZoomChange(zoom: number): void }) {
  return (
    <span className="zoom-control">
      <button type="button" aria-label="Alejar" onClick={() => onZoomChange(stepZoom(zoom, -1))}>
        <Minus size={12} />
      </button>
      <input
        type="range"
        min={MIN_ZOOM * 100}
        max={MAX_ZOOM * 100}
        step={5}
        value={Math.round(zoom * 100)}
        aria-label="Zoom"
        onChange={(event) => onZoomChange(clampZoom(Number(event.target.value) / 100))}
      />
      <button type="button" aria-label="Acercar" onClick={() => onZoomChange(stepZoom(zoom, 1))}>
        <Plus size={12} />
      </button>
      <span className="zoom-control__value">{Math.round(zoom * 100)} %</span>
    </span>
  )
}
