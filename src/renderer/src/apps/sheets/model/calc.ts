import { cellAddress, normalizeRange, parseCellAddress, rangeContains } from './address'
import type { FormulaNode } from './formula/ast'
import { VOLATILE_FUNCTIONS } from './formula/dates'
import { evaluateFormula, type EvaluationContext } from './formula/evaluate'
import { parseFormula } from './formula/parser'
import { err } from './formula/values'
import type { Cell, CellRange, CellValue, Sheet, Workbook } from './types'

/**
 * Motor de recálculo: grafo de dependencias + evaluación en orden topológico.
 *
 * - Cada fórmula se "compila" una vez: se parsea y se anotan los rangos que lee (sus precedentes).
 * - Un índice inverso responde "¿quién depende de esta celda?" sin recorrer todas las fórmulas.
 * - Al editar, solo se recalcula lo afectado: las celdas cambiadas y, en cadena, sus dependientes.
 * - El orden lo da el algoritmo de Kahn: una fórmula se evalúa cuando ya lo están las que lee.
 *   Lo que queda sin poder ordenar forma un ciclo (A1 = B1, B1 = A1) y recibe #¡CIRCULAR!.
 *
 * Sin recursión a propósito: una cadena A2=A1+1, A3=A2+1... de 10.000 filas desbordaría la pila.
 * Todo es puro: cada actualización devuelve un objeto nuevo y no toca el anterior.
 */

/** "hojaId!B3": identifica una celda en todo el libro. */
export type CellId = string

export function cellId(sheetId: string, address: string): CellId {
  return `${sheetId}!${address}`
}

function splitCellId(id: CellId): { sheetId: string; address: string } {
  const bang = id.lastIndexOf('!')
  return { sheetId: id.slice(0, bang), address: id.slice(bang + 1) }
}

/** Un rango que lee una fórmula. sheetId null = la hoja nombrada no existe. */
interface Dependency {
  sheetId: string | null
  range: CellRange
}

interface CompiledFormula {
  /** null si la fórmula no se pudo entender. */
  node: FormulaNode | null
  sheetId: string
  dependencies: Dependency[]
  /** Usa HOY o AHORA: se recalcula siempre, aunque no cambie nada de lo que lee. */
  volatile: boolean
}

interface DependencyGraph {
  formulas: Map<CellId, CompiledFormula>
  /** Referencias a una sola celda: celda -> fórmulas que la leen. */
  cellDependents: Map<CellId, Set<CellId>>
  /** Referencias a rangos: se comprueban por contención (no se expanden celda a celda). */
  rangeDependents: { sheetId: string; range: CellRange; dependent: CellId }[]
  /** Fórmulas volátiles (HOY, AHORA). Suele estar vacío: recorrerlo en cada edición no cuesta nada. */
  volatile: Set<CellId>
}

export interface Evaluation {
  workbook: Workbook
  graph: DependencyGraph
  /** Valor de cada celda con fórmula. Las demás se leen directamente del libro. */
  values: Map<CellId, CellValue>
}

/** Valor visible de una celda: el calculado si tiene fórmula, el literal si no. */
export function getCellValue(evaluation: Evaluation, sheetId: string, address: string): CellValue {
  const id = cellId(sheetId, address)
  if (evaluation.values.has(id)) return evaluation.values.get(id)!
  const sheet = evaluation.workbook.sheets.find((candidate) => candidate.id === sheetId)
  return literalValue(sheet?.cells[address])
}

function literalValue(cell: Cell | undefined): CellValue {
  if (!cell || cell.formula !== undefined) return null
  return cell.value ?? null
}

/** Calcula el libro entero desde cero. */
export function evaluateWorkbook(workbook: Workbook): Evaluation {
  const empty: Evaluation = {
    workbook,
    graph: { formulas: new Map(), cellDependents: new Map(), rangeDependents: [], volatile: new Set() },
    values: new Map()
  }
  const allCells: CellId[] = []
  for (const sheet of workbook.sheets) {
    for (const address of Object.keys(sheet.cells)) allCells.push(cellId(sheet.id, address))
  }
  return recalculate(empty, workbook, allCells)
}

