import type { JSONContent } from '@tiptap/core'

/** Píxeles de pantalla (96 ppp) -> twips de Word (1/1440 de pulgada). */
export const TWIPS_PER_PX = 15

/**
 * Anchos de las columnas de una tabla de Tiptap, en píxeles o `null` si el usuario no la ha
 * redimensionado. Tiptap guarda el ancho en cada celda (`colwidth`, una entrada por columna que
 * ocupa), así que basta con leer la primera fila.
 */
export function readColumnWidths(table: JSONContent): (number | null)[] {
  const firstRow = table.content?.[0]?.content ?? []
  return firstRow.flatMap((cell) => {
    const span = Math.max(1, Number(cell.attrs?.colspan) || 1)
    const widths = Array.isArray(cell.attrs?.colwidth) ? (cell.attrs.colwidth as unknown[]) : []
    return Array.from({ length: span }, (_, index) => {
      const width = Number(widths[index])
      return width > 0 ? width : null
    })
  })
}

/**
 * Reparte el ancho útil de la página entre las columnas, como hace el editor en pantalla:
 * las columnas con ancho fijo lo conservan y el resto se reparten lo que sobra a partes iguales.
 * Si las fijas no caben, todo se escala para que la tabla no se salga del margen.
 */
export function columnWidthsTwips(widthsPx: (number | null)[], availableTwips: number): number[] {
  if (widthsPx.length === 0) return []
  const fixed = widthsPx.map((width) => (width === null ? null : width * TWIPS_PER_PX))
  const fixedTotal = fixed.reduce<number>((sum, width) => sum + (width ?? 0), 0)
  const flexibleCount = fixed.filter((width) => width === null).length

  // Una columna flexible nunca baja de ~1 cm, aunque las fijas ocupen casi todo.
  const minFlexible = 567
  const flexibleWidth = flexibleCount > 0 ? Math.max(minFlexible, (availableTwips - fixedTotal) / flexibleCount) : 0
  const widths = fixed.map((width) => width ?? flexibleWidth)

  const total = widths.reduce((sum, width) => sum + width, 0)
  const scale = total > availableTwips ? availableTwips / total : 1
  return widths.map((width) => Math.round(width * scale))
}
