import type { KeyboardEvent, RefObject } from 'react'
import { Sigma } from 'lucide-react'

interface FormulaBarProps {
  /** Dirección de la celda o rango seleccionado ("B3", "A1:C4"). */
  location: string
  value: string
  inputRef: RefObject<HTMLInputElement | null>
  onFocus(): void
  onChange(text: string): void
  onKeyDown(event: KeyboardEvent<HTMLInputElement>): void
  onAutoSum(): void
}

/**
 * Barra de fórmulas: a la izquierda el "cuadro de nombres" con la dirección; a la derecha, el
 * contenido real de la celda (la fórmula, no su resultado). Editar aquí o en la celda es lo mismo:
 * los dos <input> comparten el mismo borrador en el estado del editor.
 */
export function FormulaBar(props: FormulaBarProps) {
  return (
    <div className="formula-bar">
      <div className="formula-bar__location" aria-label="Celda seleccionada">
        {props.location}
      </div>
      <button
        type="button"
        className="formula-bar__button"
        title="Autosuma"
        aria-label="Autosuma"
        onMouseDown={(event) => event.preventDefault()}
        onClick={props.onAutoSum}
      >
        <Sigma size={14} />
      </button>
      <span className="formula-bar__fx" aria-hidden>
        fx
      </span>
      <input
        ref={props.inputRef}
        className="formula-bar__input"
        aria-label="Contenido de la celda"
        spellCheck={false}
        value={props.value}
        onFocus={props.onFocus}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={props.onKeyDown}
      />
    </div>
  )
}
