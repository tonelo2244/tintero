import { describe, expect, it } from 'vitest'
import { extractNumbers, ungroundedNumbers } from './grounding'

describe('extractNumbers', () => {
  it('entiende números en español y en inglés', () => {
    expect(extractNumbers('Vendimos 1.234,5 € (un 12,5 %) en 2026 y 3.5 kg; bajó -4')).toEqual([
      1234.5, 12.5, 2026, 3.5, -4
    ])
    expect(extractNumbers('Total: 1,234.5 o 1,234,567')).toEqual([1234.5, 1234567])
  })

  it('no confunde números dentro de palabras o referencias de celda', () => {
    expect(extractNumbers('La celda B12 y el modelo gemma4')).toEqual([])
  })
})

describe('ungroundedNumbers', () => {
  it('acepta cifras conocidas, redondeos y porcentajes', () => {
    const known = [1234.56, 0.25, 48]
    expect(ungroundedNumbers('Unos 1.235 € en total, un 25 % del año y 48 pedidos.', known)).toEqual([])
  })

  it('señala las cifras inventadas e ignora los números pequeños', () => {
    expect(ungroundedNumbers('Hay 3 regiones y se vendieron 5.000 unidades.', [1200])).toEqual([5000])
  })
})
