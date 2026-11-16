import { describe, expect, it } from 'vitest'
import { layoutTabs } from './tabs'

const widths = (layout: { width: number }[]) => layout.map((tab) => Math.round(tab.width * 100) / 100)

describe('layoutTabs', () => {
  it('sin topes, salta al siguiente múltiplo de 1,25 cm', () => {
    const layout = layoutTabs([{ x: 2, segmentWidth: 1, decimalOffset: 1 }], [], 16)
    expect(widths(layout)).toEqual([0.5])
  })

  it('tope a la izquierda: el texto empieza en el tope, y el siguiente cuenta el desplazamiento', () => {
    const layout = layoutTabs(
      [
        { x: 1, segmentWidth: 2, decimalOffset: 2 },
        { x: 3, segmentWidth: 1, decimalOffset: 1 }
      ],
      [
        { position: 4, align: 'left' },
        { position: 8, align: 'left' }
      ],
      16
    )
    // El primero mide 3 (de 1 a 4); el segundo, medido en 3, en realidad está en 6: hasta 8 hay 2.
    expect(widths(layout)).toEqual([3, 2])
  })

  it('tope a la derecha con relleno de puntos: el número termina en el tope', () => {
    const [tab] = layoutTabs(
      [{ x: 4, segmentWidth: 0.5, decimalOffset: 0.5 }],
      [{ position: 16, align: 'right', leader: 'dot' }],
      16
    )
    expect(tab.width).toBeCloseTo(11.5)
    expect(tab.dotted).toBe(true)
  })

  it('centro y decimal', () => {
    const center = layoutTabs([{ x: 0, segmentWidth: 2, decimalOffset: 2 }], [{ position: 8, align: 'center' }], 16)
    expect(widths(center)).toEqual([7])
    const decimal = layoutTabs([{ x: 0, segmentWidth: 2, decimalOffset: 1.2 }], [{ position: 5, align: 'decimal' }], 16)
    expect(widths(decimal)).toEqual([3.8])
  })

  it('un tabulador en una línea nueva no arrastra lo de la anterior', () => {
    const layout = layoutTabs(
      [
        { x: 1, segmentWidth: 1, decimalOffset: 1 },
        { x: 1, segmentWidth: 1, decimalOffset: 1, newLine: true }
      ],
      [{ position: 5, align: 'left' }],
      16
    )
    expect(widths(layout)).toEqual([4, 4])
  })
})
