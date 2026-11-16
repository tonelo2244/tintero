import { useState } from 'react'
import { Settings2, X } from 'lucide-react'
import {
  orientedSize,
  paperSizeOf,
  PAPER_SIZES,
  withMargins,
  withOrientation,
  withPaperSize,
  type PageMargins,
  type PageOrientation,
  type PageSetup
} from '../model/pageSetup'

interface PageSetupDialogProps {
  pageSetup: PageSetup
  onApply(setup: PageSetup): void
  onClose(): void
}

const MARGIN_FIELDS: { side: keyof PageMargins; label: string }[] = [
  { side: 'top', label: 'Superior' },
  { side: 'bottom', label: 'Inferior' },
  { side: 'left', label: 'Izquierdo' },
  { side: 'right', label: 'Derecho' }
]

const CUSTOM = 'custom'

/**
 * Márgenes y tamaño personalizados. Trabaja sobre un borrador: nada cambia en el documento hasta
 * pulsar Aplicar, y las mismas funciones de model/pageSetup.ts deciden qué valores son válidos.
 */
export function PageSetupDialog({ pageSetup, onApply, onClose }: PageSetupDialogProps) {
  const [draft, setDraft] = useState(pageSetup)
  const paperId = paperSizeOf(draft)?.id ?? CUSTOM

  const choosePaper = (id: string) => {
    const paper = PAPER_SIZES.find((candidate) => candidate.id === id)
    if (paper) setDraft((current) => withPaperSize(current, paper))
  }
  const setSize = (dimension: 'width' | 'height', cm: number) => {
    // Los campos enseñan la hoja ya girada; el modelo la guarda en vertical.
    const shown = { ...orientedSize(draft), [dimension]: cm }
    const portrait = draft.orientation === 'landscape' ? { width: shown.height, height: shown.width } : shown
    setDraft((current) => withPaperSize(current, portrait))
  }
  const shownSize = orientedSize(draft)

  return (
    <div className="writer-comments writer-page-setup" role="dialog" aria-label="Configurar página">
      <header className="writer-comments__header">
        <Settings2 size={16} />
        <span>Configurar página</span>
        <button type="button" className="writer-comments__icon" title="Cerrar" aria-label="Cerrar" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <form
        className="writer-page-setup__body"
        onSubmit={(event) => {
          event.preventDefault()
          onApply(withMargins(draft, draft.margins))
          onClose()
        }}
      >
        <fieldset>
          <legend>Márgenes</legend>
          <div className="writer-page-setup__grid">
            {MARGIN_FIELDS.map(({ side, label }) => (
              <CmField
                key={side}
                label={label}
                value={draft.margins[side]}
                onChange={(cm) => setDraft((current) => ({ ...current, margins: { ...current.margins, [side]: cm } }))}
              />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Orientación</legend>
          {(['portrait', 'landscape'] as PageOrientation[]).map((orientation) => (
            <label key={orientation} className="writer-page-setup__radio">
              <input
                type="radio"
                name="orientation"
                checked={draft.orientation === orientation}
                onChange={() => setDraft((current) => withOrientation(current, orientation))}
              />
              {orientation === 'portrait' ? 'Vertical' : 'Horizontal'}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Papel</legend>
          <select aria-label="Tamaño del papel" value={paperId} onChange={(event) => choosePaper(event.target.value)}>
            {PAPER_SIZES.map((paper) => (
              <option key={paper.id} value={paper.id}>
                {paper.label}
              </option>
            ))}
            <option value={CUSTOM} disabled>
              Personalizado
            </option>
          </select>
          <div className="writer-page-setup__grid">
            <CmField label="Ancho" value={shownSize.width} onChange={(cm) => setSize('width', cm)} />
            <CmField label="Alto" value={shownSize.height} onChange={(cm) => setSize('height', cm)} />
          </div>
        </fieldset>
        <div className="writer-page-setup__actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="is-primary">
            Aplicar
          </button>
        </div>
      </form>
    </div>
  )
}

/**
 * Campo numérico en centímetros. Guarda el texto que se escribe y solo avisa de valores válidos:
 * así se puede borrar el campo para escribir otro número sin que salte a 0.
 */
function CmField({ label, value, onChange }: { label: string; value: number; onChange(cm: number): void }) {
  const [text, setText] = useState<string | null>(null)
  return (
    <label className="writer-page-setup__field">
      <span>{label}</span>
      <span className="writer-page-setup__input">
        <input
          type="text"
          inputMode="decimal"
          aria-label={`${label} (cm)`}
          value={text ?? value.toLocaleString('es-ES')}
          onChange={(event) => {
            setText(event.target.value)
            const cm = Number(event.target.value.replace(',', '.'))
            if (event.target.value.trim() !== '' && Number.isFinite(cm)) onChange(cm)
          }}
          onBlur={() => setText(null)}
        />
        cm
      </span>
    </label>
  )
}
