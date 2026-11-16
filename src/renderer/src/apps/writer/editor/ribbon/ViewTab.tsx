import {
  BookOpen,
  Compass,
  FileText,
  ListTree,
  MoveHorizontal,
  RectangleVertical,
  Ruler,
  ScrollText,
  SquareSplitVertical,
  ZoomIn
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Dropdown, MenuItem, RibbonGroup } from '@/ui/Ribbon'
import { runCommand } from '../../model/commands'
import { VIEW_MODES, type ViewMode } from '../../model/views'
import { ZOOM_STEPS } from '../../model/zoom'
import { CommandButton } from './CommandButton'
import { useCommandContext } from './commandContext'

const VIEW_ICONS: Record<ViewMode, ReactNode> = {
  read: <BookOpen size={22} />,
  print: <FileText size={22} />,
  draft: <ScrollText size={22} />,
  outline: <ListTree size={22} />
}

/** Pestaña Vista (fase 14): vistas del documento, qué se enseña, zoom y dividir la ventana. */
export function ViewTab() {
  const context = useCommandContext()
  const { viewMode, zoom } = context.ui
  const paginated = viewMode === 'print'

  return (
    <>
      <RibbonGroup label="Vistas">
        {VIEW_MODES.map((mode) => (
          <CommandButton
            key={mode.id}
            command="viewMode"
            arg={mode.id}
            label={mode.label}
            large
            icon={VIEW_ICONS[mode.id]}
          />
        ))}
      </RibbonGroup>
      <RibbonGroup label="Mostrar">
        <CommandButton command="toggleNavigation" large icon={<Compass size={22} />} />
        {(viewMode === 'print' || viewMode === 'draft') && (
          <CommandButton command="toggleRuler" large icon={<Ruler size={22} />} />
        )}
      </RibbonGroup>
      <RibbonGroup label="Zoom">
        <Dropdown label={`Zoom (${Math.round(zoom * 100)} %)`} large trigger={<ZoomIn size={22} />}>
          {(close) =>
            ZOOM_STEPS.map((step) => (
              <MenuItem
                key={step}
                onSelect={() => {
                  runCommand(context, 'zoom', step)
                  close()
                }}
              >
                <span className="menu-item__check" aria-hidden>
                  {Math.abs(zoom - step) < 0.001 ? '✓' : ''}
                </span>
                {Math.round(step * 100)} %
              </MenuItem>
            ))
          }
        </Dropdown>
        <CommandButton
          command="zoom"
          arg="actual"
          label="100 %"
          large
          icon={<span className="ribbon-zoom-100">1:1</span>}
        />
        {paginated && (
          <CommandButton command="zoom" arg="onePage" label="Una página" large icon={<RectangleVertical size={22} />} />
        )}
        <CommandButton
          command="zoom"
          arg="pageWidth"
          label="Ancho de página"
          large
          icon={<MoveHorizontal size={22} />}
        />
      </RibbonGroup>
      <RibbonGroup label="Ventana">
        <CommandButton command="toggleSplit" large icon={<SquareSplitVertical size={22} />} />
      </RibbonGroup>
    </>
  )
}
