import {
  SeparatorHorizontal,
  RectangleHorizontal,
  RectangleVertical,
  Scaling,
  Settings2,
  StickyNote,
  TableColumnsSplit
} from 'lucide-react'
import { Dropdown, MenuItem, RibbonGroup } from '@/ui/Ribbon'
import { formatCm, marginPresetOf, MARGIN_PRESETS, paperSizeOf, PAPER_SIZES } from '../../model/pageSetup'
import { runCommand } from '../../model/commands'
import { NORMAL_STYLE_ID, resolveStyle } from '../../model/styles'
import { NumberField } from '../NumberField'
import type { WriterToolbarState } from '../useWriterToolbarState'
import { CommandButton, CommandMenuItem } from './CommandButton'
import { useCommandContext } from './commandContext'

interface LayoutTabProps {
  state: WriterToolbarState
}

/**
 * Pestaña Disposición: configurar página y saltos (fase 12), y sangrías y espaciado con valores
 * exactos y tabulaciones (fase 13). Columnas y secciones llegan con la fase 15. La regla se
 * enciende desde Vista > Mostrar, como en Word (fase 14).
 */
export function LayoutTab({ state }: LayoutTabProps) {
  const context = useCommandContext()
  // Sin valor puesto a mano, los campos enseñan el del estilo del párrafo (lo que se ve).
  const styleProps = resolveStyle(context.ui.styles, state.paragraphStyleId ?? NORMAL_STYLE_ID)
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
      <RibbonGroup label="Párrafo">
        <div className="ribbon-number-fields">
          <span className="ribbon-number-fields__title">Aplicar sangría</span>
          <NumberField
            live={false}
            label="Izquierda"
            unit="cm"
            value={state.indents?.left ?? styleProps.indentLeft ?? 0}
            onChange={(cm) => runCommand(context, 'indentLeftCm', cm)}
          />
          <NumberField
            live={false}
            label="Derecha"
            unit="cm"
            value={state.paragraph.indentRight ?? styleProps.indentRight ?? 0}
            onChange={(cm) => runCommand(context, 'indentRightCm', cm)}
          />
        </div>
        <div className="ribbon-number-fields">
          <span className="ribbon-number-fields__title">Espaciado</span>
          <NumberField
            live={false}
            label="Antes"
            unit="pt"
            value={state.paragraph.spaceBefore ?? styleProps.spaceBefore ?? 0}
            onChange={(pt) => runCommand(context, 'spaceBefore', Math.max(0, pt))}
          />
          <NumberField
            live={false}
            label="Después"
            unit="pt"
            value={state.paragraph.spaceAfter ?? styleProps.spaceAfter ?? 0}
            onChange={(pt) => runCommand(context, 'spaceAfter', Math.max(0, pt))}
          />
        </div>
        <CommandButton command="tabStopsDialog" large icon={<TableColumnsSplit size={22} />} />
      </RibbonGroup>
      <RibbonGroup label="Saltos">
        <CommandButton command="pageBreak" large icon={<SeparatorHorizontal size={22} />} />
      </RibbonGroup>
    </>
  )
}
