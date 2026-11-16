import type { Editor } from '@tiptap/core'
import type { WriterDialogId } from '../model/commands'
import { BookmarkDialog, LinkDialog } from './LinkDialogs'

interface InsertDialogsProps {
  dialog: WriterDialogId
  editor: Editor
  onClose(): void
}

/** El cuadro de Insertar que toca. Cada uno lee lo que necesita del editor al abrirse. */
export function InsertDialogs({ dialog, editor, onClose }: InsertDialogsProps) {
  switch (dialog) {
    case 'link':
      return <LinkDialog editor={editor} onClose={onClose} />
    case 'bookmark':
      return <BookmarkDialog editor={editor} onClose={onClose} />
  }
}
