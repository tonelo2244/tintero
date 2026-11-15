import { useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import type { SlideTheme } from '../model/themes'
import type { Slide } from '../model/types'
import { SlideView } from './SlideView'

interface SlidePanelProps {
  slides: Slide[]
  theme: SlideTheme
  selectedSlideId: string
  onSelect(id: string): void
  onMove(from: number, to: number): void
  onDuplicate(id: string): void
  onDelete(id: string): void
}

const THUMB_WIDTH = 176

/** Columna de miniaturas. Se pueden reordenar arrastrando. */
export function SlidePanel({
  slides,
  theme,
  selectedSlideId,
  onSelect,
  onMove,
  onDuplicate,
  onDelete
}: SlidePanelProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  return (
    <aside className="slide-panel" aria-label="Diapositivas">
      {slides.map((slide, index) => (
        <div
          key={slide.id}
          className={`slide-thumb ${slide.id === selectedSlideId ? 'is-selected' : ''} ${dropIndex === index ? 'is-drop-target' : ''}`}
          draggable
          onDragStart={() => setDragIndex(index)}
          onDragOver={(event) => {
            event.preventDefault()
            setDropIndex(index)
          }}
          onDragLeave={() => setDropIndex(null)}
          onDrop={() => {
            if (dragIndex !== null) onMove(dragIndex, index)
            setDragIndex(null)
            setDropIndex(null)
          }}
          onDragEnd={() => {
            setDragIndex(null)
            setDropIndex(null)
          }}
          onClick={() => onSelect(slide.id)}
        >
          <span className="slide-thumb__number">{index + 1}</span>
          <div className="slide-thumb__frame">
            <SlideView slide={slide} theme={theme} width={THUMB_WIDTH} />
          </div>
          <div className="slide-thumb__actions">
            <button
              type="button"
              title="Duplicar diapositiva"
              onClick={(event) => {
                event.stopPropagation()
                onDuplicate(slide.id)
              }}
            >
              <Copy size={13} />
            </button>
            <button
              type="button"
              title="Eliminar diapositiva"
              disabled={slides.length <= 1}
              onClick={(event) => {
                event.stopPropagation()
                onDelete(slide.id)
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}
    </aside>
  )
}
