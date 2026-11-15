/**
 * Nombres de las funciones en inglés (forma canónica, la que se guarda y la que usa .xlsx)
 * y en español (la que ve el usuario). Es el mismo par de nombres que usa Excel en español.
 *
 * Vive aparte de las implementaciones (functions.ts) para que el parser y el traductor
 * no dependan del evaluador.
 */
export const SPANISH_FUNCTION_NAMES: Record<string, string> = {
  SUM: 'SUMA',
  AVERAGE: 'PROMEDIO',
  MIN: 'MIN',
  MAX: 'MAX',
  COUNT: 'CONTAR',
  COUNTA: 'CONTARA',
  PRODUCT: 'PRODUCTO',
  SUMIF: 'SUMAR.SI',
  COUNTIF: 'CONTAR.SI',
  IF: 'SI',
  IFERROR: 'SI.ERROR',
  AND: 'Y',
  OR: 'O',
  NOT: 'NO',
  ROUND: 'REDONDEAR',
  ABS: 'ABS',
  INT: 'ENTERO',
  MOD: 'RESIDUO',
  POWER: 'POTENCIA',
  SQRT: 'RAIZ',
  CONCATENATE: 'CONCATENAR',
  CONCAT: 'CONCAT',
  LEN: 'LARGO',
  UPPER: 'MAYUSC',
  LOWER: 'MINUSC',
  TRIM: 'ESPACIOS',
  LEFT: 'IZQUIERDA',
  RIGHT: 'DERECHA',
  VLOOKUP: 'BUSCARV'
}

const CANONICAL_BY_SPANISH = new Map(Object.entries(SPANISH_FUNCTION_NAMES).map(([en, es]) => [es, en]))

/** "SUMA" -> "SUM", "sum" -> "SUM". Un nombre desconocido se devuelve en mayúsculas, sin traducir. */
export function canonicalFunctionName(name: string): string {
  const upper = name.toUpperCase()
  return CANONICAL_BY_SPANISH.get(upper) ?? upper
}

/** "SUM" -> "SUMA". */
export function localizedFunctionName(canonical: string): string {
  return SPANISH_FUNCTION_NAMES[canonical] ?? canonical
}
