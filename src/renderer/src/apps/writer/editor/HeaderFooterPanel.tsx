import { AlignCenter, AlignLeft, AlignRight, PanelTop, X } from 'lucide-react'
import { PAGE_COUNT_TOKEN, PAGE_NUMBER_TOKEN, type HeaderFooter, type HeaderFooterAlign } from '../model/content'

interface HeaderFooterPanelProps {
  header?: HeaderFooter
  footer?: HeaderFooter
  onChange(part: 'header' | 'footer', value: HeaderFooter | undefined): void
  onClose(): void
}

const ALIGNS: { value: HeaderFooterAlign; label: string; Icon: typeof AlignLeft }[] = [
  { value: 'left', label: 'Izquierda', Icon: AlignLeft },
  { value: 'center', label: 'Centro', Icon: AlignCenter },
  { value: 'right', label: 'Derecha', Icon: AlignRight }
]

/**
 * Edición del encabezado y el pie. Son texto plano con marcadores ({página}, {páginas}): se ven
 * en cada hoja del editor, al imprimir, al exportar a PDF y en el .docx.
 */
export function HeaderFooterPanel({ header, footer, onChange, onClose }: HeaderFooterPanelProps) {
  return (
    <aside className="writer-comments writer-header-footer" aria-label="Encabezado y pie de página">
      <header className="writer-comments__header">
        <PanelTop size={16} />
        <span>Encabezado y pie</span>
        <button type="button" className="writer-comments__icon" title="Cerrar" aria-label="Cerrar" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="writer-header-footer__body">
        <PartEditor label="Encabezado" value={header} onChange={(value) => onChange('header', value)} />
        <PartEditor label="Pie de página" value={footer} onChange={(value) => onChange('footer', value)} />
        <p className="writer-header-footer__hint">
          {PAGE_NUMBER_TOKEN} se cambia por el número de la hoja y {PAGE_COUNT_TOKEN} por el total.
        </p>
      </div>
    </aside>
  )
}

function PartEditor({
  label,
  value,
  onChange
}: {
  label: string
  value?: HeaderFooter
  onChange(value: HeaderFooter | undefined): void
}) {
  const align = value?.align ?? (label === 'Encabezado' ? 'left' : 'center')
  // Un texto vacío quita la parte: el archivo no guarda encabezados vacíos.
  const update = (text: string, nextAlign = align) =>
    onChange(text.trim() === '' ? undefined : { text, align: nextAlign })
  const insert = (token: string) => update(`${value?.text ?? ''}${value?.text ? ' ' : ''}${token}`)

  return (
    <section className="writer-header-footer__part">
      <label>
        <span>{label}</span>
        <textarea rows={2} value={value?.text ?? ''} onChange={(event) => update(event.target.value)} />
      </label>
      <div className="writer-header-footer__tools">
        {ALIGNS.map(({ value: option, label: optionLabel, Icon }) => (
          <button
            key={option}
            type="button"
            className={`writer-comments__icon ${align === option ? 'is-active' : ''}`}
            title={`${label}: ${optionLabel.toLowerCase()}`}
            aria-label={`${label}: ${optionLabel.toLowerCase()}`}
            aria-pressed={align === option}
            disabled={!value}
            onClick={() => value && update(value.text, option)}
          >
            <Icon size={15} />
          </button>
        ))}
        <button type="button" className="writer-header-footer__token" onClick={() => insert(PAGE_NUMBER_TOKEN)}>
          + Nº de página
        </button>
        <button type="button" className="writer-header-footer__token" onClick={() => insert(PAGE_COUNT_TOKEN)}>
          + Total
        </button>
      </div>
    </section>
  )
}