/**
 * Recalcula a partir de una evaluación anterior. Si cambia la estructura de hojas (añadir,
 * borrar o renombrar), los nombres de las fórmulas pueden apuntar a otra hoja: se recalcula todo.
 */
export function updateEvaluation(previous: Evaluation, workbook: Workbook): Evaluation {
  if (previous.workbook === workbook) return previous
  const changed = changedCells(previous.workbook, workbook)
  if (changed === 'all') return evaluateWorkbook(workbook)
  if (changed.length === 0) return { ...previous, workbook }
  // Si algo cambió, HOY y AHORA se vuelven a evaluar (como hace Excel en cada recálculo).
  const alreadyChanged = new Set(changed)
  const volatile = [...previous.graph.volatile].filter((id) => !alreadyChanged.has(id))
  return recalculate(previous, workbook, [...changed, ...volatile])
}

/** Celdas cuyo contenido (valor o fórmula) cambió. Los cambios solo de formato no cuentan. */
export function changedCells(before: Workbook, after: Workbook): CellId[] | 'all' {
  const shape = (workbook: Workbook) => workbook.sheets.map((sheet) => `${sheet.id}\u0000${sheet.name}`).join('\u0001')
  if (shape(before) !== shape(after)) return 'all'
  const changed: CellId[] = []
  after.sheets.forEach((sheet, index) => {
    const old = before.sheets[index]
    if (old.cells === sheet.cells) return
    const addresses = new Set([...Object.keys(old.cells), ...Object.keys(sheet.cells)])
    for (const address of addresses) {
      const a = old.cells[address]
      const b = sheet.cells[address]
      if (a === b) continue
      if (a?.formula !== b?.formula || a?.value !== b?.value) changed.push(cellId(sheet.id, address))
    }
  })
  return changed
}

function recalculate(previous: Evaluation, workbook: Workbook, changed: CellId[]): Evaluation {
  const sheetsById = new Map(workbook.sheets.map((sheet) => [sheet.id, sheet]))
  const sheetIdByName = new Map(workbook.sheets.map((sheet) => [sheet.name.toLowerCase(), sheet.id]))
  const graph = cloneGraph(previous.graph)
  const values = new Map(previous.values)

  // 1. Actualizar el grafo con las celdas cambiadas.
  for (const id of changed) {
    removeFormula(graph, id)
    values.delete(id)
    const { sheetId, address } = splitCellId(id)
    const cell = sheetsById.get(sheetId)?.cells[address]
    if (cell?.formula !== undefined) addFormula(graph, id, compile(cell.formula, sheetId, sheetIdByName))
  }

  // 2. Las celdas sucias: las cambiadas y todo lo que depende de ellas, en cadena.
  const dirty = collectDirty(graph, changed)

  // 3. Ordenar las fórmulas sucias y evaluarlas en ese orden.
  const order = topologicalOrder(graph, dirty)
  const context = (sheetId: string): EvaluationContext => ({
    cell: (sheetName, row, col) => {
      const targetSheet = sheetName === undefined ? sheetId : sheetIdByName.get(sheetName.toLowerCase())
      if (!targetSheet) return err('#REF!')
      const address = cellAddress({ row, col })
      const id = cellId(targetSheet, address)
      if (values.has(id)) return values.get(id)!
      return literalValue(sheetsById.get(targetSheet)?.cells[address])
    },
    range: (sheetName, start, end) => {
      const targetSheet = sheetName === undefined ? sheetId : sheetIdByName.get(sheetName.toLowerCase())
      const sheet = targetSheet ? sheetsById.get(targetSheet) : undefined
      if (!sheet) return null
      const range = normalizeRange(start, end)
      return {
        kind: 'matrix',
        rows: range.end.row - range.start.row + 1,
        cols: range.end.col - range.start.col + 1,
        get: (row, col) => {
          const address = cellAddress({ row: range.start.row + row, col: range.start.col + col })
          const id = cellId(sheet.id, address)
          return values.has(id) ? values.get(id)! : literalValue(sheet.cells[address])
        }
      }
    }
  })

  for (const id of order.sorted) {
    const formula = graph.formulas.get(id)!
    values.set(id, formula.node ? evaluateFormula(formula.node, context(formula.sheetId)) : err('#NAME?'))
  }
  for (const id of order.cyclic) values.set(id, err('#CIRC!'))

  return { workbook, graph, values }
}

