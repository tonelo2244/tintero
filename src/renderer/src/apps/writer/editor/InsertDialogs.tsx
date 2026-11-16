import { useState } from 'react'
import type { Editor } from '@tiptap/core'
import { UserRound } from 'lucide-react'
import type { WriterDialogId, WriterUi } from '../model/commands'
import { BookmarkDialog, LinkDialog } from './LinkDialogs'
import { SymbolDialog } from './SymbolPicker'
import { AltTextDialog, ChartDialog, CropDialog } from './ObjectDialogs'
import { WriterDialog } from './WriterDialog'

interface InsertDialogsProps {
  dialog: WriterDialogId
  editor: Editor
  ui: WriterUi
  onClose(): void
}

/** El cuadro de Insertar que toca. Cada uno lee lo que necesita del editor al abrirse. */
export function InsertDialogs({ dialog, editor, ui, onClose }: InsertDialogsProps) {
  switch (dialog) {
    case 'link':
      return <LinkDialog editor={editor} onClose={onClose} />
    case 'bookmark':
      return <BookmarkDialog editor={editor} onClose={onClose} />
    case 'symbol':
      return <SymbolDialog editor={editor} onClose={onClose} />
    case 'crop':
      return <CropDialog editor={editor} onClose={onClose} />
    case 'altText':
      return <AltTextDialog editor={editor} onClose={onClose} />
    case 'chart':
      return <ChartDialog editor={editor} onClose={onClose} />
    case 'author':
      return <AuthorDialog author={ui.documentAuthor} onSave={ui.setDocumentAuthor} onClose={onClose} />
  }
}

/** El autor del documento, que pinta el campo Autor (y Word lee de las propiedades del .docx). */
function AuthorDialog({ author, onSave, onClose }: { author: string; onSave(author: string): void; onClose(): void }) {
  const [draft, setDraft] = useState(author)
  return (
    <WriterDialog
      title="Autor del documento"
      icon={<UserRound size={16} />}
      onClose={onClose}
      onSubmit={() => {
        onSave(draft)
        onClose()
      }}
      actions={
        <>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="is-primary">
            Aceptar
          </button>
        </>
      }
    >
      <label className="writer-page-setup__field">
        <span>Nombre</span>
        <span className="writer-page-setup__input">
          <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} />
        </span>
      </label>
    </WriterDialog>
  )
}
