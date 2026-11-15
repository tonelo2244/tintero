import { MAX_COLUMNS, MAX_ROWS } from '../address'
import type { CellCoord, CellRange } from '../types'
import type { FormulaNode, RefCoord } from './ast'
import { parseFormula } from './parser'
import { printFormula } from './printer'
import { mapNodes } from './transform'

/**
 * Reescribir referencias cuando cambia la estructura de una hoja: insertar o borrar filas y
 * columnas, y mover un rango (cortar y pegar). Es la misma idea que `shiftFormula`: parsear,
 * transformar el AST e imprimir. Nada de expresiones regulares sobre el texto de la fórmula.
 *
 * Una referencia a algo que deja de existir pasa a #¡REF!, como en Excel.
 */

export type Axis = 'rows' | 'columns'

export type StructureChange =
  { kind: 'insert'; axis: Axis; at: number; count: number } | { kind: 'delete'; axis: Axis; at: number; count: number }

/** ¿A qué hoja apunta una referencia? Lo decide quien llama, que conoce los nombres de las hojas. */
export interface TargetSheet {
  /** Nombre de la hoja que cambia (para las referencias con prefijo, "Ventas!A1"). */
  name: string
  /** La fórmula está en esa misma hoja (sus referencias sin prefijo también le afectan). */
  formulaIsOnSheet: boolean
}

function pointsToTarget(node: { sheet?: string }, target: TargetSheet): boolean {
  if (node.sheet === undefined) return target.formulaIsOnSheet
  return node.sheet.toLowerCase() === target.name.toLowerCase()
}

const limitOf = (axis: Axis) => (axis === 'rows' ? MAX_ROWS : MAX_COLUMNS)
const indexOf = (ref: RefCoord, axis: Axis) => (axis === 'rows' ? ref.row : ref.col)
const withIndex = (ref: RefCoord, axis: Axis, index: number): RefCoord =>
  axis === 'rows' ? { ...ref, row: index } : { ...ref, col: index }

/** Nueva posición de una fila/columna, o null si se borró (o se sale de la hoja al insertar). */
export function shiftIndex(index: number, change: StructureChange): number | null {
  const { at, count } = change
  if (change.kind === 'insert') {
    if (index < at) return index
    return index + count < limitOf(change.axis) ? index + count : null
  }
  if (index < at) return index
  if (index < at + count) return null
  return index - count
}

/** Extremos de un rango tras el cambio, o null si desaparece entero. */
function shiftSpan(start: number, end: number, change: StructureChange): [number, number] | null {
  const { at, count } = change
  const last = limitOf(change.axis) - 1
  if (change.kind === 'insert') {
    // Insertar dentro del rango lo agranda; insertar justo en su primera fila lo empuja entero.
    const newStart = start >= at ? start + count : start
    const newEnd = end >= at ? Math.min(last, end + count) : end
    return newStart > last ? null : [newStart, newEnd]
  }
  const deletedEnd = at + count - 1
  if (start >= at && end <= deletedEnd) return null
  const newStart = start < at ? start : start > deletedEnd ? start - count : at
  const newEnd = end < at ? end : end > deletedEnd ? end - count : at - 1
  return [newStart, newEnd]
}

function rewrite(canonical: string, visit: (node: FormulaNode) => FormulaNode | undefined): string {
  let node: FormulaNode
  try {
    node = parseFormula(canonical)
  } catch {
    return canonical
  }
  let changed = false
  const result = mapNodes(node, (current) => {
    const replaced = visit(current)
    if (replaced) changed = true
    return replaced
  })
  // Sin cambios devolvemos el texto original: no "reformateamos" fórmulas que no tocamos.
  return changed ? printFormula(result, 'canonical') : canonical
}

/** Ajusta una fórmula a la inserción o el borrado de filas o columnas de la hoja `target`. */
export function adjustFormulaForStructure(canonical: string, change: StructureChange, target: TargetSheet): string {
  const { axis } = change
  return rewrite(canonical, (node) => {
    if (node.type === 'ref' && pointsToTarget(node, target)) {
      const index = shiftIndex(indexOf(node.ref, axis), change)
      if (index === indexOf(node.ref, axis)) return undefined
      return index === null ? { type: 'error', code: '#REF!' } : { ...node, ref: withIndex(node.ref, axis, index) }
    }
    if (node.type === 'range' && pointsToTarget(node, target)) {
      // A:A no cambia al insertar filas (sigue siendo la columna entera), y 2:2 al insertar columnas.
      if ((node.span === 'columns' && axis === 'rows') || (node.span === 'rows' && axis === 'columns')) return undefined
      const start = indexOf(node.start, axis)
      const end = indexOf(node.end, axis)
      const low = Math.min(start, end)
      const high = Math.max(start, end)
      const shifted = shiftSpan(low, high, change)
      if (!shifted) return { type: 'error', code: '#REF!' }
      if (shifted[0] === low && shifted[1] === high) return undefined
      return {
        ...node,
        start: withIndex(node.start, axis, start <= end ? shifted[0] : shifted[1]),
        end: withIndex(node.end, axis, start <= end ? shifted[1] : shifted[0])
      }
    }
    return undefined
  })
}

function contains(range: CellRange, row: number, col: number): boolean {
  return row >= range.start.row && row <= range.end.row && col >= range.start.col && col <= range.end.col
}

/**
 * Cortar y pegar: lo que apuntaba a `source` pasa a apuntar a donde se ha movido. Un rango solo se
 * mueve si está entero dentro de lo movido (si apunta a medias, se queda como estaba, igual que
 * en Excel). Lo que apuntaba a las celdas de destino, que se han sobrescrito, pasa a #¡REF!.
 */
export function adjustFormulaForMove(
  canonical: string,
  source: CellRange,
  delta: CellCoord,
  target: TargetSheet
): string {
  const destination: CellRange = {
    start: { row: source.start.row + delta.row, col: source.start.col + delta.col },
    end: { row: source.end.row + delta.row, col: source.end.col + delta.col }
  }
  const move = (ref: RefCoord): RefCoord => ({ ...ref, row: ref.row + delta.row, col: ref.col + delta.col })
  const overwritten = (row: number, col: number) => contains(destination, row, col) && !contains(source, row, col)

  return rewrite(canonical, (node) => {
    if (node.type === 'ref' && pointsToTarget(node, target)) {
      if (contains(source, node.ref.row, node.ref.col)) return { ...node, ref: move(node.ref) }
      if (overwritten(node.ref.row, node.ref.col)) return { type: 'error', code: '#REF!' }
      return undefined
    }
    if (node.type === 'range' && pointsToTarget(node, target) && node.span === undefined) {
      const inside = contains(source, node.start.row, node.start.col) && contains(source, node.end.row, node.end.col)
      return inside ? { ...node, start: move(node.start), end: move(node.end) } : undefined
    }
    return undefined
  })
}
