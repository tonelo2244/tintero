import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronsDownUp, ChevronsUpDown, Pilcrow, X } from 'lucide-react'
import { Dropdown, RibbonGroup, ToolButton } from '@/ui/Ribbon'
import { runCommand } from '../../model/commands'
import { MAX_HEADING_LEVEL } from '../../model/outline'
import { CommandButton, CommandMenuItem } from './CommandButton'
import { useCommandContext } from './commandContext'

const LEVELS: (number | null)[] = [...Array.from({ length: MAX_HEADING_LEVEL }, (_, index) => index + 1), null]

/**
 * Pestaña contextual Esquema: solo existe en la vista Esquema, como en Word. Subir y bajar de nivel,
 * mover secciones enteras, plegar y elegir hasta qué nivel se ve.
 */
export function OutlineTab() {
  const context = useCommandContext()
  return (
    <>
      <RibbonGroup label="Herramientas de esquema">
        <CommandButton command="outlinePromote" large icon={<ArrowLeft size={22} />} />
        <CommandButton command="outlineDemote" large icon={<ArrowRight size={22} />} />
        <CommandButton command="outlineToBody" large icon={<Pilcrow size={22} />} />
        <CommandButton command="outlineMoveUp" large icon={<ArrowUp size={22} />} />
        <CommandButton command="outlineMoveDown" large icon={<ArrowDown size={22} />} />
      </RibbonGroup>
      <RibbonGroup label="Mostrar">
        <CommandButton command="outlineExpandAll" large icon={<ChevronsUpDown size={22} />} />
        <CommandButton command="outlineCollapseAll" large icon={<ChevronsDownUp size={22} />} />
        <Dropdown label="Mostrar nivel" large trigger={<span className="ribbon-zoom-100">1–6</span>}>
          {(close) =>
            LEVELS.map((level) => (
              <CommandMenuItem key={level ?? 'all'} command="outlineShowLevel" arg={level} onDone={close}>
                {level === null ? 'Todos los niveles' : `Nivel ${level}`}
              </CommandMenuItem>
            ))
          }
        </Dropdown>
      </RibbonGroup>
      <RibbonGroup label="Cerrar">
        <ToolButton large label="Cerrar vista Esquema" onClick={() => runCommand(context, 'viewMode', 'print')}>
          <X size={22} />
        </ToolButton>
      </RibbonGroup>
    </>
  )
}
