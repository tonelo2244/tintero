import { dateToSerial, serialToDate } from '../format'
import type { CellValue } from '../types'
import type { FunctionSpec } from './spec'
import { err, isError, toNumber, type EvalValue } from './values'

/**
 * Fechas como en Excel: un número de serie (días desde el 30/12/1899) con la hora como fracción.
 * HOY y AHORA son "volátiles": su valor cambia sin que cambie ninguna celda, así que el motor de
 * cálculo las vuelve a evaluar en cada recálculo (ver VOLATILE_FUNCTIONS y calc.ts).
 */
export const VOLATILE_FUNCTIONS = new Set(['TODAY', 'NOW'])

/** La fecha de hoy en la zona horaria del equipo (la de Excel también es la local). */
function todaySerial(now: Date): number {
  return dateToSerial(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

function nowSerial(now: Date): number {
  const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
  return todaySerial(now) + seconds / 86_400
}

/** Una parte de la fecha (año, mes o día) de un número de serie. Los negativos no son fechas. */
function datePart(part: (date: Date) => number): FunctionSpec['run'] {
  return ([value]: EvalValue[]): CellValue => {
    const serial = toNumber(value)
    if (isError(serial)) return serial
    if (serial < 0) return err('#NUM!')
    return part(serialToDate(Math.floor(serial)))
  }
}

export const DATE_FUNCTIONS: Record<string, FunctionSpec> = {
  TODAY: { minArgs: 0, maxArgs: 0, run: () => todaySerial(new Date()) },
  NOW: { minArgs: 0, maxArgs: 0, run: () => nowSerial(new Date()) },
  DATE: {
    minArgs: 3,
    maxArgs: 3,
    run: (args) => {
      const parts: number[] = []
      for (const arg of args) {
        const number = toNumber(arg)
        if (isError(number)) return number
        parts.push(Math.trunc(number))
      }
      let [year] = parts
      const [, month, day] = parts
      // Excel: un año de 0 a 1899 se suma a 1900 (FECHA(24;1;1) es 1924). Mes 13 = enero siguiente.
      if (year >= 0 && year < 1900) year += 1900
      if (year < 0 || year > 9999) return err('#NUM!')
      const serial = dateToSerial(year, month, day)
      return serial < 0 ? err('#NUM!') : serial
    }
  },
  YEAR: { minArgs: 1, maxArgs: 1, run: datePart((date) => date.getUTCFullYear()) },
  MONTH: { minArgs: 1, maxArgs: 1, run: datePart((date) => date.getUTCMonth() + 1) },
  DAY: { minArgs: 1, maxArgs: 1, run: datePart((date) => date.getUTCDate()) }
}
