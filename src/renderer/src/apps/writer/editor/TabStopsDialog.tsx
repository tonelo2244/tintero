import { useState } from 'react'
import type { Editor } from '@tiptap/core'
import { Trash2, X } from 'lucide-react'
import { runCommand } from '../model/commands'
import { DEFAULT_TAB_STEP_CM, TAB_ALIGNS, type TabAlign, type TabLeader, type TabStop } from '../model/paragraphFormat'
import { formatCm } from '../model/pageSetup'
import { useCommandContext } from './ribbon/commandContext'
import { NumberField } from './NumberField'

/**
 * Topes de tabulación del párrafo del cursor (o de los párrafos seleccionados), como el cuadro
 * "Tabulaciones" de Word: posición, alineación y relleno. Se aplican al pulsar Aceptar.
 */
export function TabStopsDialog({ editor, onClose }: { editor: Editor; onClose(): void }) {
  const context = useCommandContext()
  const [stops, setStops] = useState<TabStop[]>(() => currentStops(editor))
  const [position, setPosition] = useState(nextPosition(stops))
  const [align, setAlign] = useState<TabAlign>('left')
  const [leader, setLeader] = useState<TabLeader>('none')

  const add = () => {
    if (!(position > 0)) return
    const stop: TabStop = { position: Math.round(position * 100) / 100, align, ...(leader === 'dot' ? { leader } : {}) }
    // Un tope en la misma posición se sustituye: dos en el mismo sitio no tienen sentido.
    const next = [...stops.filter((current) => Math.abs(current.position - stop.position) > 0.005), stop].sort(
      (a, b) => a.position - b.position
    )
    setStops(next)
    setPosition(nextPosition(next))
  }

  return (
    <div className="writer-comments writer-page-setup" role="dialog" aria-label="Tabulaciones">
      <header className="writer-comments__header">
        <span>Tabulaciones</span>
        <button type="button" className="writer-comments__icon" title="Cerrar" aria-label="Cerrar" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <form
        className="writer-page-setup__body"
        onSubmit={(event) => {
          event.preventDefault()
          runCommand(context, 'tabStops', stops)
          onClose()
        }}
      >
        <fieldset>
          <legend>Nuevo tope</legend>
          <NumberField label="Posición" unit="cm" value={position} onChange={setPosition} />
          <select
            aria-label="Alineación del tope"
            value={align}
            onChange={(event) => setAlign(event.target.value as TabAlign)}
          >
            {TAB_ALIGNS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <label className="writer-page-setup__radio">
            <input
              type="checkbox"
              checked={leader === 'dot'}
              onChange={(event) => setLeader(event.target.checked ? 'dot' : 'none')}
            />
            Relleno de puntos (……)
          </label>
          <button type="button" onClick={add}>
            Añadir tope
          </button>
        </fieldset>
        <fieldset>
          <legend>Topes del párrafo</legend>
          {stops.length === 0 && (
            <p className="writer-style-dialog__hint">
              Sin topes propios: el tabulador salta cada {formatCm(DEFAULT_TAB_STEP_CM)}.
            </p>
          )}
          <ul className="writer-tab-stops__list">
            {stops.map((stop) => (
              <li key={stop.position}>
                <span>
                  {formatCm(stop.position)} · {TAB_ALIGNS.find((option) => option.id === stop.align)?.label}
                  {stop.leader === 'dot' ? ' · puntos' : ''}
                </span>
                <button
                  type="button"
                  className="writer-comments__icon"
                  aria-label={`Quitar el tope de ${formatCm(stop.position)}`}
                  title="Quitar"
                  onClick={() => setStops((current) => current.filter((other) => other !== stop))}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
        <div className="writer-page-setup__actions">
          <button type="button" onClick={() => setStops([])}>
            Quitar todos
          </button>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="is-primary">
            Aceptar
          </button>
        </div>
      </form>
    </div>
  )
}

function currentStops(editor: Editor): TabStop[] {
  const stops = editor.state.selection.$from.parent.attrs.tabStops as TabStop[] | null | undefined
  return stops ? [...stops] : []
}

/** Propuesta para el siguiente tope: 2,5 cm después del último (o 2,5 cm si no hay ninguno). */
function nextPosition(stops: TabStop[]): number {
  return (stops.at(-1)?.position ?? 0) + 2.5
}