function compile(formula: string, sheetId: string, sheetIdByName: Map<string, string>): CompiledFormula {
  let node: FormulaNode
  try {
    node = parseFormula(formula)
  } catch {
    return { node: null, sheetId, dependencies: [], volatile: false }
  }
  const dependencies: Dependency[] = []
  let volatile = false
  const visit = (current: FormulaNode): void => {
    switch (current.type) {
      case 'ref':
      case 'range': {
        const target = current.sheet === undefined ? sheetId : (sheetIdByName.get(current.sheet.toLowerCase()) ?? null)
        const range =
          current.type === 'ref' ? normalizeRange(current.ref, current.ref) : normalizeRange(current.start, current.end)
        dependencies.push({ sheetId: target, range })
        break
      }
      case 'unary':
        visit(current.operand)
        break
      case 'binary':
        visit(current.left)
        visit(current.right)
        break
      case 'call':
        if (VOLATILE_FUNCTIONS.has(current.name)) volatile = true
        current.args.forEach(visit)
        break
      case 'group':
        visit(current.inner)
        break
    }
  }
  visit(node)
  return { node, sheetId, dependencies, volatile }
}

function cloneGraph(graph: DependencyGraph): DependencyGraph {
  return {
    formulas: new Map(graph.formulas),
    // Los Set se copian al modificarlos (ver addFormula/removeFormula), no aquí.
    cellDependents: new Map(graph.cellDependents),
    rangeDependents: graph.rangeDependents,
    volatile: graph.volatile
  }
}

function isSingleCell(range: CellRange): boolean {
  return range.start.row === range.end.row && range.start.col === range.end.col
}

function addFormula(graph: DependencyGraph, id: CellId, formula: CompiledFormula): void {
  graph.formulas.set(id, formula)
  if (formula.volatile) graph.volatile = new Set(graph.volatile).add(id)
  const newRanges: DependencyGraph['rangeDependents'] = []
  for (const { sheetId, range } of formula.dependencies) {
    if (sheetId === null) continue
    if (isSingleCell(range)) {
      const target = cellId(sheetId, cellAddress(range.start))
      const dependents = new Set(graph.cellDependents.get(target))
      dependents.add(id)
      graph.cellDependents.set(target, dependents)
    } else {
      newRanges.push({ sheetId, range, dependent: id })
    }
  }
  if (newRanges.length > 0) graph.rangeDependents = [...graph.rangeDependents, ...newRanges]
}

function removeFormula(graph: DependencyGraph, id: CellId): void {
  const formula = graph.formulas.get(id)
  if (!formula) return
  graph.formulas.delete(id)
  if (formula.volatile) {
    graph.volatile = new Set(graph.volatile)
    graph.volatile.delete(id)
  }
  let hasRanges = false
  for (const { sheetId, range } of formula.dependencies) {
    if (sheetId === null) continue
    if (!isSingleCell(range)) {
      hasRanges = true
      continue
    }
    const target = cellId(sheetId, cellAddress(range.start))
    const dependents = new Set(graph.cellDependents.get(target))
    dependents.delete(id)
    if (dependents.size === 0) graph.cellDependents.delete(target)
    else graph.cellDependents.set(target, dependents)
  }
  if (hasRanges) graph.rangeDependents = graph.rangeDependents.filter((entry) => entry.dependent !== id)
}

