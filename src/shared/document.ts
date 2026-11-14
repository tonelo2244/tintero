/**
 * Formato de archivo común a todas las apps de la suite.
 * Un "sobre" (envelope) con metadatos + el contenido propio de cada app.
 * Versionar desde el día 1 permite migrar archivos antiguos en el futuro.
 */

export const FILE_FORMAT_ID = 'tintero'
export const FILE_FORMAT_VERSION = 1

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
  let data: unknown
  try {
    data = JSON.parse(raw)
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
