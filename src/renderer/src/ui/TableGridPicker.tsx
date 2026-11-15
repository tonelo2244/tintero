import { useState } from 'react'
import { Table as TableIcon } from 'lucide-react'
import { Dropdown } from '@/ui/Ribbon'

const GRID_COLUMNS = 10
const GRID_ROWS = 8

interface TableGridPickerProps {
  onInsert(size: { rows: number; cols: number }): void
}

/** Rejilla para elegir el tamaño de la tabla pasando el ratón por encima, como en Word. */
export function TableGridPicker({ onInsert }: TableGridPickerProps) {
  const [hover, setHover] = useState({ rows: 0, cols: 0 })

  return (
    <Dropdown label="Tabla" large trigger={<TableIcon size={22} />}>
      {(close) => (
        <div className="table-picker" onMouseLeave={() => setHover({ rows: 0, cols: 0 })}>
          <div className="table-picker__label">
            {hover.rows > 0 ? `Tabla de ${hover.cols} × ${hover.rows}` : 'Insertar tabla'}
          </div>
          <div className="table-picker__grid" style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, 1fr)` }}>
            {Array.from({ length: GRID_ROWS * GRID_COLUMNS }, (_, index) => {
              const rows = Math.floor(index / GRID_COLUMNS) + 1
              const cols = (index % GRID_COLUMNS) + 1
              const selected = rows <= hover.rows && cols <= hover.cols
              return (
                <button
                  key={index}
                  type="button"
                  className={`table-picker__cell ${selected ? 'is-selected' : ''}`}
                  aria-label={`Tabla de ${cols} columnas por ${rows} filas`}
                  onMouseEnter={() => setHover({ rows, cols })}
                  onFocus={() => setHover({ rows, cols })}
                  onClick={() => {
                    onInsert({ rows, cols })
                    close()
                  }}
                />
              )
            })}
          </div>
        </div>
      )}
    </Dropdown>
  )
}
