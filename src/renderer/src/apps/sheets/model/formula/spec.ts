import type { CellValue } from '../types'
import type { EvalValue } from './values'

/** Una función recibe los argumentos ya evaluados (valores o rangos) y devuelve un valor. */
export type FormulaFunction = (args: EvalValue[]) => CellValue

export interface FunctionSpec {
  minArgs: number
  maxArgs: number
  run: FormulaFunction
}

export const MANY = Infinity
