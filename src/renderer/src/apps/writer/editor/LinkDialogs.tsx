import { useState } from 'react'
import type { Editor } from '@tiptap/core'
import { Bookmark as BookmarkIcon, Link2 } from 'lucide-react'
import {
  bookmarkHref,
  bookmarkOfHref,
  isValidBookmarkName,
  listBookmarks,
  normalizeHref,
  suggestBookmarkName,
  uniqueBookmarkName
} from '../model/links'
import { WriterDialog } from './WriterDialog'

type LinkTarget = 'web' | 'bookmark'

/** Lo que hay en la selección al abrir el cuadro: el texto y, si ya es un vínculo, su destino. */
function currentLink(editor: Editor): { text: string; href: string | null } {
  if (editor.isActive('link')) {
    // El vínculo entero, aunque el cursor esté solo dentro.
    editor.chain().extendMarkRange('link').run()
  }
  const { from, to } = editor.state.selection
  const href = (editor.getAttributes('link').href as string | undefined) ?? null
  return { text: editor.state.doc.textBetween(from, to, ' '), href }
}

/** Insertar > Vínculo (Ctrl/Cmd+K): a una web, a un correo o a un marcador del documento. */
export function LinkDialog({ editor, onClose }: { editor: Editor; onClose(): void }) {
  // Se lee una vez al abrir: luego el cuadro trabaja sobre su borrador.
  const [initial] = useState(() => currentLink(editor))
  const [bookmarks] = useState(() => listBookmarks(editor.getJSON()))
  const initialBookmark = bookmarkOfHref(initial.href)
  const [text, setText] = useState(initial.text)
  const [target, setTarget] = useState<LinkTarget>(initialBookmark ? 'bookmark' : 'web')
  const [address, setAddress] = useState(initialBookmark ? '' : (initial.href ?? ''))
  const [bookmark, setBookmark] = useState(initialBookmark ?? bookmarks[0] ?? '')

  const href = target === 'web' ? normalizeHref(address) : bookmark ? bookmarkHref(bookmark) : null
  const shownText = text.trim() || (target === 'web' ? address.trim() : bookmark)

  const apply = () => {
    if (!href) return
    const chain = editor.chain().focus()
    // Si el texto es el mismo, solo se cambia el destino y se conserva el formato de dentro.
    if (shownText === initial.text && initial.text !== '') chain.setLink({ href })
    else
      chain
        .insertContent({ type: 'text', text: shownText, marks: [{ type: 'link', attrs: { href } }] })
        .unsetMark('link')
    chain.run()
    onClose()
  }

  return (
    <WriterDialog
      title={initial.href ? 'Modificar vínculo' : 'Insertar vínculo'}
      icon={<Link2 size={16} />}
      onClose={onClose}
      onSubmit={apply}
      actions={
        <>
          {initial.href && (
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().extendMarkRange('link').unsetLink().run()
                onClose()
              }}
            >
              Quitar vínculo
            </button>
          )}
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="is-primary" disabled={!href}>
            Aceptar
          </button>
        </>
      }
    >
      <label className="writer-page-setup__field">
        <span>Texto que se mostrará</span>
        <span className="writer-page-setup__input">
          <input value={text} onChange={(event) => setText(event.target.value)} />
        </span>
      </label>
      <fieldset>
        <legend>Vincular a</legend>
        <label className="writer-page-setup__radio">
          <input type="radio" name="link-target" checked={target === 'web'} onChange={() => setTarget('web')} />
          Página web o correo
        </label>
        <label className="writer-page-setup__radio">
          <input
            type="radio"
            name="link-target"
            checked={target === 'bookmark'}
            disabled={bookmarks.length === 0}
            onChange={() => setTarget('bookmark')}
          />
          Marcador de este documento
        </label>
        {target === 'web' ? (
          <label className="writer-page-setup__field">
            <span>Dirección</span>
            <span className="writer-page-setup__input">
              <input
                autoFocus
                placeholder="https://… o nombre@correo.es"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            </span>
          </label>
        ) : (
          <select aria-label="Marcador" value={bookmark} onChange={(event) => setBookmark(event.target.value)}>
            {bookmarks.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
      </fieldset>
      <p className="writer-dialog__hint">Ctrl/Cmd+clic en un vínculo lo sigue.</p>
    </WriterDialog>
  )
}

/** Insertar > Marcador: poner uno donde está el cursor, ir a uno o borrarlo. */
export function BookmarkDialog({ editor, onClose }: { editor: Editor; onClose(): void }) {
  const [bookmarks, setBookmarks] = useState(() => listBookmarks(editor.getJSON()))
  const [name, setName] = useState(() => {
    const { from, to } = editor.state.selection
    return uniqueBookmarkName(suggestBookmarkName(editor.state.doc.textBetween(from, to, ' ')), bookmarks)
  })
  const valid = isValidBookmarkName(name)
  const refresh = () => setBookmarks(listBookmarks(editor.getJSON()))

  return (
    <WriterDialog
      title="Marcador"
      icon={<BookmarkIcon size={16} />}
      onClose={onClose}
      onSubmit={() => {
        if (!valid) return
        editor.chain().focus().setBookmark(name).run()
        onClose()
      }}
      actions={
        <>
          <button type="button" onClick={onClose}>
            Cerrar
          </button>
          <button type="submit" className="is-primary" disabled={!valid}>
            {bookmarks.includes(name) ? 'Mover aquí' : 'Agregar'}
          </button>
        </>
      }
    >
      <label className="writer-page-setup__field">
        <span>Nombre del marcador</span>
        <span className="writer-page-setup__input">
          <input autoFocus aria-invalid={!valid} value={name} onChange={(event) => setName(event.target.value)} />
        </span>
      </label>
      {!valid && (
        <p className="writer-dialog__hint writer-dialog__hint--error">
          Empieza por una letra y usa solo letras, números y guion bajo (sin espacios).
        </p>
      )}
      {bookmarks.length > 0 && (
        <ul className="writer-bookmark-list" aria-label="Marcadores del documento">
          {bookmarks.map((existing) => (
            <li key={existing}>
              <span>{existing}</span>
              <button type="button" onClick={() => editor.commands.goToBookmark(existing)}>
                Ir a
              </button>
              <button
                type="button"
                onClick={() => {
                  editor.commands.removeBookmark(existing)
                  refresh()
                }}
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}
    </WriterDialog>
  )
}
