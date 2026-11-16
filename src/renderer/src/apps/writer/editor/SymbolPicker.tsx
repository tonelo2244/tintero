import { useMemo, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { Omega, Search } from 'lucide-react'
import { Dropdown, MenuItem } from '@/ui/Ribbon'
import { runCommand } from '../model/commands'
import { searchSymbols, SYMBOL_GROUPS, symbolName, withRecentSymbol } from '../model/symbols'
import { useCommandContext } from './ribbon/commandContext'
import { WriterDialog } from './WriterDialog'

const RECENT_KEY = 'tintero.writer.recentSymbols'

/** Los usados recientemente son de la persona, no del documento: van en el almacén del navegador. */
function loadRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((char): char is string => typeof char === 'string') : []
  } catch {
    return []
  }
}

function rememberSymbol(char: string): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(withRecentSymbol(loadRecent(), char)))
  } catch {
    // Sin almacén (modo privado): simplemente no hay recientes.
  }
}

/** Inserta el símbolo con el comando del registro y lo apunta en recientes. */
function useInsertSymbol() {
  const context = useCommandContext()
  return (char: string) => {
    runCommand(context, 'insertSymbol', char)
    rememberSymbol(char)
  }
}

function SymbolGrid({ chars, onPick }: { chars: string[]; onPick(char: string): void }) {
  return (
    <div className="writer-symbol-grid">
      {chars.map((char) => (
        <button
          key={char}
          type="button"
          className="writer-symbol-grid__cell"
          title={symbolName(char)}
          aria-label={`Símbolo ${symbolName(char)}`}
          onClick={() => onPick(char)}
        >
          {char === ' ' ? '⍽' : char}
        </button>
      ))}
    </div>
  )
}

/** Insertar > Símbolo: los recientes y los más usados; "Más símbolos…" abre el cuadro con búsqueda. */
export function SymbolDropdown() {
  const context = useCommandContext()
  const insert = useInsertSymbol()
  return (
    <Dropdown label="Símbolo" large trigger={<Omega size={22} />}>
      {(close) => {
        const recent = loadRecent()
        const common = SYMBOL_GROUPS[0].symbols.map((entry) => entry.char)
        const shown = [...recent, ...common.filter((char) => !recent.includes(char))].slice(0, 20)
        return (
          <div className="writer-symbol-menu">
            <SymbolGrid
              chars={shown}
              onPick={(char) => {
                insert(char)
                close()
              }}
            />
            <MenuItem
              onSelect={() => {
                close()
                runCommand(context, 'symbolDialog')
              }}
            >
              <span className="menu-item__check" aria-hidden />
              Más símbolos…
            </MenuItem>
          </div>
        )
      }}
    </Dropdown>
  )
}

/** Cuadro de símbolos: búsqueda por nombre ("raiz", "flecha") y todos los grupos. Se queda abierto. */
export function SymbolDialog({ editor, onClose }: { editor: Editor; onClose(): void }) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => (query.trim() ? searchSymbols(query) : null), [query])
  const pick = (char: string) => {
    editor.chain().focus().insertContent({ type: 'text', text: char }).run()
    rememberSymbol(char)
  }
  return (
    <WriterDialog title="Símbolo" icon={<Omega size={16} />} onClose={onClose} className="writer-symbol-dialog">
      <label className="writer-page-setup__input">
        <Search size={14} />
        <input
          autoFocus
          aria-label="Buscar símbolo"
          placeholder="Buscar: flecha, euro, raíz…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="writer-symbol-dialog__list">
        {results ? (
          results.length > 0 ? (
            <SymbolGrid chars={results.map((entry) => entry.char)} onPick={pick} />
          ) : (
            <p className="writer-dialog__hint">No hay ningún símbolo con ese nombre.</p>
          )
        ) : (
          SYMBOL_GROUPS.map((group) => (
            <section key={group.label}>
              <h4>{group.label}</h4>
              <SymbolGrid chars={group.symbols.map((entry) => entry.char)} onPick={pick} />
            </section>
          ))
        )}
      </div>
    </WriterDialog>
  )
}
