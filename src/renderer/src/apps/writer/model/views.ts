/**
 * Vistas del documento (Vista > Vistas, como en Word). Todas enseñan el mismo documento; cambia
 * cómo se pinta. Ninguna se guarda en el archivo: es una preferencia de la pantalla.
 */
export type ViewMode = 'print' | 'draft' | 'outline' | 'read'

export const VIEW_MODES: { id: ViewMode; label: string; description: string }[] = [
  { id: 'read', label: 'Modo lectura', description: 'Sin cinta y con una columna cómoda para leer' },
  { id: 'print', label: 'Diseño de impresión', description: 'Las hojas tal como se imprimen' },
  { id: 'draft', label: 'Borrador', description: 'El texto seguido, sin hojas' },
  { id: 'outline', label: 'Esquema', description: 'Títulos que se pliegan y secciones que se mueven' }
]

export const viewModeLabel = (mode: ViewMode) => VIEW_MODES.find((view) => view.id === mode)?.label ?? mode

/** Solo Diseño de impresión reparte el texto en hojas. */
export const isPaginated = (mode: ViewMode) => mode === 'print'

/** La regla tiene sentido donde hay márgenes de página: impresión y borrador. */
export const showsRuler = (mode: ViewMode) => mode === 'print' || mode === 'draft'

/** Colores del modo lectura. */
export type ReadingTheme = 'light' | 'sepia' | 'dark'
export const READING_THEMES: { id: ReadingTheme; label: string }[] = [
  { id: 'light', label: 'Claro' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'dark', label: 'Oscuro' }
]
