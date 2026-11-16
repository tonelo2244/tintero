/**
 * Títulos (leyendas) numerados y referencias cruzadas (fase 17).
 *
 * Un título es un párrafo con el estilo "Descripción" (`caption`) que lleva dentro un campo de
 * secuencia (`sequence`, el SEQ de Word) con su rótulo: "Figura ", la secuencia y ": texto". El
 * número no se guarda: se cuenta por orden en el documento, así que insertar una figura delante
 * renumera las siguientes (y las referencias cruzadas que las nombran).
 *
 * El destino de una referencia cruzada es un marcador oculto (`_Ref…`, como los de Word) al
 * principio del título o del encabezado: así sobrevive a cambios de texto y viaja al .docx.
 */

export const SEQUENCE = 'sequence'
export const CROSS_REFERENCE = 'crossReference'
export const CAPTION_STYLE_ID = 'caption'

/** Rótulos de Word en español. Se pueden crear otros ("Gráfico", "Mapa"...). */
export const CAPTION_LABELS = ['Figura', 'Tabla', 'Ecuación'] as const

/** Un rótulo válido para Word (es el nombre de la secuencia, sin espacios). */
export function isValidCaptionLabel(label: string): boolean {
  return /^\p{L}[\p{L}\p{N}_]{0,29}$/u.test(label)
}

/** Separador entre "Figura 3" y el texto, como en Word. */
export const CAPTION_SEPARATOR = ': '

/** Número de cada secuencia, en orden, contando cada rótulo por separado. */
export function sequenceNumbers(labels: readonly string[]): number[] {
  const counters = new Map<string, number>()
  return labels.map((label) => {
    const next = (counters.get(label) ?? 0) + 1
    counters.set(label, next)
    return next
  })
}

/** Lo que se puede citar con una referencia cruzada. */
export type ReferenceKind = 'heading' | 'caption' | 'bookmark'

export interface ReferenceTarget {
  kind: ReferenceKind
  /** Marcador al que apunta la referencia (el `_Ref…` del título, o el nombre del marcador). */
  anchor: string
  /** Posición en el documento (para la hoja y para "más arriba / más abajo"). */
  pos: number
  /** Texto entero: el del encabezado o "Figura 3: Mapa de la zona". */
  text: string
  /** Solo de los títulos: rótulo, número y texto sin rótulo ni número. */
  label?: string
  number?: number
  captionText?: string
  /** Nivel del encabezado (1–6). */
  level?: number
}

/**
 * Qué escribe una referencia cruzada, con los nombres de Word: título completo ("Figura 3: Mapa"),
 * solo rótulo y número ("Figura 3"), solo el texto ("Mapa"), número de página o "más arriba / más
 * abajo" según dónde esté respecto a la referencia.
 */
export type CrossReferenceShow = 'text' | 'labelNumber' | 'captionText' | 'page' | 'position'

export const CROSS_REFERENCE_SHOW: Record<ReferenceKind, { show: CrossReferenceShow; label: string }[]> = {
  heading: [
    { show: 'text', label: 'Texto del título' },
    { show: 'page', label: 'Número de página' },
    { show: 'position', label: 'Más arriba o más abajo' }
  ],
  caption: [
    { show: 'text', label: 'Título completo' },
    { show: 'labelNumber', label: 'Solo rótulo y número' },
    { show: 'captionText', label: 'Solo texto del título' },
    { show: 'page', label: 'Número de página' },
    { show: 'position', label: 'Más arriba o más abajo' }
  ],
  bookmark: [
    { show: 'page', label: 'Número de página' },
    { show: 'position', label: 'Más arriba o más abajo' }
  ]
}

export const isCrossReferenceShow = (value: unknown): value is CrossReferenceShow =>
  value === 'text' || value === 'labelNumber' || value === 'captionText' || value === 'page' || value === 'position'

/** Texto de una referencia cruzada. Sin destino (se borró), el aviso de Word. */
export function crossReferenceText(
  show: CrossReferenceShow,
  target: ReferenceTarget | null,
  context: { referencePos: number; page: number }
): string {
  if (!target) return '¡Error! No se encuentra el origen de la referencia.'
  switch (show) {
    case 'text':
      return target.text
    case 'labelNumber':
      return target.label && target.number ? `${target.label} ${target.number}` : target.text
    case 'captionText':
      return target.captionText ?? target.text
    case 'page':
      return String(context.page)
    case 'position':
      return target.pos < context.referencePos ? 'más arriba' : 'más abajo'
  }
}

/**
 * Nombre nuevo para el marcador oculto de un destino: "_Ref" y nueve cifras, como los de Word (así
 * Word los reconoce y los esconde también). `random` se inyecta para poder probarlo.
 */
export function newReferenceAnchor(existing: ReadonlySet<string>, random: () => number = Math.random): string {
  for (;;) {
    const digits = String(Math.floor(random() * 1e9)).padStart(9, '0')
    const name = `_Ref${digits}`
    if (!existing.has(name)) return name
  }
}

export const isReferenceAnchor = (name: string) => /^_(Ref|Toc)\d+$/.test(name)
