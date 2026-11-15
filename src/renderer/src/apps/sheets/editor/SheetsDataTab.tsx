import { ArrowDownAZ, ArrowUpAZ, Funnel, FunnelX, ListFilter, Search } from 'lucide-react'
import { RibbonGroup, ToolButton } from '@/ui/Ribbon'
import type { SheetCommands } from './SheetsRibbon'

/** Pestaña Datos: ordenar, filtrar y buscar. */
export function DataTab({ commands, hasFilter }: { commands: SheetCommands; hasFilter: boolean }) {
  return (
    <>
      <RibbonGroup label="Ordenar y filtrar">
        <div className="ribbon-stack">
          <ToolButton label="Ordenar de A a Z" showLabel onClick={() => commands.sort(false)}>
            <ArrowDownAZ size={14} />
          </ToolButton>
          <ToolButton label="Ordenar de Z a A" showLabel onClick={() => commands.sort(true)}>
            <ArrowUpAZ size={14} />
          </ToolButton>
        </div>
        <ToolButton label="Ordenar…" large onClick={commands.openSortDialog}>
          <ListFilter size={22} />
        </ToolButton>
        <ToolButton label="Filtro" large active={hasFilter} onClick={commands.toggleFilter}>
          <Funnel size={22} />
        </ToolButton>
        <ToolButton label="Borrar filtros" showLabel disabled={!hasFilter} onClick={commands.clearFilters}>
          <FunnelX size={14} />
        </ToolButton>
      </RibbonGroup>
      <RibbonGroup label="Buscar">
        <ToolButton label="Buscar y reemplazar" large onClick={() => commands.openFind('replace')}>
          <Search size={22} />
        </ToolButton>
      </RibbonGroup>
    </>
  )
}
