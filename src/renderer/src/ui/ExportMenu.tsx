import { useEffect, useRef, useState } from 'react'
import { FileDown } from 'lucide-react'
import type { ExportOption } from '@/core/appModule'

/** Botón "Exportar" de la barra de acceso rápido con la lista de formatos disponibles. */
export function ExportMenu({ options }: { options: ExportOption[] }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Cerrar al hacer clic fuera o pulsar Escape, como cualquier menú desplegable.
  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className="export-menu" ref={containerRef}>
      <button
        type="button"
        className="quick-button"
        title="Exportar"
        aria-label="Exportar"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <FileDown size={16} />
      </button>
      {open && (
        <div className="export-menu__list" role="menu">
          <div className="export-menu__title">Exportar como</div>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              className="export-menu__item"
              onClick={() => {
                setOpen(false)
                option.run()
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
