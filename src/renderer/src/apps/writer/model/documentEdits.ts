import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model'
import { continuedStart, INDENT_STEP_CM } from './paragraphFormat'
import type { StyleAlign, StyleProps } from './styles'
import { changeCase, compareTexts, type CaseMode } from './textCase'

/**
 * Ediciones del documento que no trae Tiptap y que necesitan recorrer nodos: cambiar mayúsculas,
 * ordenar párrafos, continuar una numeración y leer el formato de la selección para un estilo.
 * Cada una es UNA transacción (un paso de deshacer). Las prueba documentEdits.test.ts con un editor
 * sin pantalla.
 */

/** Cambia mayúsculas y minúsculas en la selección sin perder negritas, colores ni comentarios. */
export function changeSelectionCase(editor: Editor, mode: CaseMode): boolean {
  const { state } = editor
  const { from, to, empty } = state.selection
  if (empty) return false
  const tr = state.tr
  let startsSentence = /(^|[.!?]\s*)$/.test(state.doc.textBetween(state.selection.$from.start(), from, undefined, '￼'))
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock && pos >= from) startsSentence = true
    if (!node.isText || !node.text) return true
    const start = Math.max(from, pos)
    const end = Math.min(to, pos + node.nodeSize)
    const original = node.text.slice(start - pos, end - pos)
    const converted = changeCase(original, mode, startsSentence)
    if (/\p{L}/u.test(original)) startsSentence = /[.!?]\s*$/.test(original)
    if (converted !== original) {
      tr.replaceWith(tr.mapping.map(start), tr.mapping.map(end), state.schema.text(converted, node.marks))
    }
    return false
  })
  if (!tr.docChanged) return false
  editor.view.dispatch(tr)
  return true
}

/** Bloques de primer nivel que toca la selección (índices en el documento). */
function topLevelRange(editor: Editor): { first: number; last: number } {
  const { $from, $to } = editor.state.selection
  // "Seleccionar todo" termina entre bloques (profundidad 0): ahí el índice ya es el del siguiente.
  return { first: $from.index(0), last: $to.depth === 0 ? $to.index(0) - 1 : $to.index(0) }
}

/**
 * Ordena alfabéticamente los párrafos seleccionados (de primer nivel). Si en medio hay algo que no
 * es un párrafo o un título (una tabla, una lista), no se ordena: mover una tabla "por su texto"
 * sorprendería más que ayudar.
 */
export function sortSelectedParagraphs(editor: Editor, descending: boolean): boolean {
  const { doc } = editor.state
  const { first, last } = topLevelRange(editor)
  if (last <= first) return false
  const nodes: ProseMirrorNode[] = []
  for (let index = first; index <= last; index++) nodes.push(doc.child(index))
  if (!nodes.every((node) => node.type.name === 'paragraph' || node.type.name === 'heading')) return false
  const sorted = [...nodes].sort((a, b) => compareTexts(a.textContent, b.textContent) * (descending ? -1 : 1))
  let start = 0
  for (let index = 0; index < first; index++) start += doc.child(index).nodeSize
  const end = start + nodes.reduce((size, node) => size + node.nodeSize, 0)
  editor.view.dispatch(editor.state.tr.replaceWith(start, end, sorted))
  return true
}

/** La lista numerada donde está el cursor (la más interior) y su posición. */
function currentOrderedList(editor: Editor): { node: ProseMirrorNode; pos: number; depth: number } | null {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type.name === 'orderedList') return { node, pos: $from.before(depth), depth }
  }
  return null
}

/** Reinicia en 1 o continúa la numeración de la lista numerada anterior del mismo nivel. */
export function setNumberingContinuation(editor: Editor, mode: 'restart' | 'continue'): boolean {
  const list = currentOrderedList(editor)
  if (!list) return false
  let start = 1
  if (mode === 'continue') {
    const { $from } = editor.state.selection
    const parent = $from.node(list.depth - 1)
    const index = $from.index(list.depth - 1)
    let previous: ProseMirrorNode | null = null
    for (let sibling = index - 1; sibling >= 0 && !previous; sibling--) {
      const candidate = parent.child(sibling)
      if (candidate.type.name === 'orderedList') previous = candidate
    }
    if (!previous) return false
    start = continuedStart(Number(previous.attrs.start) || 1, previous.childCount)
  }
  if (list.node.attrs.start === start) return false
  editor.view.dispatch(editor.state.tr.setNodeMarkup(list.pos, undefined, { ...list.node.attrs, start }))
  return true
}

