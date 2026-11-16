import { BookOpenText, MessageSquarePlus, MessagesSquare, Volume2 } from 'lucide-react'
import { RibbonGroup } from '@/ui/Ribbon'
import { CommandButton } from './CommandButton'

/**
 * Pestaña Revisar. Llega con la fase 14 con lo que ya funciona (contar palabras, leer en voz alta y
 * los comentarios que ya había en Insertar); ortografía, control de cambios y comparar llegan con
 * la fase 18. Ningún botón muerto: lo que aún no existe no se enseña.
 */
export function ReviewTab({ commentCount }: { commentCount: number }) {
  return (
    <>
      <RibbonGroup label="Revisión">
        <CommandButton command="wordCount" large icon={<BookOpenText size={22} />} />
      </RibbonGroup>
      <RibbonGroup label="Voz">
        <CommandButton command="readAloud" large icon={<Volume2 size={22} />} />
      </RibbonGroup>
      <RibbonGroup label="Comentarios">
        <CommandButton command="addComment" label="Nuevo comentario" large icon={<MessageSquarePlus size={22} />} />
        <CommandButton
          command="toggleComments"
          label={commentCount > 0 ? `Mostrar comentarios (${commentCount})` : 'Mostrar comentarios'}
          large
          icon={<MessagesSquare size={22} />}
        />
      </RibbonGroup>
    </>
  )
}
