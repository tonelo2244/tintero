/**
 * Objetos del documento (fase 16): imágenes, formas, cuadros de texto y gráficos comparten cómo se
 * colocan respecto al texto. Aquí está esa parte común, sin pantalla: qué opciones hay, qué CSS
 * les corresponde y cómo cambia el orden (traer adelante, enviar atrás).
 *
 * Modelo: un objeto va siempre anclado a un sitio del texto (un nodo del documento, como en Word
 * va anclado a un párrafo). El ajuste decide cómo se aparta el texto:
 *   - en línea: como una letra grande, en el renglón;
 *   - cuadrado: flota a un lado y el texto lo rodea;
 *   - arriba y abajo: ocupa su propia franja, sin texto a los lados;
 *   - detrás / delante del texto: no aparta nada; se mueve libremente desde el ancla.
 */

export type WrapMode = 'inline' | 'square' | 'topBottom' | 'behind' | 'front'
export type ObjectAlign = 'left' | 'center' | 'right'

export const WRAP_MODES: { mode: WrapMode; label: string }[] = [
  { mode: 'inline', label: 'En línea con el texto' },
  { mode: 'square', label: 'Cuadrado' },
  { mode: 'topBottom', label: 'Arriba y abajo' },
  { mode: 'behind', label: 'Detrás del texto' },
  { mode: 'front', label: 'Delante del texto' }
]

export const OBJECT_ALIGNS: { align: ObjectAlign; label: string }[] = [
  { align: 'left', label: 'Alinear a la izquierda' },
  { align: 'center', label: 'Centrar' },
  { align: 'right', label: 'Alinear a la derecha' }
]

/** Atributos de colocación que llevan todos los objetos (con estos valores por defecto). */
export interface ObjectPlacement {
  wrap: WrapMode
  align: ObjectAlign
  /** Desplazamiento desde el ancla en px, solo con "detrás" o "delante" del texto. */
  offsetX: number
  offsetY: number
  /** Orden entre objetos que se tapan: más alto, más delante. */
  zIndex: number
}

export const DEFAULT_PLACEMENT: ObjectPlacement = { wrap: 'inline', align: 'left', offsetX: 0, offsetY: 0, zIndex: 0 }

export const isWrapMode = (value: unknown): value is WrapMode => WRAP_MODES.some((option) => option.mode === value)
export const isObjectAlign = (value: unknown): value is ObjectAlign =>
  OBJECT_ALIGNS.some((option) => option.align === value)

/** Lee la colocación de los atributos de un nodo, con los valores por defecto donde falten. */
export function placementOf(attrs: Record<string, unknown>): ObjectPlacement {
  const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  return {
    wrap: isWrapMode(attrs.wrap) ? attrs.wrap : DEFAULT_PLACEMENT.wrap,
    align: isObjectAlign(attrs.align) ? attrs.align : DEFAULT_PLACEMENT.align,
    offsetX: number(attrs.offsetX),
    offsetY: number(attrs.offsetY),
    zIndex: Math.round(number(attrs.zIndex))
  }
}

/** ¿El objeto está fuera del flujo del texto (se puede arrastrar a cualquier sitio)? */
export const isFreePlacement = (wrap: WrapMode) => wrap === 'behind' || wrap === 'front'

/** Separación entre el objeto y el texto que lo rodea (unos 0,3 cm, como Word). */
export const WRAP_DISTANCE_PX = 12

/**
 * Estilo en línea del objeto según su colocación. Se escribe en el propio elemento (no en una
 * clase por modo) porque desplazamiento y orden son números de cada objeto.
 *
 * "Detrás" y "delante" usan `position: absolute` SIN `top`/`left`: así el objeto sale de su
 * posición estática (donde está el ancla) y el desplazamiento va como margen. Si el texto de antes
 * crece, el objeto baja con él, que es justo lo que hace un objeto anclado a un párrafo.
 */
export function placementStyle(placement: ObjectPlacement): Record<string, string> {
  const px = (value: number) => `${Math.round(value)}px`
  switch (placement.wrap) {
    case 'inline':
      return {}
    case 'square':
      // Centrado no es un cuadrado (no puede haber texto a los dos lados de un flotante): va arriba y abajo.
      if (placement.align === 'center') return { display: 'block', margin: `${px(WRAP_DISTANCE_PX / 2)} auto` }
      return placement.align === 'right'
        ? { float: 'right', margin: `0 0 ${px(WRAP_DISTANCE_PX / 2)} ${px(WRAP_DISTANCE_PX)}` }
        : { float: 'left', margin: `0 ${px(WRAP_DISTANCE_PX)} ${px(WRAP_DISTANCE_PX / 2)} 0` }
    case 'topBottom': {
      // Su propia franja: arriba y abajo un poco de aire; a los lados, lo que lo alinea.
      const gap = px(WRAP_DISTANCE_PX / 2)
      const sides = { left: '0 auto 0 0', center: '0 auto', right: '0 0 0 auto' }[placement.align]
      return { display: 'block', margin: sides, 'margin-top': gap, 'margin-bottom': gap }
    }
    case 'behind':
    case 'front':
      return {
        position: 'absolute',
        'margin-left': px(placement.offsetX),
        'margin-top': px(placement.offsetY),
        // Detrás: por debajo del texto (el contenido del editor es su propio contexto de apilado).
        'z-index': String(placement.wrap === 'behind' ? placement.zIndex - 1000 : placement.zIndex + 1)
      }
  }
}

