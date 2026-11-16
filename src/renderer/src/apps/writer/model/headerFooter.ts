import type { HeaderFooter, HeaderFooterSet, WriterParts } from './content'

/**
 * Variantes de encabezado y pie (fase 15), como en Word: el normal, el de la primera hoja
 * ("Primera página diferente") y el de las pares ("Pares e impares diferentes"). Lógica pura.
 */

export type HeaderFooterKind = 'header' | 'footer'
export type HeaderFooterVariant = 'default' | 'first' | 'even'

export const VARIANT_LABELS: Record<HeaderFooterVariant, string> = {
  default: '',
  first: 'primera página',
  even: 'página par'
}

/** Qué variante usa la hoja `page` (desde 1). */
export function variantForPage(parts: WriterParts, page: number): HeaderFooterVariant {
  if (page === 1 && parts.firstPage) return 'first'
  if (page % 2 === 0 && parts.evenPages) return 'even'
  return 'default'
}

/** Encabezado y pie de una variante. */
export function headerFooterOf(parts: WriterParts, variant: HeaderFooterVariant): HeaderFooterSet {
  if (variant === 'first') return parts.firstPage ?? {}
  if (variant === 'even') return parts.evenPages ?? {}
  return { header: parts.header, footer: parts.footer }
}

/** Encabezado y pie que se ven en la hoja `page`. */
export function headerFooterForPage(parts: WriterParts, page: number): HeaderFooterSet {
  return headerFooterOf(parts, variantForPage(parts, page))
}

/** Cambia el encabezado o el pie de una variante; sin valor, lo quita. */
export function withHeaderFooterPart(
  parts: WriterParts,
  variant: HeaderFooterVariant,
  kind: HeaderFooterKind,
  value: HeaderFooter | undefined
): WriterParts {
  if (variant === 'default') {
    const { [kind]: _previous, ...rest } = parts
    return value ? { ...rest, [kind]: value } : rest
  }
  const key = variant === 'first' ? 'firstPage' : 'evenPages'
  const { [kind]: _previous, ...set } = parts[key] ?? {}
  return { ...parts, [key]: value ? { ...set, [kind]: value } : set }
}

/** Enciende o apaga una variante. Al encenderla empieza vacía; al apagarla se olvida. */
export function withVariantEnabled(
  parts: WriterParts,
  variant: Exclude<HeaderFooterVariant, 'default'>,
  enabled: boolean
): WriterParts {
  const key = variant === 'first' ? 'firstPage' : 'evenPages'
  const { [key]: _previous, ...rest } = parts
  return enabled ? { ...rest, [key]: parts[key] ?? {} } : rest
}
