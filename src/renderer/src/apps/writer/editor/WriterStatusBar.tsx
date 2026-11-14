import { Minus, Plus } from 'lucide-react'

interface WriterStatusBarProps {
  currentPage: number
  totalPages: number
  words: number
  zoom: number
  onZoomChange(zoom: number): void
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 2
const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 10) / 10))

export function WriterStatusBar({ currentPage, totalPages, words, zoom, onZoomChange }: WriterStatusBarProps) {
  return (
    <>
      <span>
        Página {currentPage} de {totalPages}
      </span>
      <span>
        {words} {words === 1 ? 'palabra' : 'palabras'}
      </span>
      <span>Español (España)</span>
      <span className="statusbar__spacer" />
      <ZoomControl zoom={zoom} onZoomChange={onZoomChange} />
    </>
  )
}

export function ZoomControl({ zoom, onZoomChange }: { zoom: number; onZoomChange(zoom: number): void }) {
  return (
    <span className="zoom-control">
      <button type="button" aria-label="Alejar" onClick={() => onZoomChange(clampZoom(zoom - 0.1))}>
        <Minus size={12} />
      </button>
      <input
        type="range"
        min={MIN_ZOOM * 100}
        max={MAX_ZOOM * 100}
        step={10}
        value={Math.round(zoom * 100)}
        aria-label="Zoom"
        onChange={(event) => onZoomChange(clampZoom(Number(event.target.value) / 100))}
      />
      <button type="button" aria-label="Acercar" onClick={() => onZoomChange(clampZoom(zoom + 0.1))}>
        <Plus size={12} />
      </button>
      <span className="zoom-control__value">{Math.round(zoom * 100)} %</span>
    </span>
  )
}
