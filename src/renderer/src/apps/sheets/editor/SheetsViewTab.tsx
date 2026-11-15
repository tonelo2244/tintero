import { Columns2, Rows2, Snowflake, SquareDashed } from 'lucide-react'
import { RibbonGroup, ToolButton } from '@/ui/Ribbon'
import type { SheetCommands } from './SheetsRibbon'

/**
 * Pestaña Vista: inmovilizar paneles. "Inmovilizar paneles" fija las filas de encima y las columnas
 * a la izquierda de la celda activa, como en Excel.
 */
export function ViewTab({ commands, frozen }: { commands: SheetCommands; frozen: boolean }) {
  return (
    <RibbonGroup label="Inmovilizar">
      <ToolButton label="Inmovilizar paneles" large onClick={() => commands.freeze('selection')}>
        <Snowflake size={22} />
      </ToolButton>
      <div className="ribbon-stack">
        <ToolButton label="Inmovilizar fila superior" showLabel onClick={() => commands.freeze('firstRow')}>
          <Rows2 size={14} />
        </ToolButton>
        <ToolButton label="Inmovilizar primera columna" showLabel onClick={() => commands.freeze('firstColumn')}>
          <Columns2 size={14} />
        </ToolButton>
        <ToolButton label="Movilizar paneles" showLabel disabled={!frozen} onClick={() => commands.freeze('none')}>
          <SquareDashed size={14} />
        </ToolButton>
      </div>
    </RibbonGroup>
  )
}
