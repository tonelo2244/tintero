import {
  SeparatorHorizontal,
  RectangleHorizontal,
  RectangleVertical,
  Ruler,
  Scaling,
  Settings2,
  StickyNote
} from 'lucide-react'
import { Dropdown, MenuItem, RibbonGroup } from '@/ui/Ribbon'
import { formatCm, marginPresetOf, MARGIN_PRESETS, paperSizeOf, PAPER_SIZES } from '../../model/pageSetup'
import { runCommand } from '../../model/commands'
import { CommandButton, CommandMenuItem } from './CommandButton'
import { useCommandContext } from './commandContext'

/**
 * Pestaña Disposición, primera parte (fase 12): configurar página y saltos. Sangrías y espaciado
 * con valores exactos llegan con la fase 13; columnas y secciones, con la 15.
 */
export function LayoutTab({ showRuler, onToggleRuler }: { showRuler: boolean; onToggleRuler(): void }) {
  const context = useCommandContext()
  const { pageSetup } = context.ui
  const activePreset = marginPresetOf(pageSetup)?.id
  const activePaper = paperSizeOf(pageSetup)?.id

  return (
    <>
      <RibbonGroup label="Configurar página">
        <Dropdown label="Márgenes" large trigger={<StickyNote size={22} />}>
          {(close) => (
            <>
              {MARGIN_PRESETS.map((preset) => (
                <MenuItem
                  key={preset.id}
                  onSelect={() => {
                    runCommand(context, 'marginPreset', preset.id)
                    close()
                  }}
                >
                  <span className="menu-item__check" aria-hidden>
                    {activePreset === preset.id ? '✓' : ''}
                  </span>
                  <span className="layout-option">
                    <b>{preset.label}</b>
                    <small>
                      Superior {formatCm(preset.margins.top)} · Izquierdo {formatCm(preset.margins.left)}
                    </small>
                  </span>
                </MenuItem>
              ))}
              <CommandMenuItem command="pageSetupDialog" onDone={close}>
                Márgenes personalizados…
              </CommandMenuItem>
            </>
          )}
        </Dropdown>
        <Dropdown
          label="Orientación"
          large
          trigger={
            pageSetup.orientation === 'landscape' ? <RectangleHorizontal size={22} /> : <RectangleVertical size={22} />
          }
        >
          {(close) => (
            <>
              <CommandMenuItem command="orientation" arg="portrait" onDone={close}>
                Vertical
              </CommandMenuItem>
              <CommandMenuItem command="orientation" arg="landscape" onDone={close}>
                Horizontal
              </CommandMenuItem>
            </>
          )}
        </Dropdown>
        <Dropdown label="Tamaño" large trigger={<Scaling size={22} />}>
          {(close) => (
            <>
              {PAPER_SIZES.map((paper) => (
                <MenuItem
                  key={paper.id}
                  onSelect={() => {
                    runCommand(context, 'paperSize', paper.id)
                    close()
                  }}
                >
                  <span className="menu-item__check" aria-hidden>
                    {activePaper === paper.id ? '✓' : ''}
                  </span>
                  <span className="layout-option">
                    <b>{paper.label}</b>
                    <small>
                      {formatCm(paper.width)} x {formatCm(paper.height)}
                    </small>
                  </span>
                </MenuItem>
              ))}
              <CommandMenuItem command="pageSetupDialog" onDone={close}>
                Más tamaños de papel…
              </CommandMenuItem>
            </>
          )}
        </Dropdown>
        <CommandButton command="pageSetupDialog" icon={<Settings2 size={16} />} />
      </RibbonGroup>
      <RibbonGroup label="Saltos">
        <CommandButton command="pageBreak" large icon={<SeparatorHorizontal size={22} />} />
      </RibbonGroup>
      <RibbonGroup label="Mostrar">
        <button
          type="button"
          className={`tool-button tool-button--large ${showRuler ? 'is-active' : ''}`}
          aria-pressed={showRuler}
          title="Regla"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToggleRuler}
        >
          <Ruler size={22} />
          <span className="tool-button__label">Regla</span>
        </button>
      </RibbonGroup>
    </>
  )
}
