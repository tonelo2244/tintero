import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import { CaseSensitive, ChevronDown, ChevronUp, Replace, ReplaceAll, WholeWord, X } from 'lucide-react'
import { matchIndexAt } from '../model/search'
import { getSearchState } from './SearchAndReplace'

export type FindMode = 'find' | 'replace'

interface FindReplaceBarProps {
  editor: Editor
  mode: FindMode
  /** Cambia cada vez que se pide abrir la barra (Cmd/Ctrl+F otra vez), para volver a enfocar la caja. */
  openRequest: number
  onClose(): void
}

/**
 * Barra flotante de buscar y reemplazar. Solo guarda lo que escribe el usuario; buscar,
 * resaltar y reemplazar lo hacen los comandos de la extensión SearchAndReplace.
 */
export function FindReplaceBar({ editor, mode, openRequest, onClose }: FindReplaceBarProps) {
  const [query, setQuery] = useState(() => initialQuery(editor))
  const [replacement, setReplacement] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [showReplace, setShowReplace] = useState(mode === 'replace')
  const queryRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)

  const counter = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const search = getSearchState(current.state)
      const matches = search?.matches ?? []
      return { total: matches.length, current: matchIndexAt(matches, current.state.selection) }
    }
  })

  // Cada cambio en la caja o en las opciones vuelve a buscar.
  useEffect(() => {
    editor.commands.setSearch(query, { matchCase, wholeWord })
  }, [editor, query, matchCase, wholeWord])

  // Al cerrar la barra se apaga el resaltado.
  useEffect(() => () => void editor.commands.setSearch(''), [editor])

  useEffect(() => {
    if (mode === 'replace') setShowReplace(true)
    const input = mode === 'replace' && query ? replaceRef.current : queryRef.current
    input?.focus()
    input?.select()
    // Solo al abrir (o volver a pedir abrir), no en cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, openRequest])

  const close = () => {
    onClose()
    editor.commands.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, onEnter: () => void) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      onEnter()
    }
  }

  const goTo = (direction: 1 | -1) => editor.commands.goToMatch(direction)
  const total = counter?.total ?? 0
  const status = !query
    ? ''
    : total === 0
      ? 'Sin resultados'
      : counter && counter.current >= 0
        ? `${counter.current + 1} de ${total}`
        : `${total} ${total === 1 ? 'resultado' : 'resultados'}`

  return (
    <div className="find-bar" role="search" aria-label="Buscar y reemplazar">
      <div className="find-bar__row">
        <button
          type="button"
          className="find-bar__icon"
          title={showReplace ? 'Ocultar reemplazar' : 'Mostrar reemplazar'}
          aria-label={showReplace ? 'Ocultar reemplazar' : 'Mostrar reemplazar'}
          aria-expanded={showReplace}
          onClick={() => setShowReplace((value) => !value)}
        >
          <ChevronDown size={14} className={showReplace ? '' : 'is-collapsed'} />
        </button>
        <input
          ref={queryRef}
          className="find-bar__input"
          aria-label="Buscar"
          placeholder="Buscar"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => onKeyDown(event, () => goTo(event.shiftKey ? -1 : 1))}
        />
        <span className={`find-bar__status ${query && total === 0 ? 'is-empty' : ''}`} aria-live="polite">
          {status}
        </span>
        <button
          type="button"
          className={`find-bar__icon ${matchCase ? 'is-active' : ''}`}
          title="Coincidir mayúsculas y minúsculas"
          aria-label="Coincidir mayúsculas y minúsculas"
          aria-pressed={matchCase}
          onClick={() => setMatchCase((value) => !value)}
        >
          <CaseSensitive size={16} />
        </button>
        <button
          type="button"
          className={`find-bar__icon ${wholeWord ? 'is-active' : ''}`}
          title="Solo palabras completas"
          aria-label="Solo palabras completas"
          aria-pressed={wholeWord}
          onClick={() => setWholeWord((value) => !value)}
        >
          <WholeWord size={16} />
        </button>
        <button
          type="button"
          className="find-bar__icon"
          title="Anterior (Mayús+Intro)"
          aria-label="Anterior"
          disabled={total === 0}
          onClick={() => goTo(-1)}
        >
          <ChevronUp size={16} />
        </button>
        <button
          type="button"
          className="find-bar__icon"
          title="Siguiente (Intro)"
          aria-label="Siguiente"
          disabled={total === 0}
          onClick={() => goTo(1)}
        >
          <ChevronDown size={16} />
        </button>
        <button type="button" className="find-bar__icon" title="Cerrar (Esc)" aria-label="Cerrar" onClick={close}>
          <X size={16} />
        </button>
      </div>
      {showReplace && (
        <div className="find-bar__row find-bar__row--replace">
          <input
            ref={replaceRef}
            className="find-bar__input"
            aria-label="Reemplazar con"
            placeholder="Reemplazar con"
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            onKeyDown={(event) => onKeyDown(event, () => editor.commands.replaceMatch(replacement))}
          />
          <button
            type="button"
            className="find-bar__action"
            title="Reemplazar"
            disabled={total === 0}
            onClick={() => editor.commands.replaceMatch(replacement)}
          >
            <Replace size={14} /> Reemplazar
          </button>
          <button
            type="button"
            className="find-bar__action"
            title="Reemplazar todo"
            disabled={total === 0}
            onClick={() => editor.commands.replaceAllMatches(replacement)}
          >
            <ReplaceAll size={14} /> Todo
          </button>
        </div>
      )}
    </div>
  )
}

/** Si hay una palabra o frase corta seleccionada, se busca esa (como en Word). */
function initialQuery(editor: Editor): string {
  const { from, to } = editor.state.selection
  const selected = editor.state.doc.textBetween(from, to, '\n')
  return selected.length > 0 && selected.length <= 100 && !selected.includes('\n') ? selected : ''
}