/** Fórmulas que leen directamente una celda. */
function directDependents(graph: DependencyGraph, id: CellId): CellId[] {
  const result = [...(graph.cellDependents.get(id) ?? [])]
  if (graph.rangeDependents.length > 0) {
    const { sheetId, address } = splitCellId(id)
    const coord = parseCellAddress(address)
    if (coord) {
      for (const entry of graph.rangeDependents) {
        if (entry.sheetId === sheetId && rangeContains(entry.range, coord)) result.push(entry.dependent)
      }
    }
  }
  return result
}

function collectDirty(graph: DependencyGraph, changed: CellId[]): Set<CellId> {
  const dirty = new Set<CellId>()
  const queue = [...changed]
  while (queue.length > 0) {
    const id = queue.pop()!
    if (dirty.has(id)) continue
    dirty.add(id)
    for (const dependent of directDependents(graph, id)) if (!dirty.has(dependent)) queue.push(dependent)
  }
  return dirty
}

/** Algoritmo de Kahn sobre las fórmulas sucias. */
function topologicalOrder(graph: DependencyGraph, dirty: Set<CellId>): { sorted: CellId[]; cyclic: CellId[] } {
  const dirtyFormulas = [...dirty].filter((id) => graph.formulas.has(id))
  const pending = new Map<CellId, number>(dirtyFormulas.map((id) => [id, 0]))
  const dependentsOf = new Map<CellId, CellId[]>()

  // Para cada fórmula, ¿cuántas de las fórmulas que lee están también pendientes?
  const dirtyBySheet = new Map<string, { id: CellId; row: number; col: number }[]>()
  for (const id of dirtyFormulas) {
    const { sheetId, address } = splitCellId(id)
    const coord = parseCellAddress(address)!
    const list = dirtyBySheet.get(sheetId) ?? []
    list.push({ id, ...coord })
    dirtyBySheet.set(sheetId, list)
  }

  for (const id of dirtyFormulas) {
    const precedents = new Set<CellId>()
    for (const { sheetId, range } of graph.formulas.get(id)!.dependencies) {
      if (sheetId === null) continue
      const candidates = dirtyBySheet.get(sheetId) ?? []
      // Se recorre lo más pequeño: las celdas del rango o las fórmulas pendientes de esa hoja.
      const area = (range.end.row - range.start.row + 1) * (range.end.col - range.start.col + 1)
      if (area <= candidates.length) {
        for (let row = range.start.row; row <= range.end.row; row++) {
          for (let col = range.start.col; col <= range.end.col; col++) {
            const precedent = cellId(sheetId, cellAddress({ row, col }))
            if (pending.has(precedent)) precedents.add(precedent)
          }
        }
      } else {
        for (const candidate of candidates) if (rangeContains(range, candidate)) precedents.add(candidate.id)
      }
    }
    pending.set(id, precedents.size)
    for (const precedent of precedents) {
      const list = dependentsOf.get(precedent) ?? []
      list.push(id)
      dependentsOf.set(precedent, list)
    }
  }

  const ready = dirtyFormulas.filter((id) => pending.get(id) === 0)
  const sorted: CellId[] = []
  while (ready.length > 0) {
    const id = ready.pop()!
    sorted.push(id)
    for (const dependent of dependentsOf.get(id) ?? []) {
      const remaining = pending.get(dependent)! - 1
      pending.set(dependent, remaining)
      if (remaining === 0) ready.push(dependent)
    }
  }
  const sortedSet = new Set(sorted)
  return { sorted, cyclic: dirtyFormulas.filter((id) => !sortedSet.has(id)) }
}

/** Para los tests y la exportación: el valor visible de todas las celdas de una hoja. */
export function sheetValues(evaluation: Evaluation, sheet: Sheet): Record<string, CellValue> {
  const result: Record<string, CellValue> = {}
  for (const address of Object.keys(sheet.cells)) result[address] = getCellValue(evaluation, sheet.id, address)
  return result
}
