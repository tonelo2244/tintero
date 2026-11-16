import { describe, expect, it } from 'vitest'
import { insertSnippet, normalizeLatex } from './equation'

describe('ecuaciones', () => {
  it('quita los delimitadores de LaTeX al pegar', () => {
    expect(normalizeLatex('  $$a^2$$ ')).toBe('a^2')
    expect(normalizeLatex('\\[ x = 1 \\]')).toBe('x = 1')
    expect(normalizeLatex('$x$')).toBe('x')
    expect(normalizeLatex('a $ b')).toBe('a $ b')
    expect(normalizeLatex('$')).toBe('$')
  })

  it('inserta una plantilla sustituyendo la selección', () => {
    expect(insertSnippet('a + b', 4, 5, '\\frac{1}{2}')).toEqual({ text: 'a + \\frac{1}{2}', cursor: 15 })
  })
})
