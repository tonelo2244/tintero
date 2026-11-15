import { ChartColumn, ChartLine, ChartPie } from 'lucide-react'
import { RibbonGroup, ToolButton } from '@/ui/Ribbon'
import type { SheetCommands } from './SheetsRibbon'

/** Pestaña Insertar: gráficos a partir de la selección (o de la tabla en la que está la celda). */
export function InsertTab({ commands }: { commands: SheetCommands }) {
  return (
    <RibbonGroup label="Gráficos">
      <ToolButton label="Columnas" large onClick={() => commands.insertChart('bar')}>
        <ChartColumn size={22} />
      </ToolButton>
      <ToolButton label="Líneas" large onClick={() => commands.insertChart('line')}>
        <ChartLine size={22} />
      </ToolButton>
      <ToolButton label="Circular" large onClick={() => commands.insertChart('pie')}>
        <ChartPie size={22} />
      </ToolButton>
    </RibbonGroup>
  )
}
