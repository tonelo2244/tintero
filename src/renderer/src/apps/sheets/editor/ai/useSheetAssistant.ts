import { useCallback, useEffect, useRef, useState } from 'react'
import { platform } from '@/core/platform'
import { ungroundedNumbers } from '@/core/ai/grounding'
import { AiCancelledError, generateStructured } from '@/core/ai/structured'
import { errorMessage, useAiGeneration } from '@/core/ai/useAiGeneration'
import { cellAddress, rangeAddress, rangeSize } from '../../model/address'
import { getCellValue, type Evaluation } from '../../model/calc'
import { formatCellValue } from '../../model/format'
import { toLocalizedFormula } from '../../model/formula/transform'
import { buildExplainRequest } from '../../model/ai/explainFormula'
import { buildFormulaRequest, createFormulaParser, type FormulaProposal } from '../../model/ai/naturalFormula'
import { describeSheet } from '../../model/ai/sheetContext'
import { buildAnalysisRequest, computeTableStats, knownNumbers, type TableStats } from '../../model/ai/tableAnalysis'
import { usedRange } from '../../model/selection'
import type { CellRange, Sheet, Workbook } from '../../model/types'
import type { WorkbookAction } from '../../model/workbookReducer'

export type FormulaJob =
  | { phase: 'asking'; request: string }
  | { phase: 'running'; request: string }
  | { phase: 'done'; request: string; proposal: FormulaProposal }
  | { phase: 'error'; request: string; message: string }

export type SheetAiJob =
  | { kind: 'formula'; target: string; job: FormulaJob }
  | { kind: 'explain'; address: string; formula: string }
  | { kind: 'analyze'; range: string; stats: TableStats }
  | { kind: 'message'; text: string }

interface SheetAssistantInput {
  workbook: Workbook
  evaluation: Evaluation
  sheet: Sheet
  anchor: { row: number; col: number }
  range: CellRange
  apply(action: WorkbookAction): void
}

/**
 * Orquesta las tres funciones de IA de Hojas. Igual que en Texto, la IA nunca toca el libro:
 * propone, el usuario ve el resultado y, si lo acepta, se aplica con una acción normal del
 * reducer (así se deshace con Ctrl+Z como cualquier otra edición).
 */
