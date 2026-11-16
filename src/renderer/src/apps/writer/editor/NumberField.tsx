import { useState } from 'react'

interface NumberFieldProps {
  label: string
  value: number
  /** Unidad que se enseña detrás del campo ("cm", "pt"). */
  unit: string
  onChange(value: number): void
  /**
   * `false`: avisa solo al salir del campo o pulsar Intro. Lo usa la cinta, donde cada cambio
   * devuelve el foco al documento y no se podría seguir escribiendo.
   */
  live?: boolean
}

/**
 * Campo numérico con unidad (Configurar página, estilos, párrafo). Guarda el texto que se escribe y
 * solo avisa de valores válidos: así se puede borrar el campo para escribir otro número sin que
 * salte a 0. Acepta coma decimal, como el resto de la interfaz.
 */
export function NumberField({ label, value, unit, onChange, live = true }: NumberFieldProps) {
  const [text, setText] = useState<string | null>(null)
  const commit = (raw: string) => {
    const parsed = Number(raw.replace(',', '.'))
    if (raw.trim() !== '' && Number.isFinite(parsed)) onChange(parsed)
  }
  return (
    <label className="writer-page-setup__field">
      <span>{label}</span>
      <span className="writer-page-setup__input">
        <input
          type="text"
          inputMode="decimal"
          aria-label={`${label} (${unit})`}
          value={text ?? value.toLocaleString('es-ES')}
          onChange={(event) => {
            setText(event.target.value)
            if (live) commit(event.target.value)
          }}
          onKeyDown={(event) => {
            if (!live && event.key === 'Enter') {
              event.preventDefault()
              commit(event.currentTarget.value)
              setText(null)
            }
          }}
          onBlur={(event) => {
            if (!live && text !== null) commit(event.target.value)
            setText(null)
          }}
        />
        {unit}
      </span>
    </label>
  )
}
