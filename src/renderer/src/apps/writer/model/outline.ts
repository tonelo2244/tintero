/**
 * Esquema del documento: títulos, secciones y cómo moverlas. Es lógica pura sobre la lista de
 * bloques de primer nivel (sin ProseMirror ni DOM), así la usan igual el panel de navegación, la
 * vista Esquema y los comandos, y se prueba con arrays (outline.test.ts).
 *
 * Una "sección" es un título más todo lo que hay debajo hasta el siguiente título de su nivel o
 * superior: lo que Word mueve cuando arrastras un título en el panel de navegación.
 */

/** Un bloque de primer nivel visto desde el esquema: título (con su nivel) o texto normal. */
export interface OutlineBlock {
  /** 1–6 si es un título; `null` si es texto normal (párrafo, lista, tabla...). */
  level: number | null
  text: string
}

/** Un título del documento, para el árbol del panel de navegación. */
export interface OutlineHeading {
  /** Índice del bloque en el documento (hijo de primer nivel). */
  blockIndex: number
  level: number
  text: string
}

export const MAX_HEADING_LEVEL = 6

export function headingsOf(blocks: OutlineBlock[]): OutlineHeading[] {
  return blocks.flatMap((block, blockIndex) =>
    block.level === null ? [] : [{ blockIndex, level: block.level, text: block.text.trim() }]
  )
}

/** Primer bloque que ya no es de la sección que abre `index` (exclusivo). Un texto normal es su propia sección. */
export function sectionEnd(blocks: OutlineBlock[], index: number): number {
  const level = blocks[index]?.level ?? null
  if (level === null) return Math.min(index + 1, blocks.length)
  for (let next = index + 1; next < blocks.length; next++) {
    const nextLevel = blocks[next].level
    if (nextLevel !== null && nextLevel <= level) return next
  }
  return blocks.length
}

/** Título al que pertenece un bloque: él mismo si es título, o el último anterior. `null` antes del primero. */
export function headingIndexAt(blocks: OutlineBlock[], index: number): number | null {
  for (let current = Math.min(index, blocks.length - 1); current >= 0; current--) {
    if (blocks[current].level !== null) return current
  }
  return null
}

/** Un movimiento de bloques: [start, end) pasa a ir delante de `insertAt` (índices de antes de mover). */
export interface BlockMove {
  start: number
  end: number
  insertAt: number
}

/**
 * Mover la sección que abre `index` delante del bloque `insertAt` (`blocks.length` = al final).
 * `null` si no cambia nada o si el destino está dentro de la propia sección (no se puede meter una
 * sección dentro de sí misma).
 */
export function planSectionMove(blocks: OutlineBlock[], index: number, insertAt: number): BlockMove | null {
  if (index < 0 || index >= blocks.length || insertAt < 0 || insertAt > blocks.length) return null
  const end = sectionEnd(blocks, index)
  if (insertAt >= index && insertAt <= end) return null
  return { start: index, end, insertAt }
}

/**
 * Subir la sección (o el bloque) un puesto, como "Mover arriba" de Word: un título salta por encima
 * del título anterior de su nivel o superior; un texto normal, por encima del bloque anterior.
 */
export function planMoveUp(blocks: OutlineBlock[], index: number): BlockMove | null {
  const level = blocks[index]?.level ?? null
  if (level === null) return index > 0 ? planSectionMove(blocks, index, index - 1) : null
  for (let previous = index - 1; previous >= 0; previous--) {
    const previousLevel = blocks[previous].level
    if (previousLevel !== null && previousLevel <= level) return planSectionMove(blocks, index, previous)
  }
  return null
}

/** Bajar la sección (o el bloque) un puesto: salta por detrás de la sección siguiente. */
export function planMoveDown(blocks: OutlineBlock[], index: number): BlockMove | null {
  const end = sectionEnd(blocks, index)
  if (end >= blocks.length) return null
  // Un texto normal baja de uno en uno; un título salta la sección entera que tiene detrás.
  const after = blocks[index]?.level === null ? end + 1 : sectionEnd(blocks, end)
  return planSectionMove(blocks, index, after)
}

/** El orden de los bloques después de un movimiento (para pruebas y para quien trabaje con arrays). */
export function applyMove<T>(items: T[], move: BlockMove): T[] {
  const moved = items.slice(move.start, move.end)
  const rest = [...items.slice(0, move.start), ...items.slice(move.end)]
  const target = move.insertAt > move.start ? move.insertAt - moved.length : move.insertAt
  return [...rest.slice(0, target), ...moved, ...rest.slice(target)]
}

/**
 * Qué bloques se esconden en la vista Esquema: los que están dentro de un título plegado y, si se
 * pide "Mostrar nivel N", el texto normal y los títulos de nivel mayor que N.
 */
export function hiddenBlocks(
  blocks: OutlineBlock[],
  collapsed: ReadonlySet<number>,
  showLevel: number | null
): boolean[] {
  const hidden = blocks.map((block) => showLevel !== null && (block.level === null || block.level > showLevel))
  collapsed.forEach((index) => {
    if (blocks[index]?.level == null) return
    for (let inner = index + 1; inner < sectionEnd(blocks, index); inner++) hidden[inner] = true
  })
  return hidden
}

/** ¿Tiene algo debajo este título? (si no, el triángulo de plegar no pinta nada) */
export function hasSectionBody(blocks: OutlineBlock[], index: number): boolean {
  return blocks[index]?.level != null && sectionEnd(blocks, index) > index + 1
}
