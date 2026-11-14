import { SLIDE_HEIGHT, SLIDE_WIDTH, type Box } from './types'

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

const MIN_SIZE = 20
const SNAP_DISTANCE = 8

/**
 * Redimensiona una caja arrastrando un tirador. dx/dy en unidades de diapositiva.
 * Con `keepAspect` (esquinas de imágenes) mantiene la proporción original.
 */
export function resizeBox(start: Box, handle: ResizeHandle, dx: number, dy: number, keepAspect = false): Box {
  let { x, y, width, height } = start

  if (handle.includes('e')) width = start.width + dx
  if (handle.includes('w')) width = start.width - dx
  if (handle.includes('s')) height = start.height + dy
  if (handle.includes('n')) height = start.height - dy

  const isCorner = handle.length === 2
  if (keepAspect && isCorner) {
    const ratio = start.width / start.height
    if (Math.abs(width / start.width) > Math.abs(height / start.height)) height = width / ratio
    else width = height * ratio
  }

  width = Math.max(MIN_SIZE, width)
  height = Math.max(MIN_SIZE, height)
  if (handle.includes('w')) x = start.x + start.width - width
  if (handle.includes('n')) y = start.y + start.height - height

  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }
}

export interface SnapResult {
  box: Box
  guides: { vertical: boolean; horizontal: boolean }
}

/** Imanta el centro de la caja al centro de la diapositiva y muestra guías, como las suites de escritorio. */
export function snapToCenter(box: Box): SnapResult {
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  const snapX = Math.abs(centerX - SLIDE_WIDTH / 2) <= SNAP_DISTANCE
  const snapY = Math.abs(centerY - SLIDE_HEIGHT / 2) <= SNAP_DISTANCE
  return {
    box: {
      ...box,
      x: snapX ? Math.round(SLIDE_WIDTH / 2 - box.width / 2) : box.x,
      y: snapY ? Math.round(SLIDE_HEIGHT / 2 - box.height / 2) : box.y
    },
    guides: { vertical: snapX, horizontal: snapY }
  }
}
