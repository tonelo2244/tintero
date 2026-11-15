import { MAX_COLUMNS, MAX_ROWS } from '../address'
import type { FormulaNode, RefCoord } from './ast'
import { parseFormula } from './parser'
import { printFormula } from './printer'

/**
 * Operaciones sobre fórmulas que trabajan con el AST en vez de con el texto.
 * Cada una es: parsear -> transformar el árbol -> imprimir.
 */

/** Recorre el árbol y sustituye los nodos que `visit` decida (devuelve undefined = sin cambios). */
export function mapNodes(node: FormulaNode, visit: (node: FormulaNode) => FormulaNode | undefined): FormulaNode {
  const replaced = visit(node)
  if (replaced) return replaced
  switch (node.type) {
    case 'unary':
      return { ...node, operand: mapNodes(node.operand, visit) }
    case 'binary':
      return { ...node, left: mapNodes(node.left, visit), right: mapNodes(node.right, visit) }
    case 'call':
      return { ...node, args: node.args.map((arg) => mapNodes(arg, visit)) }
    case 'group':
      return { ...node, inner: mapNodes(node.inner, visit) }
    default:
      return node
  }
}

/** Lo que escribe el usuario ("SUMA(A1:A3;2)") -> forma canónica ("SUM(A1:A3,2)"). Lanza si no es válida. */
export function toCanonicalFormula(userFormula: string): string {
  return printFormula(parseFormula(userFormula), 'canonical')
}

/** Forma canónica -> lo que ve el usuario. Si no se puede parsear, se enseña tal cual. */
export function toLocalizedFormula(canonical: string): string {
  try {
    return printFormula(parseFormula(canonical), 'es')
  } catch {
    return canonical
  }
}

/**
 * Ajusta las referencias relativas al copiar una fórmula `rows` filas y `cols` columnas más allá.
 * =A1+$B$1 copiada una fila abajo -> =A2+$B$1. Si una referencia se sale de la hoja -> #REF!.
 */
export function shiftFormula(canonical: string, rows: number, cols: number): string {
  let node: FormulaNode
  try {
    node = parseFormula(canonical)
  } catch {
    return canonical
  }
  const shifted = mapNodes(node, (current) => {
    if (current.type === 'ref') {
      const ref = shiftRef(current.ref, rows, cols)
      return ref ? { ...current, ref } : { type: 'error', code: '#REF!' }
    }
    if (current.type === 'range') {
      const start = shiftRef(current.start, rows, cols)
      const end = shiftRef(current.end, rows, cols)
      return start && end ? { ...current, start, end } : { type: 'error', code: '#REF!' }
    }
    return undefined
  })
  return printFormula(shifted, 'canonical')
}

function shiftRef(ref: RefCoord, rows: number, cols: number): RefCoord | null {
  const row = ref.rowAbsolute ? ref.row : ref.row + rows
  const col = ref.colAbsolute ? ref.col : ref.col + cols
  if (row < 0 || col < 0 || row >= MAX_ROWS || col >= MAX_COLUMNS) return null
  return { ...ref, row, col }
}

/** Al renombrar una hoja, las fórmulas que la nombran pasan a usar el nombre nuevo. */
export function renameSheetInFormula(canonical: string, oldName: string, newName: string): string {
  let node: FormulaNode
  try {
    node = parseFormula(canonical)
  } catch {
    return canonical
  }
  const target = oldName.toLowerCase()
  let changed = false
  const renamed = mapNodes(node, (current) => {
    if ((current.type === 'ref' || current.type === 'range') && current.sheet?.toLowerCase() === target) {
      changed = true
      return { ...current, sheet: newName }
    }
    return undefined
  })
  // Si no nombraba la hoja, devolvemos el texto original intacto (no lo "reformateamos").
  return changed ? printFormula(renamed, 'canonical') : canonical
}
