import { describe, expect, it } from 'vitest'
import {
  applyMove,
  hasSectionBody,
  headingIndexAt,
  headingsOf,
  hiddenBlocks,
  planMoveDown,
  planMoveUp,
  planSectionMove,
  sectionEnd,
  type OutlineBlock
} from './outline'

/** "# A" es un título de nivel 1; "texto" es un párrafo normal. */
const blocks = (...items: string[]): OutlineBlock[] =>
  items.map((item) => {
    const match = /^(#+) (.*)$/.exec(item)
    return match ? { level: match[1].length, text: match[2] } : { level: null, text: item }
  })

const doc = blocks('intro', '# A', 'a1', '## A.1', 'a11', '# B', 'b1', '## B.1', '# C')
const names = (items: OutlineBlock[]) =>
  items.map((block) => (block.level ? `${'#'.repeat(block.level)} ` : '') + block.text)

describe('esquema del documento', () => {
  it('saca los títulos con su bloque y su nivel', () => {
    expect(headingsOf(doc).map((heading) => [heading.blockIndex, heading.level, heading.text])).toEqual([
      [1, 1, 'A'],
      [3, 2, 'A.1'],
      [5, 1, 'B'],
      [7, 2, 'B.1'],
      [8, 1, 'C']
    ])
  })

  it('una sección acaba en el siguiente título de su nivel o superior', () => {
    expect(sectionEnd(doc, 1)).toBe(5) // A se lleva A.1
    expect(sectionEnd(doc, 3)).toBe(5)
    expect(sectionEnd(doc, 7)).toBe(8)
    expect(sectionEnd(doc, 8)).toBe(9) // la última llega al final
    expect(sectionEnd(doc, 0)).toBe(1) // un párrafo es su propia sección
  })

  it('sabe en qué título está cada bloque', () => {
    expect(headingIndexAt(doc, 0)).toBeNull()
    expect(headingIndexAt(doc, 4)).toBe(3)
    expect(headingIndexAt(doc, 5)).toBe(5)
  })

  it('arrastrar un título mueve la sección entera', () => {
    const move = planSectionMove(doc, 5, 1) // B delante de A
    expect(move).toEqual({ start: 5, end: 8, insertAt: 1 })
    expect(names(applyMove(doc, move!))).toEqual(['intro', '# B', 'b1', '## B.1', '# A', 'a1', '## A.1', 'a11', '# C'])
    // Al final del documento.
    expect(names(applyMove(doc, planSectionMove(doc, 1, doc.length)!))).toEqual([
      'intro',
      '# B',
      'b1',
      '## B.1',
      '# C',
      '# A',
      'a1',
      '## A.1',
      'a11'
    ])
  })

  it('no deja meter una sección dentro de sí misma', () => {
    expect(planSectionMove(doc, 1, 3)).toBeNull()
    expect(planSectionMove(doc, 1, 5)).toBeNull() // justo detrás de sí misma: no cambia nada
    expect(planSectionMove(doc, 1, 1)).toBeNull()
  })

  it('mover arriba y abajo salta secciones del mismo nivel', () => {
    expect(names(applyMove(doc, planMoveUp(doc, 5)!))).toEqual([
      'intro',
      '# B',
      'b1',
      '## B.1',
      '# A',
      'a1',
      '## A.1',
      'a11',
      '# C'
    ])
    expect(names(applyMove(doc, planMoveDown(doc, 1)!))).toEqual(names(applyMove(doc, planMoveUp(doc, 5)!)))
    expect(planMoveDown(doc, 8)).toBeNull()
    expect(planMoveUp(doc, 1)).toBeNull()
    // Un párrafo sube y baja de uno en uno.
    expect(names(applyMove(doc, planMoveUp(doc, 2)!)).slice(0, 3)).toEqual(['intro', 'a1', '# A'])
    expect(names(applyMove(doc, planMoveDown(doc, 0)!)).slice(0, 2)).toEqual(['# A', 'intro'])
  })

  it('pliega secciones y filtra por nivel', () => {
    expect(hiddenBlocks(doc, new Set([1]), null)).toEqual([false, false, true, true, true, false, false, false, false])
    expect(hiddenBlocks(doc, new Set(), 1)).toEqual([true, false, true, true, true, false, true, true, false])
    expect(hasSectionBody(doc, 7)).toBe(false)
    expect(hasSectionBody(doc, 1)).toBe(true)
  })
})
