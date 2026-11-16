import { LogOut } from 'lucide-react'
import { READING_THEMES, type ReadingTheme } from '../model/views'

interface ReadingBarProps {
  theme: ReadingTheme
  onThemeChange(theme: ReadingTheme): void
  onExit(): void
}

/** Barra del modo lectura: sin cinta, solo los colores de la página y la salida (también con Esc). */
export function ReadingBar({ theme, onThemeChange, onExit }: ReadingBarProps) {
  return (
    <div className="writer-reading-bar" role="toolbar" aria-label="Modo lectura">
      <span className="writer-reading-bar__title">Modo lectura</span>
      <span className="writer-reading-bar__themes" role="radiogroup" aria-label="Color de la página">
        {READING_THEMES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={theme === option.id}
            className={`writer-reading-bar__theme writer-reading-bar__theme--${option.id}`}
            onClick={() => onThemeChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </span>
      <button type="button" className="writer-reading-bar__exit" onClick={onExit}>
        <LogOut size={14} /> Salir (Esc)
      </button>
    </div>
  )
}
