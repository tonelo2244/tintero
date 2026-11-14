import { useEffect, useState } from 'react'
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Presentation } from '../model/types'
import { SlideView } from './SlideView'

interface SlideshowProps {
  presentation: Presentation
  startIndex: number
  onExit(lastIndex: number): void
}

function useViewportSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

/** Modo presentación a pantalla completa. Flechas/espacio/clic avanzan, Esc sale. */
export function Slideshow({ presentation, startIndex, onExit }: SlideshowProps) {
  const [index, setIndex] = useState(startIndex)
  const viewport = useViewportSize()
  const lastIndex = presentation.slides.length - 1

  useEffect(() => {
    void document.documentElement.requestFullscreen?.().catch(() => undefined)
    return () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
        case 'Enter':
          setIndex((current) => Math.min(lastIndex, current + 1))
          break
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
        case 'Backspace':
          setIndex((current) => Math.max(0, current - 1))
          break
        case 'Home':
          setIndex(0)
          break
        case 'End':
          setIndex(lastIndex)
          break
        case 'Escape':
          onExit(index)
          break
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [index, lastIndex, onExit])

  // Si se sale de pantalla completa con la tecla del sistema, salimos también de la presentación.
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) onExit(index)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [index, onExit])

  const width = Math.min(viewport.width, (viewport.height * SLIDE_WIDTH) / SLIDE_HEIGHT)
  const slide = presentation.slides[index]

  return (
    <div
      className="slideshow"
      onClick={() => (index < lastIndex ? setIndex(index + 1) : onExit(index))}
      onContextMenu={(event) => {
        event.preventDefault()
        setIndex(Math.max(0, index - 1))
      }}
    >
      <SlideView slide={slide} themeId={presentation.themeId} width={width} />
      <div className="slideshow__counter">
        {index + 1} / {presentation.slides.length}
      </div>
    </div>
  )
}
