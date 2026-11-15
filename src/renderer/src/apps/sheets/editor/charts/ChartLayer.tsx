import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChartColumn, ChartLine, ChartPie, Trash2 } from 'lucide-react'
import { chartData } from '../../model/chart'
import type { ChartKind, CellValue, Sheet, SheetChart } from '../../model/types'
import { ChartView } from './ChartView'

interface ChartLayerProps {
  sheet: Sheet
  valueAt(address: string): CellValue
  selectedId: string | null
  onSelect(chartId: string | null): void
  onChange(chartId: string, patch: Partial<Omit<SheetChart, 'id'>>): void
  onDelete(chartId: string): void
}

const KINDS: { kind: ChartKind; label: string; icon: React.ReactNode }[] = [
  { kind: 'bar', label: 'Columnas', icon: <ChartColumn size={14} /> },
  { kind: 'line', label: 'Líneas', icon: <ChartLine size={14} /> },
  { kind: 'pie', label: 'Circular', icon: <ChartPie size={14} /> }
]

/**
 * Los gráficos de la hoja, flotando sobre las celdas. Arrastrar mueve, la esquina redimensiona y
 * la barrita de arriba cambia el tipo y el título. Durante el arrastre solo cambia el estado local;
 * al soltar se manda UNA acción, para que deshacer no tenga que recorrer cada píxel.
 */
export function ChartLayer({ sheet, valueAt, selectedId, onSelect, onChange, onDelete }: ChartLayerProps) {
  return (
    <>
      {(sheet.charts ?? []).map((chart) => (
        <ChartBox
          key={chart.id}
          chart={chart}
          sheet={sheet}
          valueAt={valueAt}
          selected={chart.id === selectedId}
          onSelect={() => onSelect(chart.id)}
          onChange={(patch) => onChange(chart.id, patch)}
          onDelete={() => onDelete(chart.id)}
        />
      ))}
    </>
  )
}

interface ChartBoxProps {
  chart: SheetChart
  sheet: Sheet
  valueAt(address: string): CellValue
  selected: boolean
  onSelect(): void
  onChange(patch: Partial<Omit<SheetChart, 'id'>>): void
  onDelete(): void
}

function ChartBox({ chart, sheet, valueAt, selected, onSelect, onChange, onDelete }: ChartBoxProps) {
  const [draft, setDraft] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const drag = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number } | null>(null)
  const box = draft ?? chart

  const begin = (mode: 'move' | 'resize') => (event: ReactPointerEvent) => {
    if (event.button !== 0) return
    // Que el clic no llegue a la cuadrícula (cambiaría la selección de celdas).
    event.stopPropagation()
    event.preventDefault()
    // El foco va a la cuadrícula: así Supr borra el gráfico y Esc lo deselecciona.
    ;(event.currentTarget.closest('.sheet-viewport') as HTMLElement | null)?.focus()
    onSelect()
    drag.current = { mode, startX: event.clientX, startY: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: ReactPointerEvent) => {
    const current = drag.current
    if (!current) return
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    setDraft(
      current.mode === 'move'
        ? { ...chart, x: Math.max(0, chart.x + dx), y: Math.max(0, chart.y + dy) }
        : { ...chart, width: Math.max(160, chart.width + dx), height: Math.max(120, chart.height + dy) }
    )
  }
  const end = () => {
    if (drag.current && draft) onChange({ x: draft.x, y: draft.y, width: draft.width, height: draft.height })
    drag.current = null
    setDraft(null)
  }

  return (
    <div
      className={`sheet-chart ${selected ? 'is-selected' : ''}`}
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
      onPointerDown={begin('move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <ChartView
        kind={chart.kind}
        data={chartData(sheet, chart.source, valueAt)}
        title={chart.title}
        width={box.width}
        height={box.height}
      />
      {selected && (
        <>
          <div className="sheet-chart__toolbar" onPointerDown={(event) => event.stopPropagation()}>
            {KINDS.map((option) => (
              <button
                key={option.kind}
                type="button"
                className={`find-bar__icon ${chart.kind === option.kind ? 'is-active' : ''}`}
                aria-label={`Gráfico de ${option.label.toLowerCase()}`}
                title={option.label}
                onClick={() => onChange({ kind: option.kind })}
              >
                {option.icon}
              </button>
            ))}
            <input
              className="sheet-chart__title-input"
              aria-label="Título del gráfico"
              placeholder="Título"
              defaultValue={chart.title ?? ''}
              onBlur={(event) => {
                const title = event.target.value.trim()
                if (title !== (chart.title ?? '')) onChange({ title: title || undefined })
              }}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
            />
            <button type="button" className="find-bar__icon" aria-label="Eliminar gráfico" onClick={onDelete}>
              <Trash2 size={14} />
            </button>
          </div>
          <span className="sheet-chart__resize" aria-hidden onPointerDown={begin('resize')} />
        </>
      )}
    </div>
  )
}
