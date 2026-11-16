import { useState } from 'react'
import type { Editor } from '@tiptap/core'
import { Paintbrush, X } from 'lucide-react'
import { FONT_FAMILIES } from '@/ui/fonts'
import { selectionStyleProps } from '../model/documentEdits'
import { activeParagraphStyleId } from '../model/paragraphStyles'
import {
  customStyleId,
  findStyle,
  isBuiltInStyle,
  NORMAL_STYLE_ID,
  previewCss,
  resolveStyle,
  upsertStyle,
  type StyleAlign,
  type StyleProps,
  type StyleType,
  type WriterStyle
} from '../model/styles'
import { NumberField } from './NumberField'

interface StyleDialogProps {
  styles: WriterStyle[]
  /** Estilo a modificar; sin él, se crea uno nuevo a partir de la selección. */
  styleId?: string
  editor: Editor
  /** La lista ya cambiada y, si se acaba de crear, el estilo nuevo (para aplicarlo). */
  onSave(styles: WriterStyle[], created: WriterStyle | null): void
  onClose(): void
}

const ALIGN_OPTIONS: { value: StyleAlign; label: string }[] = [
  { value: 'left', label: 'Izquierda' },
  { value: 'center', label: 'Centrada' },
  { value: 'right', label: 'Derecha' },
  { value: 'justify', label: 'Justificada' }
]

/** Valores de tres estados: heredado del estilo base (undefined), sí o no. */
type Toggle = 'bold' | 'italic' | 'underline'
const TOGGLES: { prop: Toggle; label: string }[] = [
  { prop: 'bold', label: 'Negrita' },
  { prop: 'italic', label: 'Cursiva' },
  { prop: 'underline', label: 'Subrayado' }
]

/**
 * Modificar o crear un estilo. Como en PageSetupDialog, se trabaja sobre un borrador y nada cambia
 * hasta Aceptar. Los campos enseñan el valor EFECTIVO (lo heredado incluido), pero solo se guarda lo
 * que el usuario toca: así un estilo "basado en Normal" sigue los cambios de Normal en todo lo demás.
 */
