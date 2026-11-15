import type { JSONContent } from '@tiptap/core'

/**
 * Documento de Tiptap -> texto plano con marcas ligeras de estructura (estilo Markdown):
 * "#" para títulos y "-" para listas. A un modelo le ayuda mucho saber qué es un título y qué
 * es un punto de una lista, y estas marcas cuestan muy pocos tokens.
 */
export function documentToPlainText(doc: JSONContent): string {
  const blocks: string[] = []
  const visit = (node: JSONContent, listPrefix: string | null) => {
    switch (node.type) {
      case 'heading':
        blocks.push(`${'#'.repeat(Number(node.attrs?.level ?? 1))} ${inlineText(node)}`)
        return
      case 'paragraph': {
        const text = inlineText(node)
        if (text) blocks.push(listPrefix ? `${listPrefix}${text}` : text)
        return
      }
      case 'bulletList':
      case 'orderedList':
        node.content?.forEach((item) => item.content?.forEach((child) => visit(child, '- ')))
        return
      case 'image':
      case 'horizontalRule':
        return
      default:
        node.content?.forEach((child) => visit(child, listPrefix))
    }
  }
  visit(doc, null)
  return blocks.join('\n\n')
}

function inlineText(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return ' '
  return (node.content ?? []).map(inlineText).join('').trim()
}
