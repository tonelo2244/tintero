import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent as ReactMouseEvent
} from 'react'
import { ChevronDown } from 'lucide-react'

/** Grupo de controles con etiqueta inferior ("Fuente", "Párrafo", ...). */
export function RibbonGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="ribbon-group">
      <div className="ribbon-group__content">{children}</div>
      {label && <div className="ribbon-group__label">{label}</div>}
    </div>
  )
}

export function RibbonRow({ children }: { children: ReactNode }) {
  return <div className="ribbon-row">{children}</div>
}

interface ToolButtonProps {
  label: string
  onClick(): void
  active?: boolean
  disabled?: boolean
  /** Botón grande con icono arriba y texto debajo (p. ej. "Nueva diapositiva"). */
  large?: boolean
  showLabel?: boolean
  children: ReactNode
}

export function ToolButton({ label, onClick, active, disabled, large, showLabel, children }: ToolButtonProps) {
  // onMouseDown + preventDefault evita que el botón robe el foco al editor
  // (si no, se perdería la selección de texto al pulsar "Negrita").
  const keepFocus = (event: ReactMouseEvent) => event.preventDefault()
  return (
    <button
      type="button"
      className={`tool-button ${large ? 'tool-button--large' : ''} ${active ? 'is-active' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={keepFocus}
      onClick={onClick}
    >
      {children}
      {(large || showLabel) && <span className="tool-button__label">{label}</span>}
    </button>
  )
}

interface DropdownProps {
  label: string
  /** Contenido del botón que abre el menú. */
  trigger: ReactNode
  large?: boolean
  showLabel?: boolean
  disabled?: boolean
  children: (close: () => void) => ReactNode
}

/** Botón con menú desplegable. Se cierra al hacer clic fuera o pulsar Escape. */
export function Dropdown({ label, trigger, large, showLabel, disabled, children }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="dropdown" ref={rootRef}>
      <button
        type="button"
        className={`tool-button ${large ? 'tool-button--large' : ''} ${open ? 'is-active' : ''}`}
        title={label}
        aria-label={label}
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
        {(large || showLabel) && <span className="tool-button__label">{label}</span>}
        <ChevronDown size={10} className="dropdown__chevron" />
      </button>
      {open && (
        <div className="dropdown__menu" onMouseDown={(event) => event.preventDefault()}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function MenuItem({ onSelect, children }: { onSelect(): void; children: ReactNode }) {
  return (
    <button type="button" className="menu-item" onClick={onSelect}>
      {children}
    </button>
  )
}

interface SelectFieldProps {
  label: string
  value: string
  options: { label: string; value: string }[]
  onChange(value: string): void
  width?: number
  disabled?: boolean
}

export function SelectField({ label, value, options, onChange, width = 140, disabled }: SelectFieldProps) {
  const known = options.some((option) => option.value === value)
  return (
    <select
      className="select-field"
      style={{ width }}
      aria-label={label}
      title={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {!known && <option value={value}>{value || '—'}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
