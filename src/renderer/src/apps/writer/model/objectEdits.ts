import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'
import {
  arrangeZIndex,
  frameAfterCrop,
  normalizeCrop,
  normalizeRotation,
  placementOf,
  type ArrangeAction,
  type ImageCrop
} from './floating'

/**
 * Edición de los objetos del documento (fase 16) sobre el editor: cuál está seleccionado y cómo
 * cambiarlo. Las cuentas son las de floating.ts; aquí solo se buscan nodos y se escriben atributos.
 */

/** Tipos de nodo que son objetos (con colocación, tamaño y orden). */
export const OBJECT_TYPES = ['image', 'shape', 'textBox', 'chart'] as const
export type ObjectType = (typeof OBJECT_TYPES)[number]

const isObjectType = (name: string): name is ObjectType => (OBJECT_TYPES as readonly string[]).includes(name)

export interface SelectedObject {
  type: ObjectType
  node: ProseMirrorNode
  pos: number
}

/**
 * El objeto con el que se trabaja: el seleccionado (clic en una imagen, una forma o un gráfico) o
 * el cuadro de texto donde está el cursor.
 */
export function selectedObject(editor: Editor): SelectedObject | null {
  const { selection } = editor.state
  if (selection instanceof NodeSelection && isObjectType(selection.node.type.name)) {
    return { type: selection.node.type.name, node: selection.node, pos: selection.from }
  }
  const { $from } = selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type.name === 'textBox') return { type: 'textBox', node, pos: $from.before(depth) }
  }
  return null
}

/** Cambia atributos del objeto seleccionado sin perder la selección. */
export function updateSelectedObject(editor: Editor, attrs: Record<string, unknown>): boolean {
  const object = selectedObject(editor)
  if (!object) return false
  const { tr } = editor.state
  tr.setNodeMarkup(object.pos, undefined, { ...object.node.attrs, ...attrs })
  if (editor.state.selection instanceof NodeSelection) tr.setSelection(NodeSelection.create(tr.doc, object.pos))
  editor.view.dispatch(tr)
  return true
}

/** Traer adelante, enviar atrás... entre todos los objetos del documento. */
export function arrangeSelectedObject(editor: Editor, action: ArrangeAction): boolean {
  const object = selectedObject(editor)
  if (!object) return false
  const others: number[] = []
  editor.state.doc.descendants((node, pos) => {
    if (pos !== object.pos && isObjectType(node.type.name)) others.push(placementOf(node.attrs).zIndex)
    return true
  })
  return updateSelectedObject(editor, { zIndex: arrangeZIndex(placementOf(object.node.attrs).zIndex, others, action) })
}

/** Tamaño que se ve ahora (el del nodo o, si no lo dice, el de la pantalla). */
export function objectSize(editor: Editor, object: SelectedObject): { width: number; height: number } {
  const width = Number(object.node.attrs.width) || 0
  const height = Number(object.node.attrs.height) || 0
  if (width && height) return { width, height }
  const dom = editor.view.nodeDOM(object.pos)
  const element = dom instanceof HTMLElement ? dom : null
  return { width: width || element?.offsetWidth || 200, height: height || element?.offsetHeight || 150 }
}

export function rotateSelectedObject(editor: Editor, degrees: number): boolean {
  const object = selectedObject(editor)
  if (!object) return false
  return updateSelectedObject(editor, {
    rotation: normalizeRotation((Number(object.node.attrs.rotation) || 0) + degrees)
  })
}

/** Recorta la imagen seleccionada: el marco encoge con lo recortado y la imagen no cambia de escala. */
export function cropSelectedImage(editor: Editor, crop: ImageCrop): boolean {
  const object = selectedObject(editor)
  if (object?.type !== 'image') return false
  const previous = normalizeCrop(object.node.attrs.crop)
  const next = normalizeCrop(crop)
  const frame = frameAfterCrop(objectSize(editor, object), previous, next)
  const cropped = next.top + next.right + next.bottom + next.left > 0
  return updateSelectedObject(editor, { crop: cropped ? next : null, ...frame })
}
