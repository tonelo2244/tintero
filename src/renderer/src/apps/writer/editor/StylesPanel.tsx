import { Paintbrush, Pencil, Plus, Trash2, X } from 'lucide-react'
import { commandState, runCommand } from '../model/commands'
import { isBuiltInStyle, previewCss } from '../model/styles'
import { useCommandContext } from './ribbon/commandContext'

/**
 * Panel de estilos: todos los del documento (la galería de Inicio solo enseña los rápidos), con el
 * que tiene el cursor marcado. Todo pasa por el registro de comandos, igual que la cinta.
 */
export function StylesPanel({ onClose }: { onClose(): void }) {
  const context = useCommandContext()
  const { styles, numberedHeadings } = context.ui

  return (
    <aside className="writer-comments writer-styles-panel" aria-label="Estilos">
      <header className="writer-comments__header">
        <Paintbrush size={16} />
        <span>Estilos</span>
        <button type="button" className="writer-comments__icon" title="Cerrar" aria-label="Cerrar" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <ul className="writer-styles-panel__list">
        {styles.map((style) => {
          const active = commandState(context, 'applyStyle', style.id).active
          return (
            <li key={style.id} className={`writer-styles-panel__item ${active ? 'is-active' : ''}`}>
              <button
                type="button"
                className="writer-styles-panel__apply"
                aria-pressed={active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => runCommand(context, 'applyStyle', style.id)}
              >
                <span style={previewCss(styles, style.id)}>{style.name}</span>
                <small>{style.type === 'character' ? 'a' : '¶'}</small>
              </button>
              <button
                type="button"
                className="writer-comments__icon"
                title={`Modificar ${style.name}`}
                aria-label={`Modificar ${style.name}`}
                onClick={() => runCommand(context, 'modifyStyle', style.id)}
              >
                <Pencil size={14} />
              </button>
              {!isBuiltInStyle(style.id) && (
                <button
                  type="button"
                  className="writer-comments__icon"
                  title={`Eliminar ${style.name}`}
                  aria-label={`Eliminar ${style.name}`}
                  onClick={() => runCommand(context, 'deleteStyle', style.id)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <footer className="writer-styles-panel__footer">
        <label>
          <input type="checkbox" checked={numberedHeadings} onChange={() => runCommand(context, 'numberedHeadings')} />
          Numerar los títulos (1, 1.1, 1.1.1)
        </label>
        <button type="button" onClick={() => runCommand(context, 'newStyle')}>
          <Plus size={14} /> Nuevo estilo
        </button>
      </footer>
    </aside>
  )
}