/** ¿Hay una lista numerada antes de esta (en el mismo nivel) cuya numeración se pueda continuar? */
export function canContinueNumbering(editor: Editor): boolean {
  const list = currentOrderedList(editor)
  if (!list) return false
  const { $from } = editor.state.selection
  const parent = $from.node(list.depth - 1)
  for (let sibling = $from.index(list.depth - 1) - 1; sibling >= 0; sibling--) {
    if (parent.child(sibling).type.name === 'orderedList') return true
  }
  return false
}

const ALIGNS: StyleAlign[] = ['left', 'center', 'right', 'justify']

/**
 * Formato de la selección como propiedades de estilo ("Actualizar estilo para que coincida" y
 * "Nuevo estilo a partir de la selección"). Solo lo que el texto tiene puesto a mano: lo demás
 * sigue saliendo del estilo.
 */
export function selectionStyleProps(editor: Editor): StyleProps {
  const props: StyleProps = {}
  const textStyle = editor.getAttributes('textStyle')
  if (typeof textStyle.fontFamily === 'string') props.fontFamily = textStyle.fontFamily
  const size = parseFloat(textStyle.fontSize)
  if (size > 0) props.fontSize = size
  if (typeof textStyle.color === 'string' && /^#[0-9a-f]{6}$/i.test(textStyle.color)) props.color = textStyle.color
  if (editor.isActive('bold')) props.bold = true
  if (editor.isActive('italic')) props.italic = true
  if (editor.isActive('underline')) props.underline = true

  const attrs = selectionBlock(editor).parent.attrs
  if (ALIGNS.includes(attrs.textAlign)) props.align = attrs.textAlign
  if (Number(attrs.lineHeight) > 0) props.lineHeight = Number(attrs.lineHeight)
  if (typeof attrs.spaceBefore === 'number') props.spaceBefore = attrs.spaceBefore
  if (typeof attrs.spaceAfter === 'number') props.spaceAfter = attrs.spaceAfter
  if (Number(attrs.indent) > 0) props.indentLeft = Math.round(Number(attrs.indent) * INDENT_STEP_CM * 100) / 100
  if (Number(attrs.indentRight) > 0) props.indentRight = Number(attrs.indentRight)
  if (Number(attrs.firstLineIndent)) props.firstLine = Number(attrs.firstLineIndent)
  return props
}

const ABSORBED_MARKS = ['textStyle', 'bold', 'italic', 'underline']
const ABSORBED_ATTRS: Record<string, unknown> = {
  textAlign: null,
  lineHeight: null,
  spaceBefore: null,
  spaceAfter: null,
  indent: 0,
  indentRight: null,
  firstLineIndent: null
}

/**
 * Tras pasar el formato del párrafo al estilo, se quita de ese párrafo: ahora lo pone el estilo
 * (y si el estilo cambia más adelante, el párrafo cambia con él, que es lo que se espera).
 */
export function clearAbsorbedFormatting(editor: Editor): void {
  const { state } = editor
  const $from = selectionBlock(editor)
  const block = $from.parent
  const start = $from.start()
  const end = $from.end()
  const tr = state.tr
  for (const name of ABSORBED_MARKS) {
    const type = state.schema.marks[name]
    if (type) tr.removeMark(start, end, type)
  }
  const attrs = Object.fromEntries(Object.entries(ABSORBED_ATTRS).filter(([name]) => name in block.attrs))
  tr.setNodeMarkup($from.before(), undefined, { ...block.attrs, ...attrs })
  editor.view.dispatch(tr)
}

/**
 * Posición dentro del primer bloque de texto de la selección. Con "Seleccionar todo" la selección
 * empieza en el propio documento, que no tiene atributos de párrafo.
 */
export function selectionBlock(editor: Editor): ResolvedPos {
  const { doc, selection } = editor.state
  if (selection.$from.parent.isTextblock) return selection.$from
  let found: ResolvedPos | null = null
  doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (found) return false
    if (node.isTextblock) found = doc.resolve(pos + 1)
    return !found
  })
  return found ?? selection.$from
}
