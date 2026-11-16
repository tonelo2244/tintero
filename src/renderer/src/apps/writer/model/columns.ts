/**
 * Columnas (fase 15). Un bloque `columns` reparte en columnas los bloques que contiene; un
 * `columnBreak` dentro manda lo de detrás a la columna siguiente.
 */

export const COLUMNS = 'columns'
export const COLUMN_BREAK = 'columnBreak'
export const MAX_COLUMNS = 3

/** Separación entre columnas: la de Word por defecto (1,25 cm). */
export const COLUMN_GAP_CM = 1.25

/** Número de columnas válido (2 o 3) a partir de lo que traiga un archivo o un .docx. */
export function normalizeColumnCount(value: unknown): number {
  const count = Math.round(Number(value))
  return Number.isFinite(count) ? Math.min(MAX_COLUMNS, Math.max(2, count)) : 2
}
