interface NotesPaneProps {
  notes: string
  onChange(notes: string): void
}

export function NotesPane({ notes, onChange }: NotesPaneProps) {
  return (
    <textarea
      className="notes-pane"
      value={notes}
      placeholder="Haga clic para agregar notas"
      aria-label="Notas del orador"
      spellCheck
      lang="es"
      onChange={(event) => onChange(event.target.value)}
    />
  )
}
