import type { Editor } from '@tiptap/core'
import { headingLevelOf, NORMAL_STYLE_ID, type WriterStyle } from './styles'

/**
 * Puente entre los estilos (datos, model/styles.ts) y los nodos del editor: cómo se aplica un
 * estilo y qué estilo tiene el párrafo del cursor. Los títulos son nodos `heading` (para que la
 * navegación y el .docx los reconozcan como títulos); el resto de estilos de párrafo, el atributo
 * `blockStyle`; los de carácter, la marca `charStyle`.
 */
export function applyStyle(editor: Editor, style: WriterStyle): void {
  const chain = editor.chain().focus()
  if (style.type === 'character') {
    chain.toggleCharStyle(style.id).run()
    return
  }
  const level = headingLevelOf(style.id)
  if (level) chain.setHeading({ level }).run()
  else chain.setBlockStyle(style.id === NORMAL_STYLE_ID ? null : style.id).run()
}

/** Estilo de párrafo donde está el cursor (null si no es un párrafo ni un título, p. ej. código). */
export function activeParagraphStyleId(editor: Editor): string | null {
  const block = editor.state.selection.$from.parent
  if (block.type.name === 'heading') return `heading-${block.attrs.level}`
  if (block.type.name === 'paragraph') return (block.attrs.blockStyle as string | null) ?? NORMAL_STYLE_ID
  return null
}

export function activeCharStyleId(editor: Editor): string | null {
  return (editor.getAttributes('charStyle').styleId as string | undefined) ?? null
}

export function isStyleActive(editor: Editor, style: WriterStyle): boolean {
  return style.type === 'character'
    ? activeCharStyleId(editor) === style.id
    : activeParagraphStyleId(editor) === style.id
}
