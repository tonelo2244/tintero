import { useMemo, useState, type ChangeEvent } from 'react'
import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { ArrowLeftRight, Captions, Library, NotebookText, Quote } from 'lucide-react'
import {
  CAPTION_LABELS,
  CROSS_REFERENCE_SHOW,
  isValidCaptionLabel,
  type CrossReferenceShow,
  type ReferenceKind
} from '../model/captions'
import {
  CITATION,
  formatCitation,
  parsePeople,
  peopleText,
  SOURCE_TYPES,
  suggestSourceId,
  type CitationStyle,
  type Source,
  type SourceType
} from '../model/citations'
import { parseBibtex } from '../model/bibtex'
import { NOTE_KIND_LABELS, type NoteKind } from '../model/notes'
import type { CaptionPosition } from './Caption'
import { findNote } from './Note'
import { documentIndex } from './references'
import { WriterDialog } from './WriterDialog'

const cancelButton = (onClose: () => void, label = 'Cancelar') => (
  <button type="button" onClick={onClose}>
    {label}
  </button>
)

// --- Notas -----------------------------------------------------------------

/** El texto de una nota al pie o al final (se abre al insertarla o con doble clic). */
export function NoteDialog({ editor, noteId, onClose }: { editor: Editor; noteId: string; onClose(): void }) {
  const original = useMemo(() => {
    const pos = findNote(editor.state.doc, noteId)
    const node = pos === null ? null : editor.state.doc.nodeAt(pos)
    return node ? { text: String(node.attrs.text ?? ''), kind: node.attrs.kind as NoteKind } : null
  }, [editor, noteId])
  const [text, setText] = useState(original?.text ?? '')
  const [kind, setKind] = useState<NoteKind>(original?.kind ?? 'footnote')
  if (!original) return null
  const number = documentIndex(editor.state.doc).noteNumbers.get(noteId) ?? 1
  // Cancelar una nota recién insertada (sin texto todavía) la quita: no deja un número huérfano.
  const cancel = () => {
    if (original.text === '' && text === '') editor.chain().focus().deleteNote(noteId).run()
    else editor.commands.focus()
    onClose()
  }
  return (
    <WriterDialog
      title={`${NOTE_KIND_LABELS[kind]} ${kind === 'footnote' ? number : ''}`.trim()}
      icon={<NotebookText size={16} />}
      onClose={cancel}
      onSubmit={() => {
        editor.chain().focus().updateNote(noteId, { text: text.trim(), kind }).run()
        onClose()
      }}
      actions={
        <>
          <button
            type="button"
            onClick={() => {
              editor.chain().focus().deleteNote(noteId).run()
              onClose()
            }}
          >
            Eliminar nota
          </button>
          {cancelButton(cancel)}
          <button type="submit" className="is-primary">
            Aceptar
          </button>
        </>
      }
    >
      <label className="writer-page-setup__field writer-page-setup__field--column">
        <span>Texto de la nota</span>
        <textarea
          autoFocus
          aria-label="Texto de la nota"
          className="writer-dialog__textarea"
          rows={4}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Intro acepta (como un campo de texto); Mayús+Intro, salto de línea.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
        />
      </label>
      <label className="writer-page-setup__field">
        <span>Tipo</span>
        <select value={kind} onChange={(event) => setKind(event.target.value as NoteKind)}>
          <option value="footnote">Nota al pie (al final de la hoja)</option>
          <option value="endnote">Nota al final (al final del documento)</option>
        </select>
      </label>
    </WriterDialog>
  )
}

// --- Títulos ---------------------------------------------------------------

/** Rótulos del documento además de los de serie (los creados con "Nuevo rótulo"). */
function documentLabels(editor: Editor): string[] {
  const labels = new Set<string>(CAPTION_LABELS)
  for (const target of documentIndex(editor.state.doc).targets) if (target.label) labels.add(target.label)
  return [...labels]
}

