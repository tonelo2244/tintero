import type { ChainedCommands, Editor } from '@tiptap/react'
import {
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  PanelTop,
  TableCellsMerge,
  TableCellsSplit,
  Trash2
} from 'lucide-react'
import { Dropdown, MenuItem, RibbonGroup, RibbonRow, ToolButton } from '@/ui/Ribbon'
import type { WriterToolbarState } from './useWriterToolbarState'

const DELETE_ACTIONS: { label: string; run(chain: ChainedCommands): void }[] = [
  { label: 'Eliminar fila', run: (chain) => chain.deleteRow().run() },
  { label: 'Eliminar columna', run: (chain) => chain.deleteColumn().run() },
  { label: 'Eliminar tabla', run: (chain) => chain.deleteTable().run() }
]

/**
 * Pestaña contextual "Tabla": solo aparece con el cursor dentro de una tabla.
 * Cada botón se desactiva cuando su comando no se puede aplicar (p. ej. combinar con una sola celda).
 */
export function WriterTableTab({ editor, state }: { editor: Editor; state: WriterToolbarState }) {
  const chain = () => editor.chain().focus()
  const { table } = state

  return (
    <>
      <RibbonGroup label="Insertar filas y columnas">
        <RibbonRow>
          <ToolButton label="Fila encima" showLabel onClick={() => chain().addRowBefore().run()}>
            <BetweenHorizontalStart size={16} />
          </ToolButton>
          <ToolButton label="Columna a la izquierda" showLabel onClick={() => chain().addColumnBefore().run()}>
            <BetweenVerticalStart size={16} />
          </ToolButton>
        </RibbonRow>
        <RibbonRow>
          <ToolButton label="Fila debajo" showLabel onClick={() => chain().addRowAfter().run()}>
            <BetweenHorizontalEnd size={16} />
          </ToolButton>
          <ToolButton label="Columna a la derecha" showLabel onClick={() => chain().addColumnAfter().run()}>
            <BetweenVerticalEnd size={16} />
          </ToolButton>
        </RibbonRow>
      </RibbonGroup>

      <RibbonGroup label="Eliminar">
        <Dropdown label="Eliminar" large trigger={<Trash2 size={22} />}>
          {(close) =>
            DELETE_ACTIONS.map(({ label, run }) => (
              <MenuItem
                key={label}
                onSelect={() => {
                  run(chain())
                  close()
                }}
              >
                {label}
              </MenuItem>
            ))
          }
        </Dropdown>
      </RibbonGroup>

      <RibbonGroup label="Combinar">
        <ToolButton label="Combinar celdas" large disabled={!table.canMerge} onClick={() => chain().mergeCells().run()}>
          <TableCellsMerge size={22} />
        </ToolButton>
        <ToolButton label="Dividir celda" large disabled={!table.canSplit} onClick={() => chain().splitCell().run()}>
          <TableCellsSplit size={22} />
        </ToolButton>
      </RibbonGroup>

      <RibbonGroup label="Opciones">
        <ToolButton
          label="Fila de encabezado"
          large
          active={table.headerRow}
          onClick={() => chain().toggleHeaderRow().run()}
        >
          <PanelTop size={22} />
        </ToolButton>
      </RibbonGroup>
    </>
  )
}
