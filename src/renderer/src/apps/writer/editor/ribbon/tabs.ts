import type { RibbonTab } from '@/ui/EditorLayout'

/**
 * Pestañas de la cinta de Texto, como datos. Una pestaña solo aparece cuando tiene al menos un
 * grupo que funciona (ningún botón muerto): las de Word que aún no existen aquí, no se enseñan.
 */
export const WRITER_TABS: RibbonTab[] = [
  { id: 'home', label: 'Inicio' },
  { id: 'insert', label: 'Insertar' },
  { id: 'layout', label: 'Disposición' },
  { id: 'review', label: 'Revisar' },
  { id: 'view', label: 'Vista' },
  { id: 'assistant', label: 'Asistente' }
]

/** Pestaña contextual: solo existe mientras el cursor está dentro de una tabla. */
export const TABLE_TAB: RibbonTab = { id: 'table', label: 'Tabla' }

/** Pestaña contextual: solo existe en la vista Esquema. */
export const OUTLINE_TAB: RibbonTab = { id: 'outline', label: 'Esquema' }

/** Pestaña contextual: solo existe mientras se edita el encabezado o el pie sobre la hoja. */
export const HEADER_FOOTER_TAB: RibbonTab = { id: 'headerFooter', label: 'Encabezado y pie' }

export function visibleTabs(inTable: boolean, inOutline = false, inHeaderFooter = false): RibbonTab[] {
  return [
    ...(inOutline ? [OUTLINE_TAB] : []),
    ...WRITER_TABS,
    ...(inTable ? [TABLE_TAB] : []),
    ...(inHeaderFooter ? [HEADER_FOOTER_TAB] : [])
  ]
}
