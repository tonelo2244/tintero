/**
 * Formato de archivo común a todas las apps de la suite.
 * Un "sobre" (envelope) con metadatos + el contenido propio de cada app.
 * Versionar desde el día 1 permite migrar archivos antiguos en el futuro.
 */

export const FILE_FORMAT_ID = 'tintero'
/**
 * Historial de versiones del sobre:
 *   1. Primera versión.
 *   2. Diapositivas: los cuadros de texto guardan párrafos con formato por palabra en vez de
 *      texto plano. Cada app migra su contenido en `parseContent` (ver apps/slides/model/content.ts).
 *   3. Diapositivas: grupos de elementos, alineación y viñeta por párrafo y transiciones. Son campos
 *      nuevos y opcionales, así que un archivo de la versión 2 se lee tal cual (no hay migración);
 *      subir la versión sirve para lo contrario: que un Tintero anterior, que no sabría pintar un
 *      grupo, diga "versión más nueva" en lugar de abrir la presentación a medias.
 *   4. Texto: configuración de página (`pageSetup`: tamaño, orientación y márgenes) y saltos de
 *      página. Igual que en la 3, campos opcionales sin migración: un documento sin `pageSetup` es
 *      A4 con 2,5 cm, que es lo que siempre fue.
 *   5. Texto: estilos del documento (`styles`, `numberedHeadings`), tabuladores y nuevos atributos
 *      de párrafo (espaciado, bordes, sombreado, topes) y de lista (viñeta, formato de número).
 *      Sin migración: un documento sin `styles` usa los de partida, que reproducen su aspecto.
 */
export const FILE_FORMAT_VERSION = 5

export interface DocumentEnvelope<TContent = unknown> {
  format: typeof FILE_FORMAT_ID
  version: number
  appId: string
  savedAt: string
  content: TContent
}

export class InvalidDocumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidDocumentError'
  }
}

export function serializeDocument<T>(appId: string, content: T, now: Date = new Date()): string {
  const envelope: DocumentEnvelope<T> = {
    format: FILE_FORMAT_ID,
    version: FILE_FORMAT_VERSION,
    appId,
    savedAt: now.toISOString(),
    content
  }
  return JSON.stringify(envelope, null, 2)
}

export function parseDocument(raw: string): DocumentEnvelope {
  // Algunos editores de texto añaden una marca BOM al inicio y JSON.parse la rechaza.
  const text = raw.replace(/^\uFEFF/, '')
  if (text.trim() === '') {
    throw new InvalidDocumentError('El archivo está vacío.')
  }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new InvalidDocumentError('El archivo no es un documento válido (JSON corrupto).')
  }

  if (!isEnvelope(data)) {
    throw new InvalidDocumentError('El archivo no pertenece a esta aplicación.')
  }
  if (data.version > FILE_FORMAT_VERSION) {
    throw new InvalidDocumentError('El archivo se creó con una versión más nueva de la aplicación.')
  }
  return data
}

function isEnvelope(value: unknown): value is DocumentEnvelope {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    candidate.format === FILE_FORMAT_ID &&
    typeof candidate.version === 'number' &&
    typeof candidate.appId === 'string' &&
    'content' in candidate
  )
}

/** "C:\\docs\\informe.tdoc" o "/Users/x/informe.tdoc" -> "informe" */
export function displayNameFromPath(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? filePath
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}
