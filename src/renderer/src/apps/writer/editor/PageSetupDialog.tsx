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
import { NumberField } from './NumberField'

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
              <NumberField
                unit="cm"
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
            <NumberField unit="cm" label="Ancho" value={shownSize.width} onChange={(cm) => setSize('width', cm)} />
            <NumberField unit="cm" label="Alto" value={shownSize.height} onChange={(cm) => setSize('height', cm)} />
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
