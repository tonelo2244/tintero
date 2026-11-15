import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { createId } from '@/core/ids'
import { rangeAddress } from '../../model/address'
import { conditionalStyler } from '../../model/conditional'
import { parseNumberText } from '../../model/input'
import type { CellRange, CellValue, ConditionalFormat, ConditionalRule, Sheet } from '../../model/types'
import type { WorkbookAction } from '../../model/workbookReducer'

export type ConditionalKind = ConditionalRule['kind']

/** Los mismos estilos predefinidos que ofrece Excel en "Resaltar reglas de celdas". */
const PRESETS: { label: string; style: NonNullable<ConditionalFormat['style']> }[] = [
  { label: 'Relleno rojo claro con texto rojo oscuro', style: { fill: '#ffc7ce', color: '#9c0006' } },
  { label: 'Relleno amarillo con texto amarillo oscuro', style: { fill: '#ffeb9c', color: '#9c5700' } },
  { label: 'Relleno verde con texto verde oscuro', style: { fill: '#c6efce', color: '#006100' } },
  { label: 'Texto en negrita', style: { bold: true } }
]

const SCALES: Record<string, { minColor: string; maxColor: string }> = {
  'blanco-verde': { minColor: '#ffffff', maxColor: '#63be7b' },
  'rojo-verde': { minColor: '#f8696b', maxColor: '#63be7b' },
  'verde-rojo': { minColor: '#63be7b', maxColor: '#f8696b' }
}

const TITLES: Record<ConditionalKind, string> = {
  greaterThan: 'Es mayor que',
  lessThan: 'Es menor que',
  between: 'Entre',
  textContains: 'Texto que contiene',
  colorScale: 'Escala de color'
}

interface Options {
  sheet: Sheet
  range: CellRange
  valueAt(address: string): CellValue
  apply(action: WorkbookAction): void
  focusGrid(): void
}

/** Formato condicional: el cuadro para crear una regla y el "pintor" que usa la cuadrícula. */
export function useConditionalFormats({ sheet, range, valueAt, apply, focusGrid }: Options) {
  const [dialog, setDialog] = useState<{ kind: ConditionalKind; range: CellRange } | null>(null)
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [preset, setPreset] = useState(0)
  const [scale, setScale] = useState('blanco-verde')

  const styler = useMemo(() => conditionalStyler(sheet, valueAt), [sheet, valueAt])

  const close = () => {
    setDialog(null)
    focusGrid()
  }

  const ruleFromInputs = (kind: ConditionalKind): ConditionalRule | string => {
    if (kind === 'colorScale') return { kind, ...SCALES[scale] }
    if (kind === 'textContains')
      return first.trim() === '' ? 'Escribe el texto que debe contener.' : { kind, text: first.trim() }
    const a = parseNumberText(first)
    if (a === null) return 'Escribe un número.'
    if (kind !== 'between') return { kind, value: a }
    const b = parseNumberText(second)
    return b === null ? 'Escribe los dos números.' : { kind, min: a, max: b }
  }

  const rule = dialog ? ruleFromInputs(dialog.kind) : null
  const overlay = dialog && (
    <div
      className="sheet-popover sheet-sort-dialog"
      role="dialog"
      aria-label={`Formato condicional: ${TITLES[dialog.kind]}`}
    >
      <div className="sheet-popover__header">
        <b>
          {TITLES[dialog.kind]} · {rangeAddress(dialog.range)}
        </b>
        <button type="button" className="find-bar__icon" aria-label="Cerrar" onClick={close}>
          <X size={16} />
        </button>
      </div>
      {dialog.kind === 'colorScale' ? (
        <div className="sheet-sort-dialog__row">
          <span>Colores</span>
          <select aria-label="Colores de la escala" value={scale} onChange={(event) => setScale(event.target.value)}>
            <option value="blanco-verde">Blanco → verde</option>
            <option value="rojo-verde">Rojo → verde (más es mejor)</option>
            <option value="verde-rojo">Verde → rojo (menos es mejor)</option>
          </select>
        </div>
      ) : (
        <>
          <div className="sheet-sort-dialog__row">
            <span>{dialog.kind === 'textContains' ? 'Texto' : dialog.kind === 'between' ? 'Desde' : 'Valor'}</span>
            <input
              className="sheet-popover__input"
              aria-label={dialog.kind === 'textContains' ? 'Texto' : 'Valor'}
              autoFocus
              value={first}
              onChange={(event) => setFirst(event.target.value)}
            />
          </div>
          {dialog.kind === 'between' && (
            <div className="sheet-sort-dialog__row">
              <span>Hasta</span>
              <input
                className="sheet-popover__input"
                aria-label="Hasta"
                value={second}
                onChange={(event) => setSecond(event.target.value)}
              />
            </div>
          )}
          <div className="sheet-sort-dialog__row">
            <span>con</span>
            <select aria-label="Formato" value={preset} onChange={(event) => setPreset(Number(event.target.value))}>
              {PRESETS.map((option, index) => (
                <option key={option.label} value={index}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      {typeof rule === 'string' && (first !== '' || second !== '') && <p className="sheet-popover__error">{rule}</p>}
      <div className="sheet-popover__actions">
        <button type="button" className="sheet-popover__button" onClick={close}>
          Cancelar
        </button>
        <button
          type="button"
          className="sheet-popover__button is-primary"
          disabled={typeof rule === 'string'}
          onClick={() => {
            if (!rule || typeof rule === 'string') return
            apply({
              type: 'conditional/add',
              sheetId: sheet.id,
              format: {
                id: createId('rule'),
                range: dialog.range,
                rule,
                ...(rule.kind === 'colorScale' ? {} : { style: PRESETS[preset].style })
              }
            })
            close()
          }}
        >
          Aceptar
        </button>
      </div>
    </div>
  )

  return {
    styler,
    overlay,
    commands: {
      openConditional: (kind: ConditionalKind) => {
        setFirst('')
        setSecond('')
        setDialog({ kind, range })
      },
      clearConditional: () => apply({ type: 'conditional/clear', sheetId: sheet.id, range })
    }
  }
}
