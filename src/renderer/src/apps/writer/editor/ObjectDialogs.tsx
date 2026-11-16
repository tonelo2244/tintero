import { useState } from 'react'
import type { Editor } from '@tiptap/core'
import { ChartColumnBig, Crop, Image as ImageIcon } from 'lucide-react'
import type { ChartKind } from '@/apps/sheets/model/types'
import { CHART_KINDS, chartDataToTable, isChartKind, normalizeChartData, tableToChartData } from '../model/chart'
import { normalizeCrop, type ImageCrop } from '../model/floating'
import { cropSelectedImage, selectedObject, updateSelectedObject } from '../model/objectEdits'
import { NumberField } from './NumberField'
import { WriterDialog } from './WriterDialog'

const CROP_SIDES: { side: keyof ImageCrop; label: string }[] = [
  { side: 'top', label: 'Arriba' },
  { side: 'bottom', label: 'Abajo' },
  { side: 'left', label: 'Izquierda' },
  { side: 'right', label: 'Derecha' }
]

/**
 * Recortar (fase 16): cuánto se quita de cada lado, en %. Se ve en la hoja al momento; Cancelar
 * deja el recorte como estaba.
 */
export function CropDialog({ editor, onClose }: { editor: Editor; onClose(): void }) {
  const [original] = useState(() => normalizeCrop(selectedObject(editor)?.node.attrs.crop))
  const [crop, setCrop] = useState(original)
  const preview = (next: ImageCrop) => {
    setCrop(next)
    cropSelectedImage(editor, next)
  }
  return (
    <WriterDialog
      title="Recortar imagen"
      icon={<Crop size={16} />}
      onClose={() => {
        cropSelectedImage(editor, original)
        onClose()
      }}
      onSubmit={onClose}
      actions={
        <>
          <button type="button" onClick={() => preview(normalizeCrop(null))}>
            Quitar recorte
          </button>
          <button type="submit" className="is-primary">
            Aceptar
          </button>
        </>
      }
    >
      <div className="writer-page-setup__grid">
        {CROP_SIDES.map(({ side, label }) => (
          <NumberField
            key={side}
            unit="%"
            label={label}
            value={crop[side]}
            onChange={(value) => preview(normalizeCrop({ ...crop, [side]: value }))}
          />
        ))}
      </div>
      <p className="writer-dialog__hint">La imagen no cambia de escala: recortar hace el marco más pequeño.</p>
    </WriterDialog>
  )
}

/**
 * Texto alternativo: lo que leen los lectores de pantalla y lo que se ve si la imagen no carga.
 * Va al .docx (`descr` de la imagen) y al PDF.
 */
export function AltTextDialog({ editor, onClose }: { editor: Editor; onClose(): void }) {
  const [text, setText] = useState(() => (selectedObject(editor)?.node.attrs.alt as string | null) ?? '')
  return (
    <WriterDialog
      title="Texto alternativo"
      icon={<ImageIcon size={16} />}
      onClose={onClose}
      onSubmit={() => {
        updateSelectedObject(editor, { alt: text.trim() || null })
        onClose()
      }}
      actions={
        <>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="is-primary">
            Aceptar
          </button>
        </>
      }
    >
      <label className="writer-page-setup__field">
        <span>Describe la imagen en una o dos frases</span>
        <textarea
          autoFocus
          rows={4}
          className="writer-dialog__textarea"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
    </WriterDialog>
  )
}

/**
 * Datos del gráfico: el tipo, el título y la tabla (primera fila, las series; primera columna, las
 * categorías), como la hojita que abre Word. Se aplica al aceptar, en un solo paso de Deshacer.
 */
export function ChartDialog({ editor, onClose }: { editor: Editor; onClose(): void }) {
  const [initial] = useState(() => selectedObject(editor)?.node.attrs ?? {})
  const [kind, setKind] = useState<ChartKind>(isChartKind(initial.kind) ? initial.kind : 'bar')
  const [title, setTitle] = useState<string>(initial.title ?? '')
  const [table, setTable] = useState(() => chartDataToTable(normalizeChartData(initial.data)))
  const columns = table[0]?.length ?? 1

  const setCell = (row: number, column: number, value: string) =>
    setTable((current) =>
      current.map((cells, r) => (r === row ? cells.map((cell, c) => (c === column ? value : cell)) : cells))
    )
  const addRow = () => setTable((current) => [...current, Array.from({ length: columns }, () => '')])
  const addColumn = () => setTable((current) => current.map((cells) => [...cells, '']))

  return (
    <WriterDialog
      title="Datos del gráfico"
      icon={<ChartColumnBig size={16} />}
      className="writer-chart-dialog"
      onClose={onClose}
      onSubmit={() => {
        updateSelectedObject(editor, { kind, title: title.trim(), data: tableToChartData(table) })
        onClose()
      }}
      actions={
        <>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="is-primary">
            Aceptar
          </button>
        </>
      }
    >
      <div className="writer-page-setup__grid">
        <label className="writer-page-setup__field">
          <span>Tipo</span>
          <select value={kind} onChange={(event) => setKind(event.target.value as ChartKind)}>
            {CHART_KINDS.map((option) => (
              <option key={option.kind} value={option.kind}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="writer-page-setup__field">
          <span>Título</span>
          <span className="writer-page-setup__input">
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </span>
        </label>
      </div>
      <div className="writer-chart-dialog__table" role="table" aria-label="Datos">
        {table.map((cells, row) => (
          <div key={row} role="row" className="writer-chart-dialog__row">
            {cells.map((cell, column) => (
              <input
                key={column}
                aria-label={
                  row === 0
                    ? column === 0
                      ? 'Esquina'
                      : `Serie ${column}`
                    : column === 0
                      ? `Categoría ${row}`
                      : `Valor ${row}.${column}`
                }
                className={row === 0 || column === 0 ? 'is-header' : undefined}
                disabled={row === 0 && column === 0}
                value={cell}
                onChange={(event) => setCell(row, column, event.target.value)}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="writer-chart-dialog__buttons">
        <button type="button" onClick={addRow}>
          Añadir categoría
        </button>
        <button type="button" onClick={addColumn}>
          Añadir serie
        </button>
      </div>
      <p className="writer-dialog__hint">
        {kind === 'pie' ? 'El gráfico circular usa solo la primera serie. ' : ''}Deja una fila o columna en blanco para
        quitarla.
      </p>
    </WriterDialog>
  )
}
