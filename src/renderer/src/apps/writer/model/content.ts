import type { JSONContent } from '@tiptap/core'

/** Contenido de un documento de texto tal y como se guarda en disco. */
export interface WriterContent {
  /** Documento en el formato JSON de ProseMirror/Tiptap. */
  doc: JSONContent
}

export function parseWriterContent(raw: unknown): WriterContent {
  const candidate = raw as Partial<WriterContent> | null
  if (!candidate || typeof candidate.doc !== 'object' || candidate.doc?.type !== 'doc') {
    throw new Error('El documento de texto está dañado.')
  }
  return { doc: candidate.doc }
}
