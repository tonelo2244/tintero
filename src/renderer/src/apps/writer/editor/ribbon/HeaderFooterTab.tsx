import { AlignCenter, AlignLeft, AlignRight, Hash, ListOrdered, PanelTop, Columns2, X } from 'lucide-react'
import { RibbonGroup } from '@/ui/Ribbon'
import { CommandButton } from './CommandButton'

/**
 * Pestaña contextual Encabezado y pie: aparece al editar el encabezado o el pie sobre la hoja
 * (doble clic en el margen), como en Word.
 */
export function HeaderFooterTab() {
  return (
    <>
      <RibbonGroup label="Insertar">
        <CommandButton command="headerFooterPageNumber" large icon={<Hash size={22} />} />
        <CommandButton command="headerFooterPageCount" large icon={<ListOrdered size={22} />} />
      </RibbonGroup>
      <RibbonGroup label="Posición">
        <CommandButton command="headerFooterAlign" arg="left" label="Izquierda" icon={<AlignLeft size={16} />} />
        <CommandButton command="headerFooterAlign" arg="center" label="Centro" icon={<AlignCenter size={16} />} />
        <CommandButton command="headerFooterAlign" arg="right" label="Derecha" icon={<AlignRight size={16} />} />
      </RibbonGroup>
      <RibbonGroup label="Opciones">
        <CommandButton command="differentFirstPage" large icon={<PanelTop size={22} />} />
        <CommandButton command="differentEvenPages" large icon={<Columns2 size={22} />} />
      </RibbonGroup>
      <RibbonGroup label="Cerrar">
        <CommandButton command="closeHeaderFooter" large icon={<X size={22} />} />
      </RibbonGroup>
    </>
  )
}
