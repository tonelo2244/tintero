import { useState } from 'react'
import type { Editor } from '@tiptap/core'
import { Crop, Image as ImageIcon } from 'lucide-react'
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
