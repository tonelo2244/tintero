/**
 * Modo "señalar" de Excel: mientras escribes "=SUMA(" puedes hacer clic en una celda (o arrastrar
 * por un rango) y su dirección se escribe en la fórmula. Aquí está la parte pura: decidir si el
 * cursor está en un sitio donde cabe una referencia y escribirla.
 */

/** Caracteres tras los que tiene sentido insertar una referencia. */
const REFERENCE_PRECEDERS = new Set(['=', '+', '-', '*', '/', '^', '&', '(', ',', ';', '<', '>', ':'])

export function canInsertReference(text: string, caret: number): boolean {
  if (!text.startsWith('=')) return false
  const before = text.slice(0, caret).trimEnd()
  return REFERENCE_PRECEDERS.has(before[before.length - 1])
}

/** Texto insertado por el modo señalar: dónde está, para sustituirlo si se sigue arrastrando. */
export interface InsertedReference {
  start: number
  end: number
}

/** Sustituye (o inserta en `at`) la referencia y devuelve el texto nuevo y dónde ha quedado. */
export function writeReference(
  text: string,
  reference: string,
  target: InsertedReference
): { text: string; inserted: InsertedReference } {
  const next = text.slice(0, target.start) + reference + text.slice(target.end)
  return { text: next, inserted: { start: target.start, end: target.start + reference.length } }
}
