import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownAZ, ArrowUpAZ } from 'lucide-react'

interface FilterMenuProps {
  columnLabel: string
  /** Valores que se ven en la columna (ya formateados) y los que están desmarcados. */
  choices: string[]
  excluded: string[]
  /** Dónde estaba el botón del filtro, en coordenadas de la ventana. */
  anchor: DOMRect
  onSort(descending: boolean): void
  onApply(excluded: string[]): void
  onClose(): void
}

/**
 * Menú del autofiltro: ordenar y la lista de casillas de Excel. Solo guarda lo que el usuario va
 * marcando; al aceptar, el editor convierte la lista en un `filter/set`.
 */
export function FilterMenu({ columnLabel, choices, excluded, anchor, onSort, onApply, onClose }: FilterMenuProps) {
  const [hidden, setHidden] = useState(() => new Set(excluded))
  const [search, setSearch] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const visibleChoices = useMemo(
    () => choices.filter((choice) => choice.toLowerCase().includes(search.trim().toLowerCase())),
    [choices, search]
  )
  const allChecked = visibleChoices.every((choice) => !hidden.has(choice))

  const toggle = (choice: string) =>
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(choice)) next.delete(choice)
      else next.add(choice)
      return next
    })

  const toggleAll = () =>
    setHidden((current) => {
      const next = new Set(current)
      for (const choice of visibleChoices) {
        if (allChecked) next.add(choice)
        else next.delete(choice)
      }
      return next
    })

  // Que no se salga por abajo ni por la derecha de la ventana.
  const top = Math.min(anchor.bottom + 4, window.innerHeight - 380)
  const left = Math.min(anchor.left, window.innerWidth - 270)

  return (
    <div
      ref={rootRef}
      className="sheet-popover sheet-filter-menu"
      role="dialog"
      aria-label={`Filtro de ${columnLabel}`}
      style={{ top, left }}
    >
      <button type="button" className="menu-item" onClick={() => onSort(false)}>
        <ArrowDownAZ size={14} /> Ordenar de A a Z
      </button>
      <button type="button" className="menu-item" onClick={() => onSort(true)}>
        <ArrowUpAZ size={14} /> Ordenar de Z a A
      </button>
      <hr />
      <input
        className="sheet-popover__input"
        placeholder="Buscar"
        aria-label="Buscar en la lista"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="sheet-filter-menu__list">
        <label>
          <input type="checkbox" checked={allChecked} onChange={toggleAll} /> (Seleccionar todo)
        </label>
        {visibleChoices.map((choice) => (
          <label key={choice}>
            <input type="checkbox" checked={!hidden.has(choice)} onChange={() => toggle(choice)} /> {choice}
          </label>
        ))}
      </div>
      <div className="sheet-popover__actions">
        <button type="button" className="sheet-popover__button" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="sheet-popover__button is-primary"
          onClick={() => onApply(choices.filter((choice) => hidden.has(choice)))}
        >
          Aceptar
        </button>
      </div>
    </div>
  )
}
