import { describe, expect, it } from 'vitest'
import { isDropCapMode, splitDropCap } from './dropCap'

describe('letra capital', () => {
  it('separa la primera letra conservando sus marcas', () => {
    const bold = [{ type: 'bold' }]
    expect(splitDropCap([{ type: 'text', text: 'Érase', marks: bold }, { type: 'hardBreak' }])).toEqual({
      letter: { type: 'text', text: 'É', marks: bold },
      rest: [{ type: 'text', text: 'rase', marks: bold }, { type: 'hardBreak' }]
    })
  })

  it('un párrafo de una letra se queda sin resto', () => {
    expect(splitDropCap([{ type: 'text', text: 'A' }])).toEqual({ letter: { type: 'text', text: 'A' }, rest: [] })
  })

  it('sin texto al principio no hay letra capital', () => {
    expect(splitDropCap([])).toBeNull()
    expect(splitDropCap([{ type: 'field', attrs: { kind: 'page' } }])).toBeNull()
    expect(splitDropCap([{ type: 'text', text: ' hola' }])).toBeNull()
  })

  it('solo dos modos', () => {
    expect(isDropCapMode('drop')).toBe(true)
    expect(isDropCapMode('margin')).toBe(true)
    expect(isDropCapMode('none')).toBe(false)
  })
})
