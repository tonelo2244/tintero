import { describe, expect, it } from 'vitest'
import { coverPageContent, startsWithCoverPage } from './coverPage'

describe('portada', () => {
  it('título, subtítulo, autor y fecha como campos, y salto de página', () => {
    const content = coverPageContent()
    expect(content.map((node) => node.attrs?.blockStyle ?? node.type)).toEqual([
      'title',
      'subtitle',
      'paragraph',
      'paragraph',
      'pageBreak'
    ])
    expect(content[2].content?.[0]).toEqual({ type: 'field', attrs: { kind: 'author' } })
    expect(content[3].content?.[0]).toEqual({ type: 'field', attrs: { kind: 'date' } })
  })

  it('reconoce un documento que ya empieza por portada', () => {
    expect(startsWithCoverPage({ type: 'doc', content: coverPageContent() })).toBe(true)
    expect(startsWithCoverPage({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(false)
  })
})
