import { describe, expect, it } from 'vitest'
import { clampIndents, dragDeltaCm, PX_PER_CM, rulerTicks, snapCm } from './ruler'

describe('regla', () => {
  it('numera desde el margen izquierdo hacia los dos lados', () => {
    const ticks = rulerTicks(21, 2.5)
    const numbers = ticks.filter((tick) => tick.kind === 'number')
    expect(numbers.find((tick) => tick.label === 0)?.at).toBe(2.5)
    expect(numbers.find((tick) => tick.at === 12.5)?.label).toBe(10)
    // A la izquierda del margen también hay números (los de la zona gris).
    expect(numbers.find((tick) => tick.at === 1.5)?.label).toBe(1)
    expect(ticks.every((tick) => tick.at > 0 && tick.at < 21)).toBe(true)
  })

  it('redondea los arrastres a cuartos de centímetro y descuenta el zoom', () => {
    expect(snapCm(1.37)).toBe(1.25)
    expect(snapCm(1.38)).toBe(1.5)
    expect(dragDeltaCm(PX_PER_CM * 2, 2)).toBeCloseTo(1)
  })

  it('las sangrías no se salen del área de texto', () => {
    expect(clampIndents({ left: -2, firstLine: -1 }, 16)).toEqual({ left: 0, firstLine: 0 })
    // Sangría francesa: la primera línea puede volver como mucho hasta el margen.
    expect(clampIndents({ left: 1.27, firstLine: -3 }, 16)).toEqual({ left: 1.25, firstLine: -1.25 })
    expect(clampIndents({ left: 20, firstLine: 2 }, 16)).toEqual({ left: 15, firstLine: 0 })
  })
})
