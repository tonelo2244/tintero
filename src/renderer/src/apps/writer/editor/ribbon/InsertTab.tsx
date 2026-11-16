import type { ChangeEvent } from 'react'
import {
  CalendarDays,
  Code2,
  SeparatorHorizontal,
  ImagePlus,
  MessageSquarePlus,
  MessagesSquare,
  Minus,
  PanelTop,
  Quote
} from 'lucide-react'
import { RibbonGroup } from '@/ui/Ribbon'
import { readImageFile } from '@/ui/readImageFile'
import { TableGridPicker } from '@/ui/TableGridPicker'
import { runCommand } from '../../model/commands'
import { CommandButton } from './CommandButton'
import { useCommandContext } from './commandContext'

/** Pestaña Insertar: páginas, tablas, imágenes, elementos, comentarios y encabezado y pie. */
export function InsertTab({ commentCount }: { commentCount: number }) {
  const context = useCommandContext()

  // La imagen necesita elegir un archivo antes de ejecutar el comando: el botón es un <input file>.
  const insertImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    runCommand(context, 'insertImage', { src: await readImageFile(file), alt: file.name })
  }

  return (
    <>
      <RibbonGroup label="Páginas">
        <CommandButton command="pageBreak" large icon={<SeparatorHorizontal size={22} />} />
      </RibbonGroup>
      <RibbonGroup label="Tablas">
        <TableGridPicker onInsert={(size) => runCommand(context, 'insertTable', size)} />
      </RibbonGroup>
      <RibbonGroup label="Ilustraciones">
        <label className="tool-button tool-button--large" title="Insertar imagen desde el disco">
          <ImagePlus size={22} />
          <span className="tool-button__label">Imagen</span>
          <input type="file" accept="image/*" hidden onChange={(event) => void insertImage(event)} />
        </label>
      </RibbonGroup>
      <RibbonGroup label="Elementos">
        <CommandButton command="horizontalRule" large icon={<Minus size={22} />} />
        <CommandButton command="insertDate" large icon={<CalendarDays size={22} />} />
        <CommandButton command="blockquote" large icon={<Quote size={22} />} />
        <CommandButton command="codeBlock" large icon={<Code2 size={22} />} />
      </RibbonGroup>
      <RibbonGroup label="Comentarios">
        <CommandButton command="addComment" large icon={<MessageSquarePlus size={22} />} />
        <CommandButton
          command="toggleComments"
          large
          label={commentCount > 0 ? `Ver comentarios (${commentCount})` : 'Ver comentarios'}
          icon={<MessagesSquare size={22} />}
        />
      </RibbonGroup>
      <RibbonGroup label="Encabezado y pie">
        <CommandButton command="toggleHeaderFooter" large icon={<PanelTop size={22} />} />
      </RibbonGroup>
    </>
  )
}
