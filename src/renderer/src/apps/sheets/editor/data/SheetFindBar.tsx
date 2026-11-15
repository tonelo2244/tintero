import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { CaseSensitive, ChevronDown, ChevronUp, Replace, ReplaceAll, X } from 'lucide-react'
import type { FindOptions } from '../../model/find'

interface SheetFindBarProps {
  mode: 'find' | 'replace'
  /** Cambia cada vez que se pide abrir la barra, para volver a enfocar la caja. */
  openRequest: number
  options: FindOptions
  /** Posición de la celda activa entre las coincidencias (-1 si no está en ninguna). */
  current: number
  total: number
  onOptionsChange(options: FindOptions): void
  onGo(direction: 1 | -1): void
  onReplace(replacement: string): void
  onReplaceAll(replacement: string): void
  onClose(): void
}

/**
 * Barra de buscar y reemplazar de Hojas. Se parece a la de Texto a propósito (mismo aspecto y
 * atajos), pero busca celdas: la lógica está en model/find.ts y la decide el editor.
 */
export function SheetFindBar(props: SheetFindBarProps) {
  const { options, total, current } = props
  const [replacement, setReplacement] = useState('')
  const [showReplace, setShowReplace] = useState(props.mode === 'replace')
  const queryRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (props.mode === 'replace') setShowReplace(true)
    const input = props.mode === 'replace' && options.query ? replaceRef.current : queryRef.current
    input?.focus()
    input?.select()
    // Solo al abrir (o volver a pedir abrir), no en cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode, props.openRequest])

  const set = (patch: Partial<FindOptions>) => props.onOptionsChange({ ...options, ...patch })
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, onEnter: () => void) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      props.onClose()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      onEnter()
    }
  }

  const status = !options.query
    ? ''
    : total === 0
      ? 'Sin resultados'
      : current >= 0
        ? `${current + 1} de ${total}`
        : `${total} ${total === 1 ? 'celda' : 'celdas'}`

  return (
    <div className="find-bar sheet-find-bar" role="search" aria-label="Buscar y reemplazar">
      <div className="find-bar__row">
        <button
          type="button"
          className="find-bar__icon"
          aria-label={showReplace ? 'Ocultar reemplazar' : 'Mostrar reemplazar'}
          aria-expanded={showReplace}
          onClick={() => setShowReplace((value) => !value)}
        >
          <ChevronDown size={14} className={showReplace ? '' : 'is-collapsed'} />
        </button>
        <input
          ref={queryRef}
          className="find-bar__input"
          aria-label="Buscar"
          placeholder="Buscar"
          value={options.query}
          onChange={(event) => set({ query: event.target.value })}
          onKeyDown={(event) => onKeyDown(event, () => props.onGo(event.shiftKey ? -1 : 1))}
        />
        <span className={`find-bar__status ${options.query && total === 0 ? 'is-empty' : ''}`} aria-live="polite">
          {status}
        </span>
        <button
          type="button"
          className={`find-bar__icon ${options.matchCase ? 'is-active' : ''}`}
          title="Coincidir mayúsculas y minúsculas"
          aria-label="Coincidir mayúsculas y minúsculas"
          aria-pressed={options.matchCase}
          onClick={() => set({ matchCase: !options.matchCase })}
        >
          <CaseSensitive size={16} />
        </button>
        <button
          type="button"
          className="find-bar__icon"
          aria-label="Anterior"
          disabled={total === 0}
          onClick={() => props.onGo(-1)}
        >
          <ChevronUp size={16} />
        </button>
        <button
          type="button"
          className="find-bar__icon"
          aria-label="Siguiente"
          disabled={total === 0}
          onClick={() => props.onGo(1)}
        >
          <ChevronDown size={16} />
        </button>
        <button type="button" className="find-bar__icon" aria-label="Cerrar" onClick={props.onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="find-bar__row sheet-find-bar__options">
        <select
          aria-label="Buscar en"
          value={options.lookIn}
          onChange={(event) => set({ lookIn: event.target.value as FindOptions['lookIn'] })}
        >
          <option value="values">En valores</option>
          <option value="formulas">En fórmulas</option>
        </select>
        <select
          aria-label="Dónde buscar"
          value={options.scope}
          onChange={(event) => set({ scope: event.target.value as FindOptions['scope'] })}
        >
          <option value="sheet">En esta hoja</option>
          <option value="workbook">En todo el libro</option>
        </select>
        <label>
          <input type="checkbox" checked={options.wholeCell} onChange={() => set({ wholeCell: !options.wholeCell })} />{' '}
          Celda completa
        </label>
      </div>
      {showReplace && (
        <div className="find-bar__row find-bar__row--replace">
          <input
            ref={replaceRef}
            className="find-bar__input"
            aria-label="Reemplazar con"
            placeholder="Reemplazar con"
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            onKeyDown={(event) => onKeyDown(event, () => props.onReplace(replacement))}
          />
          <button
            type="button"
            className="find-bar__action"
            disabled={total === 0}
            onClick={() => props.onReplace(replacement)}
          >
            <Replace size={14} /> Reemplazar
          </button>
          <button
            type="button"
            className="find-bar__action"
            disabled={total === 0}
            onClick={() => props.onReplaceAll(replacement)}
          >
            <ReplaceAll size={14} /> Todo
          </button>
        </div>
      )}
    </div>
  )
}