/** `{ float: 'left' }` -> `float: left;` para el atributo `style`. */
export const styleText = (style: Record<string, string>) =>
  Object.entries(style)
    .map(([property, value]) => `${property}: ${value};`)
    .join(' ')

export type ArrangeAction = 'forward' | 'backward' | 'front' | 'back'

/**
 * Nuevo orden de un objeto entre los demás (`others`, sus zIndex). Adelante/atrás pasa por encima
 * (o por debajo) del siguiente; al frente/al fondo, de todos.
 */
export function arrangeZIndex(current: number, others: readonly number[], action: ArrangeAction): number {
  const above = others.filter((z) => z >= current)
  const below = others.filter((z) => z <= current)
  switch (action) {
    case 'front':
      return others.length > 0 ? Math.max(current, Math.max(...others) + 1) : current
    case 'back':
      return others.length > 0 ? Math.min(current, Math.min(...others) - 1) : current
    case 'forward':
      return above.length > 0 ? Math.min(...above) + 1 : current
    case 'backward':
      return below.length > 0 ? Math.max(...below) - 1 : current
  }
}

/**
 * Tamaño nuevo al cambiar uno de los lados. Con la proporción bloqueada (imágenes), el otro lado
 * lo sigue. Nunca menos de 8 px: un objeto invisible ya no se podría seleccionar.
 */
export function resizeKeepingRatio(
  size: { width: number; height: number },
  change: { width?: number; height?: number },
  keepRatio: boolean
): { width: number; height: number } {
  const ratio = size.height > 0 ? size.width / size.height : 1
  const minimum = 8
  if (change.width !== undefined) {
    const width = Math.max(minimum, Math.round(change.width))
    return { width, height: keepRatio ? Math.max(minimum, Math.round(width / ratio)) : size.height }
  }
  if (change.height !== undefined) {
    const height = Math.max(minimum, Math.round(change.height))
    return { width: keepRatio ? Math.max(minimum, Math.round(height * ratio)) : size.width, height }
  }
  return size
}

/** Grados normalizados a [0, 360). Girar 90° a la izquierda desde 0 da 270. */
export const normalizeRotation = (degrees: number) => ((Math.round(degrees) % 360) + 360) % 360

/** Recorte de una imagen: porcentaje (0-100) que se quita de cada lado, como en Word. */
export interface ImageCrop {
  top: number
  right: number
  bottom: number
  left: number
}

export const NO_CROP: ImageCrop = { top: 0, right: 0, bottom: 0, left: 0 }

/** Recorte válido: cada lado entre 0 y 95 % y siempre queda al menos un 5 % de imagen. */
export function normalizeCrop(raw: unknown): ImageCrop {
  const candidate = (raw ?? {}) as Partial<Record<keyof ImageCrop, unknown>>
  const side = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(95, Math.max(0, value)) : 0
  const crop = {
    top: side(candidate.top),
    right: side(candidate.right),
    bottom: side(candidate.bottom),
    left: side(candidate.left)
  }
  if (crop.left + crop.right > 95) crop.right = 95 - crop.left
  if (crop.top + crop.bottom > 95) crop.bottom = 95 - crop.top
  return crop
}

export const hasCrop = (crop: ImageCrop) => crop.top + crop.right + crop.bottom + crop.left > 0

/**
 * Cómo se pinta una imagen recortada dentro de su marco: la imagen entera, más grande que el marco
 * y desplazada, con lo que sobra oculto. `frame` es el tamaño que ocupa en el documento.
 */
export function croppedImageBox(
  frame: { width: number; height: number },
  crop: ImageCrop
): { width: number; height: number; left: number; top: number } {
  const visibleX = 1 - (crop.left + crop.right) / 100
  const visibleY = 1 - (crop.top + crop.bottom) / 100
  const width = frame.width / visibleX
  const height = frame.height / visibleY
  return { width, height, left: -(width * crop.left) / 100, top: -(height * crop.top) / 100 }
}

/**
 * Marco de la imagen tras cambiar el recorte, como en Word: la imagen no cambia de escala, así que
 * recortar un lado hace el marco más pequeño (y quitar el recorte lo devuelve a su tamaño).
 */
export function frameAfterCrop(
  frame: { width: number; height: number },
  previous: ImageCrop,
  next: ImageCrop
): { width: number; height: number } {
  const full = croppedImageBox(frame, previous)
  return {
    width: Math.max(8, Math.round(full.width * (1 - (next.left + next.right) / 100))),
    height: Math.max(8, Math.round(full.height * (1 - (next.top + next.bottom) / 100)))
  }
}
