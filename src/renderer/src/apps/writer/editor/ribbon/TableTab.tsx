import {
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  PaintBucket,
  PanelTop,
  Paintbrush,
  SquareDashed,
  TableCellsMerge,
  TableCellsSplit,
  Trash2
} from 'lucide-react'
import { ColorPicker } from '@/ui/ColorPicker'
import { Dropdown, RibbonGroup, RibbonRow } from '@/ui/Ribbon'
import { runCommand } from '../../model/commands'
import { CELL_BORDER_ACTIONS, TABLE_STYLES } from '../../model/tableStyles'
import { CommandButton, CommandMenuItem } from './CommandButton'
import { useCommandContext } from './commandContext'

/**
 * Pestaña contextual "Tabla": solo aparece con el cursor dentro de una tabla.
 * Cada botón se desactiva cuando su comando no se puede aplicar (p. ej. combinar con una sola celda).
 */
export function TableTab() {
  const context = useCommandContext()
  return (
    <>
      <RibbonGroup label="Estilos de tabla">
        <Dropdown label="Estilos" large trigger={<Paintbrush size={22} />}>
          {(close) => (
            <>
              {TABLE_STYLES.map((style) => (
                <CommandMenuItem key={style.id} command="tableStyle" arg={style.id} onDone={close}>
                  {style.label}
                </CommandMenuItem>
              ))}
            </>
          )}
        </Dropdown>
        <RibbonRow>
          <ColorPicker
            label="Sombreado"
            icon={<PaintBucket size={16} />}
            value={null}
            clearLabel="Sin color"
            onChange={(color) => runCommand(context, 'cellShading', color)}
            onClear={() => runCommand(context, 'cellShading', null)}
          />
        </RibbonRow>
        <RibbonRow>
          <Dropdown label="Bordes" trigger={<SquareDashed size={16} />}>
            {(close) => (
              <>
                {CELL_BORDER_ACTIONS.map(({ action, label }) => (
                  <CommandMenuItem key={action} command="cellBorders" arg={action} onDone={close}>
                    {label}
                  </CommandMenuItem>
                ))}
              </>
            )}
          </Dropdown>
        </RibbonRow>
      </RibbonGroup>

      <RibbonGroup label="Insertar filas y columnas">
        <RibbonRow>
          <CommandButton command="addRowBefore" showLabel icon={<BetweenHorizontalStart size={16} />} />
          <CommandButton command="addColumnBefore" showLabel icon={<BetweenVerticalStart size={16} />} />
        </RibbonRow>
        <RibbonRow>
          <CommandButton command="addRowAfter" showLabel icon={<BetweenHorizontalEnd size={16} />} />
          <CommandButton command="addColumnAfter" showLabel icon={<BetweenVerticalEnd size={16} />} />
        </RibbonRow>
      </RibbonGroup>

      <RibbonGroup label="Eliminar">
        <Dropdown label="Eliminar" large trigger={<Trash2 size={22} />}>
          {(close) => (
            <>
              <CommandMenuItem command="deleteRow" onDone={close}>
                Eliminar fila
              </CommandMenuItem>
              <CommandMenuItem command="deleteColumn" onDone={close}>
                Eliminar columna
              </CommandMenuItem>
              <CommandMenuItem command="deleteTable" onDone={close}>
                Eliminar tabla
              </CommandMenuItem>
            </>
          )}
        </Dropdown>
      </RibbonGroup>

      <RibbonGroup label="Combinar">
        <CommandButton command="mergeCells" large icon={<TableCellsMerge size={22} />} />
        <CommandButton command="splitCell" large icon={<TableCellsSplit size={22} />} />
      </RibbonGroup>

      <RibbonGroup label="Opciones">
        <CommandButton command="toggleHeaderRow" large icon={<PanelTop size={22} />} />
      </RibbonGroup>
    </>
  )
}
