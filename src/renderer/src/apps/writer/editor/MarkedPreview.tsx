import type { ReactNode } from 'react'
import { markedToInline } from '../model/ai/inlineMarks'
import { splitParagraphs } from '../model/ai/writingActions'

const TAGS: Record<string, (children: ReactNode, key: number) => ReactNode> = {
  bold: (children, key) => <strong key={key}>{children}</strong>,
  italic: (children, key) => <em key={key}>{children}</em>,
  strike: (children, key) => <s key={key}>{children}</s>,
  underline: (children, key) => <u key={key}>{children}</u>,
  code: (children, key) => <code key={key}>{children}</code>
}

/** El resultado del modelo con su formato (negrita, cursiva...) en vez de los asteriscos. */
export function MarkedPreview({ text }: { text: string }) {
  return (
    <>
      {splitParagraphs(text).map((paragraph, index) => (
        <p key={index} className="ai-panel__paragraph">
          {markedToInline(paragraph).map((node, nodeIndex) =>
            (node.marks ?? []).reduceRight<ReactNode>(
              (children, mark) => TAGS[mark.type]?.(children, nodeIndex) ?? children,
              node.text
            )
          )}
        </p>
      ))}
    </>
  )
}
