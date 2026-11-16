import type { RibbonTab } from '@/ui/EditorLayout'
import type { ObjectType } from '../../model/objectEdits'

/**
 * Pestañas de la cinta de Texto, como datos. Una pestaña solo aparece cuando tiene al menos un
 * grupo que funciona (ningún botón muerto): las de Word que aún no existen aquí, no se enseñan.
 */
export const WRITER_TABS: RibbonTab[] = [
  { id: 'home', label: 'Inicio' },
  { id: 'insert', label: 'Insertar' },
  { id: 'layout', label: 'Disposición' },
  { id: 'references', label: 'Referencias' },
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

/**
 * Pestaña contextual de objetos (fase 16): solo existe con una imagen, forma, cuadro de texto o
 * gráfico seleccionado. Tiene un id para todos y el nombre de lo seleccionado.
 */
export const OBJECT_TAB_ID = 'object'
const OBJECT_TAB_LABELS: Record<ObjectType, string> = {
  image: 'Imagen',
  shape: 'Forma',
  textBox: 'Cuadro de texto',
  chart: 'Gráfico'
}
export const objectTab = (type: ObjectType): RibbonTab => ({ id: OBJECT_TAB_ID, label: OBJECT_TAB_LABELS[type] })

export function visibleTabs(
  inTable: boolean,
  inOutline = false,
  inHeaderFooter = false,
  object: ObjectType | null = null
): RibbonTab[] {
  return [
    ...(inOutline ? [OUTLINE_TAB] : []),
    ...WRITER_TABS,
    ...(inTable ? [TABLE_TAB] : []),
    ...(inHeaderFooter ? [HEADER_FOOTER_TAB] : []),
    ...(object ? [objectTab(object)] : [])
  ]
}
