import type { RibbonTab } from '@/ui/EditorLayout'

/**
 * Pestañas de la cinta de Texto, como datos. Una pestaña solo aparece cuando tiene al menos un
 * grupo que funciona (ningún botón muerto): las de Word que aún no existen aquí, no se enseñan.
 */
export const WRITER_TABS: RibbonTab[] = [
  { id: 'home', label: 'Inicio' },
  { id: 'insert', label: 'Insertar' },
  { id: 'layout', label: 'Disposición' },
  { id: 'assistant', label: 'Asistente' }
]

/** Pestaña contextual: solo existe mientras el cursor está dentro de una tabla. */
export const TABLE_TAB: RibbonTab = { id: 'table', label: 'Tabla' }

export function visibleTabs(inTable: boolean): RibbonTab[] {
  return inTable ? [...WRITER_TABS, TABLE_TAB] : WRITER_TABS
}
