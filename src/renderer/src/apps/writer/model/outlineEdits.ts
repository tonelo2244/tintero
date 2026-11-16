import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode, NodeType } from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'
import { TextSelection } from '@tiptap/pm/state'
import {
  headingIndexAt,
  MAX_HEADING_LEVEL,
  planMoveDown,
  planMoveUp,
  planSectionMove,
  type BlockMove,
  type OutlineBlock
} from './outline'

/**
 * El esquema (model/outline.ts) aplicado a un documento de ProseMirror: leer los bloques de primer
 * nivel y mover secciones o cambiar niveles. Cada edición es UNA transacción (un paso de deshacer),
 * igual que en documentEdits.ts. Lo prueban outlineEdits.test.ts y commands.test.ts.
 */

export interface DocumentOutline {
  blocks: OutlineBlock[]
  /** Posición de cada bloque de primer nivel; el último valor es el final del documento. */
  positions: number[]
}

export function documentOutline(doc: ProseMirrorNode): DocumentOutline {
  const blocks: OutlineBlock[] = []
  const positions: number[] = []
  doc.forEach((node, offset) => {
    blocks.push({ level: node.type.name === 'heading' ? Number(node.attrs.level) : null, text: node.textContent })
    positions.push(offset)
  })
  positions.push(doc.content.size)
  return { blocks, positions }
}

/** Bloque de primer nivel donde está el cursor. */
export function topLevelIndexAt(doc: ProseMirrorNode, pos: number): number {
  return doc.resolve(Math.min(pos, doc.content.size)).index(0)
}

/** Aplica un movimiento de bloques y deja el cursor al principio de lo movido, a la vista. */
export function applyBlockMove(editor: Editor, move: BlockMove): boolean {
  const { state } = editor
  const { positions } = documentOutline(state.doc)
  const from = positions[move.start]
  const to = positions[move.end]
  const content = state.doc.slice(from, to).content
  const tr = state.tr.delete(from, to)
  const insertAt = tr.mapping.map(positions[move.insertAt])
  tr.insert(insertAt, content)
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + 1))).scrollIntoView()
  // Un paso de deshacer propio: si no, el historial lo junta con lo último que se escribió y
  // Deshacer se llevaría también ese texto.
  closeHistory(tr)
  editor.view.dispatch(tr)
  return true
}

/** Arrastrar en el panel de navegación: la sección del bloque `index` pasa delante de `insertAt`. */
export function moveSection(editor: Editor, index: number, insertAt: number): boolean {
  const move = planSectionMove(documentOutline(editor.state.doc).blocks, index, insertAt)
  return move ? applyBlockMove(editor, move) : false
}

/** El bloque que mueven "Mover arriba/abajo": el del cursor (si es un título, con su sección). */
function planAtCursor(editor: Editor, direction: 'up' | 'down'): BlockMove | null {
  const { blocks } = documentOutline(editor.state.doc)
  const index = topLevelIndexAt(editor.state.doc, editor.state.selection.from)
  return direction === 'up' ? planMoveUp(blocks, index) : planMoveDown(blocks, index)
}

export const canMoveAtCursor = (editor: Editor, direction: 'up' | 'down') => planAtCursor(editor, direction) !== null

export function moveAtCursor(editor: Editor, direction: 'up' | 'down'): boolean {
  const move = planAtCursor(editor, direction)
  return move ? applyBlockMove(editor, move) : false
}

/** Atributos que comparten párrafo y título (alineación, sangrías...): se conservan al cambiar de uno a otro. */
function attrsFor(type: NodeType, attrs: Record<string, unknown>, extra: Record<string, unknown>) {
  const allowed = Object.keys(type.spec.attrs ?? {})
  return Object.fromEntries(
    Object.entries({ ...attrs, blockStyle: null, ...extra }).filter(([key]) => allowed.includes(key))
  )
}

type LevelChange = 'promote' | 'demote' | 'body'

/** Párrafos y títulos de primer nivel que toca la selección, con su posición. */
function selectedTextBlocks(editor: Editor): { node: ProseMirrorNode; pos: number }[] {
  const { from, to } = editor.state.selection
  const found: { node: ProseMirrorNode; pos: number }[] = []
  editor.state.doc.nodesBetween(from, to, (node, pos, parent) => {
    if (parent === editor.state.doc && (node.type.name === 'paragraph' || node.type.name === 'heading')) {
      found.push({ node, pos })
    }
    return false
  })
  return found
}

/**
 * Subir o bajar de nivel (Esquema de Word): un título cambia de nivel; un texto normal que se
 * "sube" se convierte en título del nivel del título que tiene encima (o Título 1). "Texto
 * normal" vuelve a dejarlo en párrafo.
 */
export function changeOutlineLevel(editor: Editor, change: LevelChange): boolean {
  const { state } = editor
  const { schema } = state
  const { blocks } = documentOutline(state.doc)
  const tr = state.tr
  let changed = false
  for (const { node, pos } of selectedTextBlocks(editor)) {
    const level = node.type.name === 'heading' ? Number(node.attrs.level) : null
    let next: number | null | undefined
    if (change === 'body') next = null
    else if (level === null) {
      if (change === 'demote') continue
      const parent = headingIndexAt(blocks, topLevelIndexAt(state.doc, pos))
      next = parent === null ? 1 : (blocks[parent].level ?? 1)
    } else next = Math.min(MAX_HEADING_LEVEL, Math.max(1, level + (change === 'promote' ? -1 : 1)))
    if (next === level) continue
    const type = next === null ? schema.nodes.paragraph : schema.nodes.heading
    tr.setNodeMarkup(pos, type, attrsFor(type, node.attrs, next === null ? {} : { level: next }))
    changed = true
  }
  if (changed) editor.view.dispatch(tr)
  return changed
}

export function canChangeOutlineLevel(editor: Editor, change: LevelChange): boolean {
  return selectedTextBlocks(editor).some(({ node }) => {
    const level = node.type.name === 'heading' ? Number(node.attrs.level) : null
    if (change === 'body') return level !== null
    if (change === 'demote') return level !== null && level < MAX_HEADING_LEVEL
    return level !== 1
  })
}
