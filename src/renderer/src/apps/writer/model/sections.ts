import { normalizePageSetup, type PageSetup } from './pageSetup'

/**
 * Secciones del documento (fase 15): partes con su propia hoja (tamaño, orientación y márgenes),
 * como "este anexo en horizontal".
 *
 * Igual que en Word, una sección empieza con un salto de sección. A diferencia de Word, el salto
 * guarda la configuración de la sección que **empieza** detrás de él (en .docx, `w:sectPr` describe
 * la que termina). Así se lee como se piensa: "a partir de aquí, horizontal". La primera sección
 * usa la configuración de página del documento (`WriterContent.pageSetup`).
 *
 * Funciones puras sobre la lista de bloques de primer nivel: no dependen de ProseMirror.
 */

export const SECTION_BREAK = 'sectionBreak'

/** Lo mínimo de un bloque de primer nivel que hace falta para repartirlo en secciones. */
export interface BlockLike {
  type: string
  attrs?: Record<string, unknown> | null
}

/** Configuración de un salto de sección, validada. Si el atributo está dañado, la del documento. */
export function sectionBreakSetup(block: BlockLike, fallback: PageSetup): PageSetup {
  return normalizePageSetup(block.attrs?.pageSetup) ?? fallback
}

/**
 * Hoja de cada sección y sección de cada bloque de primer nivel. Los saltos de sección pertenecen
 * a la sección que abren (no ocupan sitio; solo importa dónde están).
 */
export function documentSections(
  blocks: BlockLike[],
  documentSetup: PageSetup
): { setups: PageSetup[]; sectionOf: number[] } {
  const setups = [documentSetup]
  const sectionOf = blocks.map((block) => {
    if (block.type === SECTION_BREAK) setups.push(sectionBreakSetup(block, setups[setups.length - 1]))
    return setups.length - 1
  })
  return { setups, sectionOf }
}

/** ¿Tiene el documento más de una sección? (algunas vistas solo saben pintar un tamaño de hoja). */
export function hasSections(blocks: BlockLike[]): boolean {
  return blocks.some((block) => block.type === SECTION_BREAK)
}
