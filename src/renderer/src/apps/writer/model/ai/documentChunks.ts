import type { JSONContent } from '@tiptap/core'
import type { RagChunkInput } from '@shared/ai'

/**
 * Cómo trocea Texto un documento para "Preguntar a tus documentos" (RAG). Decisiones:
 *  - Trozos de párrafos completos de unos 700 caracteres: lo bastante grandes para tener sentido
 *    solos y lo bastante pequeños para que un trozo hable de una sola cosa (eso mejora la búsqueda).
 *  - Cada trozo empieza con su título de sección: "Vacaciones" da contexto a "Son en agosto".
 *  - Un trozo nunca cruza un título: las secciones distintas suelen hablar de cosas distintas.
 *  - La ubicación ("Vacaciones · párrafo 4") es lo que se cita en la respuesta.
 */
export const CHUNK_TARGET_CHARS = 700

export function documentChunks(doc: JSONContent): RagChunkInput[] {
  const chunks: RagChunkInput[] = []
  let heading: string | null = null
  let paragraphNumber = 0
  let buffer: string[] = []
  let firstParagraph = 0

  const flush = () => {
    if (buffer.length === 0) return
    const location = `${heading ? `${heading} · ` : ''}párrafo ${firstParagraph}`
    chunks.push({
      id: `p${firstParagraph}`,
      text: `${heading ? `${heading}\n` : ''}${buffer.join('\n')}`,
      location
    })
    buffer = []
  }

  const addParagraph = (text: string) => {
    paragraphNumber++
    if (!text) return
    if (buffer.length > 0 && buffer.join('\n').length + text.length > CHUNK_TARGET_CHARS) flush()
    if (buffer.length === 0) firstParagraph = paragraphNumber
    buffer.push(text)
  }

  const visit = (node: JSONContent) => {
    switch (node.type) {
      case 'heading':
        flush()
        heading = inlineText(node) || heading
        return
      case 'paragraph':
        addParagraph(inlineText(node))
        return
      case 'image':
      case 'horizontalRule':
        return
      default:
        node.content?.forEach(visit)
    }
  }
  doc.content?.forEach(visit)
  flush()
  return chunks
}

function inlineText(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return ' '
  return (node.content ?? []).map(inlineText).join('').trim()
}

/** Huella del contenido (FNV-1a de 32 bits): si no cambia, no hace falta volver a indexar. */
export function contentFingerprint(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${text.length}-${(hash >>> 0).toString(16)}`
}
