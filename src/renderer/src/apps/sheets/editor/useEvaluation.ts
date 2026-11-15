import { useState } from 'react'
import { evaluateWorkbook, updateEvaluation, type Evaluation } from '../model/calc'
import type { Workbook } from '../model/types'

/**
 * Valores calculados del libro, recalculando solo lo que cambia entre renders.
 *
 * Usa el patrón de React "guardar información de renders anteriores": si el libro cambió,
 * se actualiza el estado durante el propio render. updateEvaluation es pura, así que es seguro
 * aunque React renderice dos veces (StrictMode).
 */
export function useEvaluation(workbook: Workbook): Evaluation {
  const [evaluation, setEvaluation] = useState(() => evaluateWorkbook(workbook))
  if (evaluation.workbook !== workbook) {
    const next = updateEvaluation(evaluation, workbook)
    setEvaluation(next)
    return next
  }
  return evaluation
}
