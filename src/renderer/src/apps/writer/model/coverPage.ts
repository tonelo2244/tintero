import type { JSONContent } from '@tiptap/core'

/**
 * Portada (fase 16): una primera hoja con título, subtítulo, autor y fecha, y un salto de página.
 * Son párrafos normales con los estilos Título y Subtítulo y dos campos, así que se editan como el
 * resto y van igual al .docx. El autor y la fecha son campos: se rellenan solos.
 */

const centered = (attrs: Record<string, unknown>, content?: JSONContent[]): JSONContent => ({
  type: 'paragraph',
  attrs: { textAlign: 'center', ...attrs },
  ...(content && { content })
})

export function coverPageContent(title = 'Título del documento', subtitle = 'Subtítulo'): JSONContent[] {
  return [
    // El título baja hacia el tercio de la hoja, como en las portadas sencillas de Word.
    centered({ blockStyle: 'title', spaceBefore: 160 }, [{ type: 'text', text: title }]),
    centered({ blockStyle: 'subtitle' }, [{ type: 'text', text: subtitle }]),
    centered({ spaceBefore: 220 }, [{ type: 'field', attrs: { kind: 'author' } }]),
    centered({}, [{ type: 'field', attrs: { kind: 'date' } }]),
    { type: 'pageBreak' }
  ]
}

/** ¿El documento ya empieza por una portada? (para no poner dos). */
export function startsWithCoverPage(doc: JSONContent): boolean {
  const [first, second] = doc.content ?? []
  return first?.attrs?.blockStyle === 'title' && second?.attrs?.blockStyle === 'subtitle'
}
