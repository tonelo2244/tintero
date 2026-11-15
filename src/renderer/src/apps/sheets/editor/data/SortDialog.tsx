import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { columnName } from '../../model/address'
import type { SortKey } from '../../model/sort'
import type { CellRange } from '../../model/types'

interface SortDialogProps {
  range: CellRange
  initialHasHeader: boolean
  /** Nombre de cada columna: el de la cabecera si la hay, o "Columna B". */
  columnLabel(col: number, hasHeader: boolean): string
  onSort(keys: SortKey[], hasHeader: boolean): void
  onClose(): void
}

/** Ordenar por varias columnas ("niveles"), como el cuadro Ordenar de Excel. */
export function SortDialog({ range, initialHasHeader, columnLabel, onSort, onClose }: SortDialogProps) {
  const [hasHeader, setHasHeader] = useState(initialHasHeader)
  const [keys, setKeys] = useState<SortKey[]>([{ col: range.start.col, descending: false }])
  const columns = Array.from({ length: range.end.col - range.start.col + 1 }, (_, index) => range.start.col + index)

  const update = (index: number, patch: Partial<SortKey>) =>
    setKeys((current) => current.map((key, i) => (i === index ? { ...key, ...patch } : key)))

  return (
    <div className="sheet-popover sheet-sort-dialog" role="dialog" aria-label="Ordenar">
      <div className="sheet-popover__header">
        <b>
          Ordenar {columnName(range.start.col)}
          {range.start.row + 1}:{columnName(range.end.col)}
          {range.end.row + 1}
        </b>
        <button type="button" className="find-bar__icon" aria-label="Cerrar" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      {keys.map((key, index) => (
        <div key={index} className="sheet-sort-dialog__row">
          <span>{index === 0 ? 'Ordenar por' : 'Luego por'}</span>
          <select
            aria-label={`Columna del nivel ${index + 1}`}
            value={key.col}
            onChange={(event) => update(index, { col: Number(event.target.value) })}
          >
            {columns.map((col) => (
              <option key={col} value={col}>
                {columnLabel(col, hasHeader)}
              </option>
            ))}
          </select>
          <select
            aria-label={`Orden del nivel ${index + 1}`}
            value={key.descending ? 'desc' : 'asc'}
            onChange={(event) => update(index, { descending: event.target.value === 'desc' })}
          >
            <option value="asc">De menor a mayor (A a Z)</option>
            <option value="desc">De mayor a menor (Z a A)</option>
          </select>
          {keys.length > 1 && (
            <button
              type="button"
              className="find-bar__icon"
              aria-label={`Quitar el nivel ${index + 1}`}
              onClick={() => setKeys((current) => current.filter((_, i) => i !== index))}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="sheet-popover__button"
        disabled={keys.length >= columns.length}
        onClick={() => setKeys((current) => [...current, { col: range.start.col, descending: false }])}
      >
        <Plus size={14} /> Agregar nivel
      </button>
      <label className="sheet-sort-dialog__header">
        <input type="checkbox" checked={hasHeader} onChange={(event) => setHasHeader(event.target.checked)} /> Mis datos
        tienen encabezados
      </label>
      <div className="sheet-popover__actions">
        <button type="button" className="sheet-popover__button" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="sheet-popover__button is-primary" onClick={() => onSort(keys, hasHeader)}>
          Ordenar
        </button>
      </div>
    </div>
  )
}
