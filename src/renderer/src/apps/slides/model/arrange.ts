import { createId } from '@/core/ids'
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Box, type GroupElement, type SlideElement } from './types'

/**
 * Organizar elementos: alinear, distribuir, agrupar y duplicar. Funciones puras sobre cajas;
 * el reducer las usa y los tests las prueban sin React.
 */

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type DistributeAxis = 'horizontal' | 'vertical'

const SLIDE_BOX: Box = { x: 0, y: 0, width: SLIDE_WIDTH, height: SLIDE_HEIGHT }

export function boxOf(element: Box): Box {
  return { x: element.x, y: element.y, width: element.width, height: element.height }
}

/** Caja que envuelve a todas. */
export function boundingBox(boxes: Box[]): Box {
  if (boxes.length === 0) return { ...SLIDE_BOX }
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * Alinea las cajas. Con un solo elemento, respecto a la diapositiva (como PowerPoint); con varios,
 * respecto a la caja que los envuelve.
 */
export function alignBoxes(elements: SlideElement[], mode: AlignMode): Record<string, Box> {
  const reference = elements.length === 1 ? SLIDE_BOX : boundingBox(elements)
  const result: Record<string, Box> = {}
  for (const element of elements) {
    const box = boxOf(element)
    switch (mode) {
      case 'left':
        box.x = reference.x
        break
      case 'center':
        box.x = Math.round(reference.x + (reference.width - box.width) / 2)
        break
      case 'right':
        box.x = reference.x + reference.width - box.width
        break
      case 'top':
        box.y = reference.y
        break
      case 'middle':
        box.y = Math.round(reference.y + (reference.height - box.height) / 2)
        break
      case 'bottom':
        box.y = reference.y + reference.height - box.height
        break
    }
    result[element.id] = box
  }
  return result
}

/**
 * Reparte el espacio libre entre los elementos a partes iguales, dejando quietos el primero y el
 * último (en el eje elegido). Hacen falta al menos tres para que tenga efecto.
 */
export function distributeBoxes(elements: SlideElement[], axis: DistributeAxis): Record<string, Box> {
  const result: Record<string, Box> = {}
  if (elements.length < 3) return result
  const start = axis === 'horizontal' ? 'x' : 'y'
  const size = axis === 'horizontal' ? 'width' : 'height'
  const sorted = [...elements].sort((a, b) => a[start] - b[start])
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const span = last[start] + last[size] - first[start]
  const occupied = sorted.reduce((sum, element) => sum + element[size], 0)
  const gap = (span - occupied) / (sorted.length - 1)
  let cursor = first[start]
  for (const element of sorted) {
    result[element.id] = { ...boxOf(element), [start]: Math.round(cursor) }
    cursor += element[size] + gap
  }
  return result
}

/** Mueve y escala un elemento (y, si es un grupo, sus hijos) de la caja `from` a la caja `to`. */
export function transformElement(element: SlideElement, from: Box, to: Box): SlideElement {
  const scaleX = from.width > 0 ? to.width / from.width : 1
  const scaleY = from.height > 0 ? to.height / from.height : 1
  const map = (box: Box): Box => ({
    x: Math.round(to.x + (box.x - from.x) * scaleX),
    y: Math.round(to.y + (box.y - from.y) * scaleY),
    width: Math.max(1, Math.round(box.width * scaleX)),
    height: Math.max(1, Math.round(box.height * scaleY))
  })
  const moved = { ...element, ...map(element) }
  if (moved.type !== 'group') return moved
  return { ...moved, children: moved.children.map((child) => transformElement(child, from, to)) }
}

/** Una caja nueva para un elemento: si es un grupo, sus hijos se mueven y escalan con él. */
export function setElementBox(element: SlideElement, box: Box): SlideElement {
  return element.type === 'group' ? transformElement(element, boxOf(element), box) : { ...element, ...box }
}

/** Agrupa (al menos dos). El grupo ocupa el lugar del elemento más al fondo para no cambiar el orden. */
export function groupElements(elements: SlideElement[], ids: string[], groupId = createId('el')): SlideElement[] {
  const members = elements.filter((element) => ids.includes(element.id))
  if (members.length < 2) return elements
  const group: GroupElement = { id: groupId, type: 'group', ...boundingBox(members), children: members }
  const firstIndex = elements.findIndex((element) => ids.includes(element.id))
  const rest = elements.filter((element) => !ids.includes(element.id))
  rest.splice(firstIndex, 0, group)
  return rest
}

/**
 * Desagrupa: los hijos vuelven a la diapositiva en el sitio del grupo. Si el grupo estaba girado,
 * cada hijo hereda el giro (es la aproximación de PowerPoint para hijos sin girar).
 */
export function ungroupElement(elements: SlideElement[], groupId: string): SlideElement[] {
  const index = elements.findIndex((element) => element.id === groupId)
  const group = elements[index]
  if (!group || group.type !== 'group') return elements
  const rotation = group.rotation ?? 0
  const children = rotation
    ? group.children.map((child) => ({ ...child, rotation: ((child.rotation ?? 0) + rotation) % 360 }))
    : group.children
  return [...elements.slice(0, index), ...children, ...elements.slice(index + 1)]
}

/** Copia con ids nuevos (también los de los hijos de un grupo), desplazada `offset` px. */
export function cloneElement(element: SlideElement, offset = 0): SlideElement {
  const copy = structuredClone(element)
  const renew = (target: SlideElement): SlideElement => {
    const renewed = { ...target, id: createId('el'), x: target.x + offset, y: target.y + offset }
    return renewed.type === 'group' ? { ...renewed, children: renewed.children.map(renew) } : renewed
  }
  return renew(copy)
}

/** Todos los elementos "de verdad" (los hijos de los grupos en vez del grupo). Para exportar o buscar texto. */
export function flattenElements(elements: SlideElement[]): SlideElement[] {
  return elements.flatMap((element) => (element.type === 'group' ? flattenElements(element.children) : [element]))
}
