import type { Editor } from '@tiptap/core'

export type BlockStyle = 'title' | 'subtitle' | 'no-spacing' | 'quote'

/**
 * Estilos de párrafo de la galería "Estilos". Cada uno sabe aplicarse y
 * detectar si está activo; la cinta solo los pinta, no conoce su lógica.
 */
export interface ParagraphStyle {
  id: string
  label: string
  /** Clase CSS usada para la vista previa "AaBbCc" en la galería. */
  previewClass: string
  apply(editor: Editor): void
  isActive(editor: Editor): boolean
}

const asParagraph = (blockStyle: BlockStyle | null): Pick<ParagraphStyle, 'apply' | 'isActive'> => ({
  apply: (editor) => editor.chain().focus().setBlockStyle(blockStyle).run(),
  isActive: (editor) => editor.isActive('paragraph', { blockStyle })
})

const asHeading = (level: 1 | 2 | 3): Pick<ParagraphStyle, 'apply' | 'isActive'> => ({
  apply: (editor) => editor.chain().focus().setHeading({ level }).run(),
  isActive: (editor) => editor.isActive('heading', { level })
})

export const PARAGRAPH_STYLES: ParagraphStyle[] = [
  { id: 'normal', label: 'Normal', previewClass: 'style-preview--normal', ...asParagraph(null) },
  { id: 'no-spacing', label: 'Sin espaciado', previewClass: 'style-preview--normal', ...asParagraph('no-spacing') },
  { id: 'heading-1', label: 'Título 1', previewClass: 'style-preview--h1', ...asHeading(1) },
  { id: 'heading-2', label: 'Título 2', previewClass: 'style-preview--h2', ...asHeading(2) },
  { id: 'heading-3', label: 'Título 3', previewClass: 'style-preview--h3', ...asHeading(3) },
  { id: 'title', label: 'Título', previewClass: 'style-preview--title', ...asParagraph('title') },
  { id: 'subtitle', label: 'Subtítulo', previewClass: 'style-preview--subtitle', ...asParagraph('subtitle') },
  { id: 'quote', label: 'Cita', previewClass: 'style-preview--quote', ...asParagraph('quote') }
]

export function activeParagraphStyleId(editor: Editor): string | null {
  return PARAGRAPH_STYLES.find((style) => style.isActive(editor))?.id ?? null
}
