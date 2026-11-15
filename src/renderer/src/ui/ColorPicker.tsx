import type { ReactNode } from 'react'
import { Dropdown } from './Ribbon'

const PALETTE = [
  '#000000',
  '#434343',
  '#666666',
  '#999999',
  '#cccccc',
  '#ffffff',
  '#c0392b',
  '#e67e22',
  '#f1c40f',
  '#27ae60',
  '#2980b9',
  '#8e44ad',
  '#f5b7b1',
  '#fad7a0',
  '#fcf3cf',
  '#abebc6',
  '#aed6f1',
  '#d2b4de',
  '#7b241c',
  '#9c640c',
  '#9a7d0a',
  '#196f3d',
  '#1a5276',
  '#4a235a'
]

interface ColorPickerProps {
  label: string
  icon: ReactNode
  /** Color actual; se pinta como barra bajo el icono. */
  value: string | null
  onChange(color: string): void
  onClear(): void
  clearLabel: string
  disabled?: boolean
}

export function ColorPicker({ label, icon, value, onChange, onClear, clearLabel, disabled }: ColorPickerProps) {
  return (
    <Dropdown
      label={label}
      disabled={disabled}
      trigger={
        <span className="color-trigger">
          {icon}
          <span className="color-trigger__bar" style={{ background: value ?? 'transparent' }} />
        </span>
      }
    >
      {(close) => (
        <div className="color-picker">
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              onClear()
              close()
            }}
          >
            {clearLabel}
          </button>
          <div className="color-picker__grid">
            {PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                className="color-picker__swatch"
                style={{ background: color }}
                title={color}
                aria-label={color}
                onClick={() => {
                  onChange(color)
                  close()
                }}
              />
            ))}
          </div>
          <label className="color-picker__custom">
            Personalizado
            <input type="color" defaultValue={value ?? '#000000'} onChange={(event) => onChange(event.target.value)} />
          </label>
        </div>
      )}
    </Dropdown>
  )
}