export function StyleDialog({ styles, styleId, editor, onSave, onClose }: StyleDialogProps) {
  const existing = styleId ? findStyle(styles, styleId) : undefined
  const [draft, setDraft] = useState<WriterStyle>(() => existing ?? newStyleFromSelection(styles, editor))
  const isNew = !existing
  // El borrador entra en la lista para calcular la herencia y la vista previa con sus cambios.
  const preview = upsertStyle(styles, draft)
  const effective = resolveStyle(preview, draft.id)
  const paragraph = draft.type === 'paragraph'
  const setProp = <Key extends keyof StyleProps>(key: Key, value: StyleProps[Key]) =>
    setDraft((current) => ({ ...current, props: { ...current.props, [key]: value } }))
  // Basado en: cualquier estilo del mismo tipo que no acabe heredando de este (evita ciclos).
  const parents = styles.filter(
    (style) => style.type === draft.type && style.id !== draft.id && !inheritsFrom(styles, style.id, draft.id)
  )
  const nameTaken = styles.some((style) => style.id !== draft.id && style.name.trim() === draft.name.trim())
  const valid = draft.name.trim() !== '' && !nameTaken

  return (
    <div
      className="writer-comments writer-page-setup"
      role="dialog"
      aria-label={isNew ? 'Nuevo estilo' : 'Modificar estilo'}
    >
      <header className="writer-comments__header">
        <Paintbrush size={16} />
        <span>{isNew ? 'Nuevo estilo' : `Modificar "${existing.name}"`}</span>
        <button type="button" className="writer-comments__icon" title="Cerrar" aria-label="Cerrar" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <form
        className="writer-page-setup__body"
        onSubmit={(event) => {
          event.preventDefault()
          if (!valid) return
          const name = draft.name.trim()
          // El id de un estilo nuevo sale del nombre definitivo ("Nota" -> custom-nota), no del provisional.
          const saved = { ...draft, name, id: isNew ? customStyleId(name, styles) : draft.id }
          onSave(upsertStyle(styles, saved), isNew ? saved : null)
          onClose()
        }}
      >
        <fieldset>
          <legend>Propiedades</legend>
          <label className="writer-page-setup__field">
            <span>Nombre</span>
            <input
              aria-label="Nombre del estilo"
              value={draft.name}
              // Los integrados conservan su nombre: el .docx los reconoce por él.
              disabled={isBuiltInStyle(draft.id)}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          {nameTaken && <p className="writer-style-dialog__error">Ya hay un estilo con ese nombre.</p>}
          {isNew && (
            <label className="writer-page-setup__field">
              <span>Tipo</span>
              <select
                aria-label="Tipo de estilo"
                value={draft.type}
                onChange={(event) => {
                  const type = event.target.value as StyleType
                  setDraft((current) => ({
                    ...current,
                    type,
                    basedOn: type === 'paragraph' ? NORMAL_STYLE_ID : undefined
                  }))
                }}
              >
                <option value="paragraph">Párrafo</option>
                <option value="character">Carácter</option>
              </select>
            </label>
          )}
          {draft.id !== NORMAL_STYLE_ID && (
            <label className="writer-page-setup__field">
              <span>Basado en</span>
              <select
                aria-label="Basado en"
                value={draft.basedOn ?? (paragraph ? NORMAL_STYLE_ID : '')}
                onChange={(event) => setDraft((current) => ({ ...current, basedOn: event.target.value || undefined }))}
              >
                {!paragraph && <option value="">(ninguno)</option>}
                {parents.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {paragraph && (
            <label className="writer-page-setup__field">
              <span>Párrafo siguiente</span>
              <select
                aria-label="Estilo del párrafo siguiente"
                value={draft.next ?? draft.id}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    next: event.target.value === current.id ? undefined : event.target.value
                  }))
                }
              >
                {preview
                  .filter((style) => style.type === 'paragraph')
                  .map((style) => (
                    <option key={style.id} value={style.id}>
                      {style.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </fieldset>

        <fieldset>
          <legend>Fuente</legend>
          <select
            aria-label="Fuente del estilo"
            value={effective.fontFamily ?? ''}
            onChange={(event) => setProp('fontFamily', event.target.value)}
          >
            {!FONT_FAMILIES.some((font) => font.value === effective.fontFamily) && (
              <option value={effective.fontFamily ?? ''}>{effective.fontFamily ?? '(heredada)'}</option>
            )}
            {FONT_FAMILIES.map((font) => (
              <option key={font.value} value={font.value}>
                {font.label}
              </option>
            ))}
          </select>
          <div className="writer-page-setup__grid">
            <NumberField
              label="Tamaño"
              unit="pt"
              value={effective.fontSize ?? 12}
              onChange={(pt) => pt >= 1 && pt <= 400 && setProp('fontSize', pt)}
            />
            <label className="writer-page-setup__field">
              <span>Color</span>
              <input
                type="color"
                aria-label="Color del estilo"
                value={effective.color ?? '#111111'}
                onChange={(event) => setProp('color', event.target.value)}
              />
            </label>
          </div>
          {TOGGLES.map(({ prop, label }) => (
            <label key={prop} className="writer-page-setup__radio">
              <input
                type="checkbox"
                checked={!!effective[prop]}
                onChange={(event) => setProp(prop, event.target.checked)}
              />
              {label}
            </label>
          ))}
        </fieldset>

        {paragraph && (
          <fieldset>
            <legend>Párrafo</legend>
            <select
              aria-label="Alineación del estilo"
              value={effective.align ?? 'left'}
              onChange={(event) => setProp('align', event.target.value as StyleAlign)}
            >
              {ALIGN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="writer-page-setup__grid">
              <NumberField
                label="Espacio antes"
                unit="pt"
                value={effective.spaceBefore ?? 0}
                onChange={(pt) => pt >= 0 && setProp('spaceBefore', pt)}
              />
              <NumberField
                label="Espacio después"
                unit="pt"
                value={effective.spaceAfter ?? 0}
                onChange={(pt) => pt >= 0 && setProp('spaceAfter', pt)}
              />
              <NumberField
                label="Interlineado"
                unit="líneas"
                value={effective.lineHeight ?? 1}
                onChange={(lines) => lines > 0 && lines <= 5 && setProp('lineHeight', lines)}
              />
              <NumberField
                label="Primera línea"
                unit="cm"
                value={effective.firstLine ?? 0}
                onChange={(cm) => setProp('firstLine', cm)}
              />
              <NumberField
                label="Sangría izquierda"
                unit="cm"
                value={effective.indentLeft ?? 0}
                onChange={(cm) => cm >= 0 && setProp('indentLeft', cm)}
              />
              <NumberField
                label="Sangría derecha"
                unit="cm"
                value={effective.indentRight ?? 0}
                onChange={(cm) => cm >= 0 && setProp('indentRight', cm)}
              />
            </div>
          </fieldset>
        )}

        <div className="writer-style-dialog__preview" aria-label="Vista previa">
          <span style={previewCss(preview, draft.id)}>{draft.name || 'AaBbCc'}</span>
        </div>
        <div className="writer-page-setup__actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="is-primary" disabled={!valid}>
            Aceptar
          </button>
        </div>
      </form>
    </div>
  )
}

/**
 * "Nuevo estilo" en Word parte del párrafo del cursor: basado en su estilo y con el formato que
 * tenga puesto a mano. Así "doy formato a un párrafo y lo guardo como estilo" funciona en un paso.
 */
function newStyleFromSelection(styles: WriterStyle[], editor: Editor): WriterStyle {
  const name = uniqueName(styles, 'Estilo nuevo')
  return {
    id: customStyleId(name, styles),
    name,
    type: 'paragraph',
    basedOn: activeParagraphStyleId(editor) ?? NORMAL_STYLE_ID,
    quick: true,
    props: selectionStyleProps(editor)
  }
}

function uniqueName(styles: WriterStyle[], base: string): string {
  let name = base
  for (let suffix = 2; styles.some((style) => style.name === name); suffix++) name = `${base} ${suffix}`
  return name
}

/** ¿`id` hereda (directa o indirectamente) de `ancestor`? */
function inheritsFrom(styles: WriterStyle[], id: string, ancestor: string): boolean {
  const seen = new Set<string>()
  let current = findStyle(styles, id)
  while (current?.basedOn && !seen.has(current.id)) {
    if (current.basedOn === ancestor) return true
    seen.add(current.id)
    current = findStyle(styles, current.basedOn)
  }
  return false
}
