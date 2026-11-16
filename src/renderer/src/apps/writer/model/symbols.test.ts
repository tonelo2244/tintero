import { describe, expect, it } from 'vitest'
import { searchSymbols, symbolName, withRecentSymbol } from './symbols'

describe('símbolos', () => {
  it('busca por nombre sin tildes ni mayúsculas y sin repetir', () => {
    expect(searchSymbols('raiz').map((entry) => entry.char)).toEqual(['√'])
    expect(searchSymbols('EURO').map((entry) => entry.char)).toEqual(['€'])
    expect(searchSymbols('flecha doble').map((entry) => entry.char)).toEqual(['↔', '⇒'])
    expect(searchSymbols('π').map((entry) => entry.char)).toEqual(['π'])
    expect(searchSymbols('zzz')).toEqual([])
  })

  it('recientes: el último delante, sin repetir y con máximo', () => {
    expect(withRecentSymbol(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c'])
    expect(withRecentSymbol(['a', 'b'], 'c', 2)).toEqual(['c', 'a'])
  })

  it('da nombre a los caracteres de la lista', () => {
    expect(symbolName('©')).toBe('copyright')
    expect(symbolName('Q')).toBe('Q')
  })
})
