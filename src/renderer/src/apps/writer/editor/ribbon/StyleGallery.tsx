import { useEffect, useRef, useState } from 'react'
import { PanelRight } from 'lucide-react'
import { MenuItem } from '@/ui/Ribbon'
import { commandState, runCommand } from '../../model/commands'
import { previewCss } from '../../model/styles'
import { CommandButton } from './CommandButton'
import { useCommandContext } from './commandContext'

/**
 * Galería de estilos rápidos de Inicio. Cada tarjeta se pinta con el aspecto real del estilo
 * (sale de los mismos datos que el documento) y con clic derecho ofrece lo de Word: modificar,
 * actualizar para que coincida con la selección, crear uno nuevo o eliminarlo.
 */
export function StyleGallery() {
  const context = useCommandContext()
  const { styles } = context.ui
  const [menu, setMenu] = useState<{ styleId: string; x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMenu(null)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const menuAction = (action: () => void) => () => {
    action()
    setMenu(null)
  }

  return (
    <>
      <div className="style-gallery">
        {styles
          .filter((style) => style.quick)
          .map((style) => (
            <button
              key={style.id}
              type="button"
              className={`style-card ${commandState(context, 'applyStyle', style.id).active ? 'is-active' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runCommand(context, 'applyStyle', style.id)}
              onContextMenu={(event) => {
                event.preventDefault()
                setMenu({ styleId: style.id, x: event.clientX, y: event.clientY })
              }}
              title={style.name}
            >
              <span className="style-preview" style={previewCss(styles, style.id)}>
                AaBbCc
              </span>
              <span className="style-card__label">{style.name}</span>
            </button>
          ))}
      </div>
      <CommandButton command="toggleStylesPanel" icon={<PanelRight size={16} />} />
      {menu && (
        <div
          ref={menuRef}
          className="dropdown__menu style-gallery__menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <MenuItem onSelect={menuAction(() => runCommand(context, 'updateStyleFromSelection', menu.styleId))}>
            Actualizar para que coincida con la selección
          </MenuItem>
          <MenuItem onSelect={menuAction(() => runCommand(context, 'modifyStyle', menu.styleId))}>Modificar…</MenuItem>
          <MenuItem onSelect={menuAction(() => runCommand(context, 'newStyle'))}>Nuevo estilo…</MenuItem>
          <MenuItem
            disabled={!commandState(context, 'deleteStyle', menu.styleId).enabled}
            onSelect={menuAction(() => runCommand(context, 'deleteStyle', menu.styleId))}
          >
            Eliminar estilo
          </MenuItem>
        </div>
      )}
    </>
  )
}
