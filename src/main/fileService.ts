import { promises as fs } from 'node:fs'
import { dirname, join, basename } from 'node:path'

/**
 * Escritura atómica: primero a un archivo temporal y luego `rename`.
 * Si la app se cierra a mitad de guardado, el documento original no se corrompe.
 */
export async function writeFileAtomic(filePath: string, contents: string | Uint8Array): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true })
  const tempPath = join(dirname(filePath), `.${basename(filePath)}.${process.pid}.tmp`)
  // Texto (nuestros .tdoc/.tpres) o binario (PDF, .docx, .pptx): el mismo camino seguro para todos.
  await fs.writeFile(tempPath, contents, typeof contents === 'string' ? 'utf8' : undefined)
  await fs.rename(tempPath, filePath)
}

export async function readTextFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8')
}

/** Garantiza que la ruta termina con una de las extensiones permitidas. */
export function ensureExtension(filePath: string, extensions: string[]): string {
  if (extensions.length === 0) return filePath
  const lower = filePath.toLowerCase()
  const hasValidExtension = extensions.some((ext) => lower.endsWith(`.${ext.toLowerCase()}`))
  return hasValidExtension ? filePath : `${filePath}.${extensions[0]}`
}