/** Referencias > Insertar título: "Figura 1: texto" encima o debajo de lo seleccionado. */
export function CaptionDialog({ editor, onClose }: { editor: Editor; onClose(): void }) {
  // Lo de Word: una tabla lleva el título encima y es "Tabla"; lo demás, debajo y "Figura".
  const inTable = editor.isActive('table')
  const selectedObject = editor.state.selection instanceof NodeSelection
  const [labels, setLabels] = useState(() => documentLabels(editor))
  const [label, setLabel] = useState(inTable ? 'Tabla' : 'Figura')
  const [text, setText] = useState('')
  const [position, setPosition] = useState<CaptionPosition>(inTable ? 'above' : 'below')
  const [newLabel, setNewLabel] = useState<string | null>(null)
  const preview = `${label} ${(documentIndex(editor.state.doc).targets.filter((target) => target.label === label).length ?? 0) + 1}${text.trim() ? `: ${text.trim()}` : ''}`
  return (
    <WriterDialog
      title="Insertar título"
      icon={<Captions size={16} />}
      onClose={onClose}
      onSubmit={() => {
        editor.chain().focus().insertCaption({ label, text, position }).run()
        onClose()
      }}
      actions={
        <>
          {cancelButton(onClose)}
          <button type="submit" className="is-primary">
            Insertar
          </button>
        </>
      }
    >
      <label className="writer-page-setup__field">
        <span>Texto</span>
        <span className="writer-page-setup__input">
          <input
            autoFocus
            aria-label="Texto del título"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </span>
      </label>
      <label className="writer-page-setup__field">
        <span>Rótulo</span>
        <select aria-label="Rótulo" value={label} onChange={(event) => setLabel(event.target.value)}>
          {labels.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      {newLabel === null ? (
        <button type="button" className="writer-dialog-button" onClick={() => setNewLabel('')}>
          Nuevo rótulo…
        </button>
      ) : (
        <div className="writer-page-setup__field">
          <span className="writer-page-setup__input">
            <input
              aria-label="Nuevo rótulo"
              placeholder="Gráfico, Mapa…"
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
            />
          </span>
          <button
            type="button"
            className="writer-dialog-button"
            disabled={!isValidCaptionLabel(newLabel)}
            onClick={() => {
              setLabels((current) => (current.includes(newLabel) ? current : [...current, newLabel]))
              setLabel(newLabel)
              setNewLabel(null)
            }}
          >
            Agregar
          </button>
        </div>
      )}
      <label className="writer-page-setup__field">
        <span>Posición</span>
        <select value={position} onChange={(event) => setPosition(event.target.value as CaptionPosition)}>
          <option value="below">Debajo {selectedObject || inTable ? 'de la selección' : 'del párrafo'}</option>
          <option value="above">Encima {selectedObject || inTable ? 'de la selección' : 'del párrafo'}</option>
        </select>
      </label>
      <p className="writer-dialog__hint">Quedará así: {preview}</p>
    </WriterDialog>
  )
}

// --- Referencias cruzadas --------------------------------------------------

/** Referencias > Referencia cruzada: a un título, a un título de figura o tabla, o a un marcador. */
export function CrossReferenceDialog({ editor, onClose }: { editor: Editor; onClose(): void }) {
  const targets = useMemo(() => documentIndex(editor.state.doc).targets, [editor])
  const kinds = useMemo(() => {
    const options: { value: string; label: string; kind: ReferenceKind }[] = [
      { value: 'heading', label: 'Título (encabezado)', kind: 'heading' }
    ]
    for (const label of new Set(targets.flatMap((target) => (target.label ? [target.label] : [])))) {
      options.push({ value: `caption:${label}`, label, kind: 'caption' })
    }
    options.push({ value: 'bookmark', label: 'Marcador', kind: 'bookmark' })
    return options
  }, [targets])
  const [type, setType] = useState(kinds[0].value)
  const kind = kinds.find((option) => option.value === type)?.kind ?? 'heading'
  const options = targets.filter((target) =>
    kind === 'caption' ? target.kind === 'caption' && `caption:${target.label}` === type : target.kind === kind
  )
  const [targetPos, setTargetPos] = useState<number | null>(null)
  const selected = options.find((target) => target.pos === targetPos) ?? options[0]
  const [show, setShow] = useState<CrossReferenceShow>('text')
  const shows = CROSS_REFERENCE_SHOW[kind]
  const currentShow = shows.some((option) => option.show === show) ? show : shows[0].show
  return (
    <WriterDialog
      title="Referencia cruzada"
      icon={<ArrowLeftRight size={16} />}
      onClose={onClose}
      onSubmit={() => {
        if (!selected) return
        editor.chain().focus().insertCrossReference(selected.pos, currentShow).run()
        onClose()
      }}
      actions={
        <>
          {cancelButton(onClose)}
          <button type="submit" className="is-primary" disabled={!selected}>
            Insertar
          </button>
        </>
      }
    >
      <label className="writer-page-setup__field">
        <span>Tipo</span>
        <select aria-label="Tipo de referencia" value={type} onChange={(event) => setType(event.target.value)}>
          {kinds.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="writer-page-setup__field">
        <span>Referencia a</span>
        <select
          aria-label="Referencia a"
          value={currentShow}
          onChange={(event) => setShow(event.target.value as CrossReferenceShow)}
        >
          {shows.map((option) => (
            <option key={option.show} value={option.show}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {options.length === 0 ? (
        <p className="writer-dialog__hint">
          {kind === 'heading'
            ? 'No hay títulos con los estilos Título 1, Título 2…'
            : kind === 'bookmark'
              ? 'No hay marcadores. Ponlos en Insertar > Marcador.'
              : 'No hay títulos de este rótulo.'}
        </p>
      ) : (
        <select
          aria-label="Destino"
          size={Math.min(8, Math.max(3, options.length))}
          value={selected?.pos}
          onChange={(event) => setTargetPos(Number(event.target.value))}
        >
          {options.map((target) => (
            <option key={target.pos} value={target.pos}>
              {target.level && target.level > 1 ? '  '.repeat(target.level - 1) : ''}
              {target.text || target.anchor}
            </option>
          ))}
        </select>
      )}
      <p className="writer-dialog__hint">Se actualiza sola si cambias el título o se mueve de página.</p>
    </WriterDialog>
  )
}

// --- Fuentes ---------------------------------------------------------------

/** Etiquetas del formulario según el tipo: "Revista" en un artículo, "Libro" en un capítulo... */
const CONTAINER_LABEL: Partial<Record<SourceType, string>> = {
  journalArticle: 'Revista',
  bookSection: 'Título del libro',
  website: 'Nombre del sitio web'
}

const FIELDS_BY_TYPE: Record<SourceType, (keyof Source)[]> = {
  book: ['city', 'publisher', 'edition', 'doi', 'url'],
  bookSection: ['container', 'editors', 'pages', 'city', 'publisher', 'doi'],
  journalArticle: ['container', 'volume', 'issue', 'pages', 'doi', 'url'],
  website: ['container', 'url', 'accessed'],
  report: ['reportType', 'publisher', 'city', 'url'],
  other: ['publisher', 'city', 'url']
}

const FIELD_LABELS: Partial<Record<keyof Source, string>> = {
  city: 'Ciudad',
  publisher: 'Editorial o institución',
  edition: 'Edición',
  volume: 'Volumen',
  issue: 'Número',
  pages: 'Páginas',
  reportType: 'Tipo (Tesis doctoral, Informe técnico…)',
  url: 'URL',
  doi: 'DOI',
  accessed: 'Fecha de consulta'
}

interface SourceDraft {
  id: string
  type: SourceType
  authors: string
  corporateAuthor: string
  editors: string
  fields: Partial<Record<keyof Source, string>>
}

const emptyDraft = (): SourceDraft => ({
  id: '',
  type: 'book',
  authors: '',
  corporateAuthor: '',
  editors: '',
  fields: {}
})

function draftOf(source: Source): SourceDraft {
  const fields: Partial<Record<keyof Source, string>> = {}
  for (const key of [
    'title',
    'year',
    'container',
    'city',
    'publisher',
    'edition',
    'volume',
    'issue',
    'pages',
    'reportType',
    'url',
    'doi',
    'accessed'
  ] as const) {
    const value = source[key]
    if (typeof value === 'string') fields[key] = value
  }
  return {
    id: source.id,
    type: source.type,
    authors: peopleText(source.authors),
    corporateAuthor: source.corporateAuthor ?? '',
    editors: peopleText(source.editors),
    fields
  }
}

function sourceOf(draft: SourceDraft, id: string): Source {
  const source: Source = {
    id,
    type: draft.type,
    authors: parsePeople(draft.authors),
    title: draft.fields.title?.trim() ?? ''
  }
  if (draft.corporateAuthor.trim()) source.corporateAuthor = draft.corporateAuthor.trim()
  const editors = parsePeople(draft.editors)
  if (editors.length > 0) source.editors = editors
  for (const key of [
    'year',
    'container',
    'city',
    'publisher',
    'edition',
    'volume',
    'issue',
    'pages',
    'reportType',
    'url',
    'doi',
    'accessed'
  ] as const) {
    const value = draft.fields[key]?.trim()
    if (value) source[key] = value
  }
  return source
}

/** Referencias > Administrar fuentes: crear, cambiar y borrar fuentes, e importar BibTeX. */
export function SourcesDialog({
  editor,
  sources,
  style,
  onChange,
  onClose
}: {
  editor: Editor
  sources: Source[]
  style: CitationStyle
  onChange(sources: Source[]): void
  onClose(): void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<SourceDraft>(emptyDraft)
  const [bibtex, setBibtex] = useState('')
  const [message, setMessage] = useState('')
  const ids = sources.map((source) => source.id)
  const title = draft.fields.title?.trim() ?? ''
  const field = (key: keyof Source) => draft.fields[key] ?? ''
  const setField = (key: keyof Source, value: string) =>
    setDraft((current) => ({ ...current, fields: { ...current.fields, [key]: value } }))
  const citedCount = (id: string) => {
    let count = 0
    editor.state.doc.descendants((node) => {
      if (node.type.name === CITATION && node.attrs.sourceId === id) count++
    })
    return count
  }

  const save = (cite: boolean) => {
    if (!title) return
    const draftSource = sourceOf(draft, '')
    const id =
      editing ??
      (draft.id.trim() && !ids.includes(draft.id.trim()) ? draft.id.trim() : suggestSourceId(draftSource, ids))
    const source = { ...draftSource, id }
    onChange(editing ? sources.map((existing) => (existing.id === editing ? source : existing)) : [...sources, source])
    setMessage(`${editing ? 'Cambiada' : 'Agregada'}: ${formatCitation(source, style)}`)
    setEditing(null)
    setDraft(emptyDraft())
    if (cite) {
      editor.chain().focus().insertCitation(id).run()
      onClose()
    }
  }

  const importBibtex = (text: string) => {
    const { sources: imported, skipped } = parseBibtex(text, ids)
    if (imported.length > 0) onChange([...sources, ...imported])
    setMessage(
      `${imported.length === 1 ? 'Se importó 1 fuente' : `Se importaron ${imported.length} fuentes`}${
        skipped.length > 0 ? `; se saltaron ${skipped.length} sin título` : ''
      }.`
    )
    setBibtex('')
  }

  const readBibFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) importBibtex(await file.text())
  }

  return (
    <WriterDialog
      title="Administrar fuentes"
      icon={<Library size={16} />}
      onClose={onClose}
      className="writer-sources-dialog"
    >
      {sources.length > 0 && (
        <ul className="writer-source-list" aria-label="Fuentes del documento">
          {sources.map((source) => (
            <li key={source.id} className={source.id === editing ? 'is-active' : undefined}>
              <span title={source.title}>
                {formatCitation(source, style, {}, sources)} {source.title}
              </span>
              <button
                type="button"
                className="writer-dialog-button"
                onClick={() => {
                  editor.chain().focus().insertCitation(source.id).run()
                  onClose()
                }}
              >
                Citar
              </button>
              <button
                type="button"
                className="writer-dialog-button"
                onClick={() => {
                  setEditing(source.id)
                  setDraft(draftOf(source))
                }}
              >
                Editar
              </button>
              <button
                type="button"
                className="writer-dialog-button"
                onClick={() => {
                  const cited = citedCount(source.id)
                  onChange(sources.filter((existing) => existing.id !== source.id))
                  setMessage(
                    cited > 0
                      ? `Borrada. Sus ${cited === 1 ? 'cita queda' : `${cited} citas quedan`} en rojo hasta que las cambies.`
                      : 'Borrada.'
                  )
                }}
              >
                Borrar
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="writer-source-form"
        onSubmit={(event) => {
          event.preventDefault()
          save(false)
        }}
      >
        <p className="writer-dialog__hint">{editing ? `Editando ${editing}` : 'Nueva fuente'}</p>
        <label className="writer-page-setup__field">
          <span>Tipo</span>
          <select
            aria-label="Tipo de fuente"
            value={draft.type}
            onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as SourceType }))}
          >
            {SOURCE_TYPES.map((option) => (
              <option key={option.type} value={option.type}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <TextField
          label="Autores"
          placeholder="Apellidos, Nombre; Apellidos, Nombre"
          value={draft.authors}
          onChange={(value) => setDraft((current) => ({ ...current, authors: value }))}
        />
        {!draft.authors.trim() && (
          <TextField
            label="Organización autora"
            value={draft.corporateAuthor}
            onChange={(value) => setDraft((current) => ({ ...current, corporateAuthor: value }))}
          />
        )}
        <TextField label="Título" value={field('title')} onChange={(value) => setField('title', value)} />
        <TextField label="Año" value={field('year')} onChange={(value) => setField('year', value)} />
        {FIELDS_BY_TYPE[draft.type].map((key) =>
          key === 'editors' ? (
            <TextField
              key={key}
              label="Editores"
              placeholder="Apellidos, Nombre; …"
              value={draft.editors}
              onChange={(value) => setDraft((current) => ({ ...current, editors: value }))}
            />
          ) : (
            <TextField
              key={key}
              label={
                CONTAINER_LABEL[draft.type] && key === 'container'
                  ? CONTAINER_LABEL[draft.type]!
                  : (FIELD_LABELS[key] ?? key)
              }
              type={key === 'accessed' ? 'date' : 'text'}
              value={field(key)}
              onChange={(value) => setField(key, value)}
            />
          )
        )}
        {!editing && (
          <TextField
            label="Etiqueta"
            placeholder={suggestSourceId(sourceOf(draft, ''), ids)}
            value={draft.id}
            onChange={(value) => setDraft((current) => ({ ...current, id: value }))}
          />
        )}
        <div className="writer-page-setup__actions">
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null)
                setDraft(emptyDraft())
              }}
            >
              Cancelar
            </button>
          )}
          <button type="button" disabled={!title} onClick={() => save(true)}>
            {editing ? 'Guardar y citar' : 'Agregar y citar'}
          </button>
          <button type="submit" className="is-primary" disabled={!title}>
            {editing ? 'Guardar' : 'Agregar'}
          </button>
        </div>
      </form>
      <details className="writer-bibtex">
        <summary>Importar desde BibTeX</summary>
        <p className="writer-dialog__hint">
          Pega las entradas que exportan Google Académico, Zotero o Mendeley (@book{'{…}'}, @article{'{…}'}…), o elige
          un archivo .bib.
        </p>
        <textarea
          aria-label="Texto BibTeX"
          className="writer-dialog__textarea"
          rows={5}
          value={bibtex}
          onChange={(event) => setBibtex(event.target.value)}
        />
        <div className="writer-page-setup__actions">
          <label className="writer-dialog-button">
            Elegir archivo .bib
            <input type="file" accept=".bib,text/plain" hidden onChange={(event) => void readBibFile(event)} />
          </label>
          <button type="button" disabled={!bibtex.trim()} onClick={() => importBibtex(bibtex)}>
            Importar
          </button>
        </div>
      </details>
      {message && (
        <p className="writer-dialog__hint" role="status">
          {message}
        </p>
      )}
    </WriterDialog>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text'
}: {
  label: string
  value: string
  onChange(value: string): void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="writer-page-setup__field">
      <span>{label}</span>
      <span className="writer-page-setup__input">
        <input
          aria-label={label}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  )
}

// --- Cita ------------------------------------------------------------------

/** Doble clic en una cita: cambiar las páginas o la fuente. */
export function CitationDialog({
  editor,
  pos,
  sources,
  style,
  onClose
}: {
  editor: Editor
  pos: number
  sources: Source[]
  style: CitationStyle
  onClose(): void
}) {
  const node = editor.state.doc.nodeAt(pos)
  const [sourceId, setSourceId] = useState(String(node?.attrs.sourceId ?? ''))
  const [pages, setPages] = useState(String(node?.attrs.pages ?? ''))
  if (node?.type.name !== CITATION) return null
  const source = sources.find((candidate) => candidate.id === sourceId)
  return (
    <WriterDialog
      title="Editar cita"
      icon={<Quote size={16} />}
      onClose={onClose}
      onSubmit={() => {
        editor.chain().focus().updateCitation(pos, { sourceId, pages: pages.trim() }).run()
        onClose()
      }}
      actions={
        <>
          {cancelButton(onClose)}
          <button type="submit" className="is-primary">
            Aceptar
          </button>
        </>
      }
    >
      <label className="writer-page-setup__field">
        <span>Fuente</span>
        <select aria-label="Fuente" value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
          {!source && <option value={sourceId}>{sourceId} (borrada)</option>}
          {sources.map((option) => (
            <option key={option.id} value={option.id}>
              {option.title || option.id}
            </option>
          ))}
        </select>
      </label>
      <label className="writer-page-setup__field">
        <span>Páginas</span>
        <span className="writer-page-setup__input">
          <input
            autoFocus
            aria-label="Páginas"
            placeholder="45 o 45-47"
            value={pages}
            onChange={(event) => setPages(event.target.value)}
          />
        </span>
      </label>
      <p className="writer-dialog__hint">Quedará así: {formatCitation(source, style, { pages }, sources)}</p>
    </WriterDialog>
  )
}