export function useSheetAssistant(input: SheetAssistantInput) {
  const [job, setJob] = useState<SheetAiJob | null>(null)
  const generation = useAiGeneration()
  const controllerRef = useRef<AbortController | null>(null)
  const inputRef = useRef(input)
  inputRef.current = input

  const abortFormula = () => controllerRef.current?.abort()

  const openFormula = useCallback(() => {
    abortFormula()
    generation.reset()
    const { anchor } = inputRef.current
    setJob((current) => ({
      kind: 'formula',
      target: cellAddress(anchor),
      // "Cambiar la petición" conserva lo que se había escrito.
      job: { phase: 'asking', request: current?.kind === 'formula' ? current.job.request : '' }
    }))
  }, [generation])

  /** Borrador de la petición (se guarda en el trabajo para poder reintentar o cambiarla). */
  const setFormulaRequest = useCallback((request: string) => {
    setJob((current) =>
      current?.kind === 'formula' && (current.job.phase === 'asking' || current.job.phase === 'error')
        ? { ...current, job: { phase: 'asking', request } }
        : current
    )
  }, [])

  const proposeFormula = useCallback(async (request: string) => {
    const current = inputRef.current
    const text = request.trim()
    if (!text) return
    abortFormula()
    const controller = new AbortController()
    controllerRef.current = controller
    const target = cellAddress(current.anchor)
    setJob({ kind: 'formula', target, job: { phase: 'running', request: text } })
    try {
      const proposal = await generateStructured(
        platform.ai,
        buildFormulaRequest({
          request: text,
          sheetDescription: describeSheet(current.sheet, current.evaluation).text,
          targetAddress: target
        }),
        createFormulaParser({
          workbook: current.workbook,
          evaluation: current.evaluation,
          sheetId: current.sheet.id,
          address: target
        }),
        // Tres intentos: los errores del parser son muy concretos y el modelo suele corregirlos.
        { maxAttempts: 3, signal: controller.signal }
      )
      if (!controller.signal.aborted)
        setJob({ kind: 'formula', target, job: { phase: 'done', request: text, proposal } })
    } catch (error) {
      if (error instanceof AiCancelledError) {
        setJob({ kind: 'formula', target, job: { phase: 'asking', request: text } })
      } else {
        setJob({ kind: 'formula', target, job: { phase: 'error', request: text, message: errorMessage(error) } })
      }
    }
  }, [])

  const insertFormula = useCallback(() => {
    if (job?.kind !== 'formula' || job.job.phase !== 'done') return
    const { sheet, apply } = inputRef.current
    const previous = sheet.cells[job.target]
    apply({
      type: 'cells/set',
      sheetId: sheet.id,
      cells: {
        [job.target]: { ...(previous?.style ? { style: previous.style } : {}), formula: job.job.proposal.canonical }
      }
    })
    setJob(null)
  }, [job])

  const explain = useCallback(() => {
    abortFormula()
    const { sheet, evaluation, anchor } = inputRef.current
    const address = cellAddress(anchor)
    const formula = sheet.cells[address]?.formula
    if (formula === undefined) {
      generation.reset()
      setJob({ kind: 'message', text: 'Selecciona una celda con fórmula para que te la explique.' })
      return
    }
    const localizedFormula = `=${toLocalizedFormula(formula)}`
    setJob({ kind: 'explain', address, formula: localizedFormula })
    void generation.start(
      buildExplainRequest({
        localizedFormula,
        address,
        result: formatCellValue(getCellValue(evaluation, sheet.id, address)),
        sheetDescription: describeSheet(sheet, evaluation).text
      })
    )
  }, [generation])

  const analyze = useCallback(() => {
    abortFormula()
    const { sheet, evaluation, range } = inputRef.current
    // Con una sola celda seleccionada se analiza toda la zona con datos, como haría Excel.
    const { rows, cols } = rangeSize(range)
    const target = rows * cols > 1 ? clip(range, usedRange(sheet)) : usedRange(sheet)
    if (!target) {
      generation.reset()
      setJob({ kind: 'message', text: 'No hay datos que analizar en la selección.' })
      return
    }
    const stats = computeTableStats(sheet, evaluation, target)
    if (stats.columns.every((column) => column.numeric === null)) {
      generation.reset()
      setJob({ kind: 'message', text: 'La selección no tiene números: selecciona una tabla con datos numéricos.' })
      return
    }
    setJob({ kind: 'analyze', range: rangeAddress(target), stats })
    void generation.start(buildAnalysisRequest(stats))
  }, [generation])

  const retry = useCallback(() => {
    if (job?.kind === 'explain') explain()
    else if (job?.kind === 'analyze') analyze()
    else if (job?.kind === 'formula' && job.job.request) void proposeFormula(job.job.request)
  }, [analyze, explain, job, proposeFormula])

  const cancel = useCallback(() => {
    abortFormula()
    generation.cancel()
  }, [generation])

  const close = useCallback(() => {
    abortFormula()
    generation.reset()
    setJob(null)
  }, [generation])

  useEffect(() => () => controllerRef.current?.abort(), [])

  /** Cifras del análisis que no salen de las estadísticas calculadas: se avisa al usuario. */
  const ungrounded =
    job?.kind === 'analyze' && generation.state.phase === 'done'
      ? ungroundedNumbers(generation.state.text, knownNumbers(job.stats))
      : []

  return {
    job,
    generation: generation.state,
    ungrounded,
    openFormula,
    setFormulaRequest,
    proposeFormula,
    insertFormula,
    explain,
    analyze,
    retry,
    cancel,
    close
  }
}

export type SheetAssistant = ReturnType<typeof useSheetAssistant>

function clip(range: CellRange, used: CellRange | null): CellRange | null {
  if (!used) return null
  const start = { row: Math.max(range.start.row, used.start.row), col: Math.max(range.start.col, used.start.col) }
  const end = { row: Math.min(range.end.row, used.end.row), col: Math.min(range.end.col, used.end.col) }
  return start.row <= end.row && start.col <= end.col ? { start, end } : null
}
