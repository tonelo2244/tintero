import type { ReferenceTarget } from './captions'

/**
 * Tabla de contenido e índice de ilustraciones (fase 17). Un solo nodo de bloque (`tableOfContents`)
 * sirve para las dos: con `source: 'headings'` lista los encabezados hasta un nivel; con un rótulo
 * ("Figura", "Tabla"...) lista los títulos de ese rótulo.
 *
 * Como en Word, el texto de la tabla es una foto que se actualiza con "Actualizar tabla"; los
 * números de página sí se pintan siempre al día (la paginación los sabe en cada momento), así que
 * nunca se imprime una tabla con páginas viejas. La foto es lo que va al .docx.
 */

export const TOC = 'tableOfContents'

export const TOC_HEADINGS = 'headings'

/** Encabezados o el rótulo de un índice de ilustraciones. */
export type TocSource = string

export interface TocEntry {
  /** Nivel de sangría: el del encabezado (1–6); 1 en un índice de ilustraciones. */
  level: number
  text: string
  /** Marcador oculto del destino (vínculo y número de página). */
  anchor: string
  /** Página cuando se actualizó la tabla (la que se escribe en el .docx). */
  page: number
}

export const TOC_LEVELS = [1, 2, 3, 4, 5, 6] as const
export const DEFAULT_TOC_LEVELS = 3

export const isHeadingsToc = (source: unknown) => source === TOC_HEADINGS || source == null

/** ¿Sale este destino en la tabla? Encabezados con texto hasta el nivel, o títulos del rótulo. */
export function tocIncludes(target: ReferenceTarget, source: TocSource, levels: number): boolean {
  return isHeadingsToc(source)
    ? target.kind === 'heading' && (target.level ?? 1) <= levels && target.text.trim() !== ''
    : target.kind === 'caption' && target.label === source
}

/** Entradas de la tabla a partir de los destinos del documento, en orden. */
export function tocEntries(
  targets: readonly ReferenceTarget[],
  source: TocSource,
  levels: number,
  pageOf: (pos: number) => number
): TocEntry[] {
  const included = targets.filter((target) => tocIncludes(target, source, levels))
  return included.map((target) => ({
    level: isHeadingsToc(source) ? (target.level ?? 1) : 1,
    text: target.text.trim(),
    anchor: target.anchor,
    page: pageOf(target.pos)
  }))
}

/** ¿La tabla dice lo mismo que diría ahora? Las páginas no cuentan: esas se pintan siempre al día. */
export function sameTocText(a: readonly TocEntry[], b: readonly TocEntry[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (entry, index) =>
        entry.text === b[index].text && entry.level === b[index].level && entry.anchor === b[index].anchor
    )
  )
}

/** Entradas guardadas en el archivo: se valida cada una y se descartan las que no tienen forma. */
export function normalizeTocEntries(raw: unknown): TocEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((candidate: Partial<TocEntry> | null) =>
    candidate &&
    typeof candidate.text === 'string' &&
    typeof candidate.anchor === 'string' &&
    Number.isFinite(candidate.level)
      ? [
          {
            level: Math.min(6, Math.max(1, Math.round(Number(candidate.level)))),
            text: candidate.text,
            anchor: candidate.anchor,
            page: Number.isFinite(candidate.page) ? Number(candidate.page) : 1
          }
        ]
      : []
  )
}

/** Título que se pinta encima de la tabla. */
export function tocTitle(source: TocSource): string {
  return isHeadingsToc(source)
    ? 'Contenido'
    : `Índice de ${source === 'Tabla' ? 'tablas' : source === 'Figura' ? 'figuras' : source.toLowerCase()}`
}
