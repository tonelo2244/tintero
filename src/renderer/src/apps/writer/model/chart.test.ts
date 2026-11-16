import { describe, expect, it } from 'vitest'
import { chartDataToTable, normalizeChartData, parseChartNumber, SAMPLE_CHART_DATA, tableToChartData } from './chart'

describe('datos de los gráficos de Texto', () => {
  it('lee números escritos a mano en español', () => {
    expect(parseChartNumber('4,5')).toBe(4.5)
    expect(parseChartNumber('1.234,5')).toBe(1234.5)
    expect(parseChartNumber(' 12 ')).toBe(12)
    expect(parseChartNumber('3.5')).toBe(3.5)
    expect(parseChartNumber('')).toBeNull()
    expect(parseChartNumber('abc')).toBeNull()
  })

  it('va y vuelve entre datos y cuadrícula sin perder nada', () => {
    const table = chartDataToTable(SAMPLE_CHART_DATA)
    expect(table[0]).toEqual(['', 'Serie 1', 'Serie 2', 'Serie 3'])
    expect(table[1]).toEqual(['Categoría 1', '4,3', '2,4', '2'])
    expect(tableToChartData(table)).toEqual(SAMPLE_CHART_DATA)
  })

  it('quita filas y columnas en blanco y pone nombres a las que no tienen', () => {
    const data = tableToChartData([
      ['', '', 'B', ''],
      ['', '1', '2', ''],
      ['', '', '', ''],
      ['Z', '3', 'x', '']
    ])
    expect(data.categories).toEqual(['Categoría 1', 'Z'])
    expect(data.series).toEqual([
      { name: 'Serie 1', values: [1, 3] },
      { name: 'B', values: [2, null] }
    ])
  })

  it('un archivo dañado no rompe el documento', () => {
    expect(normalizeChartData(null)).toBe(SAMPLE_CHART_DATA)
    expect(normalizeChartData({ categories: ['a'], series: [] })).toBe(SAMPLE_CHART_DATA)
    expect(normalizeChartData({ categories: ['a', 'b'], series: [{ name: 'S', values: [1, 'x'] }] })).toEqual({
      categories: ['a', 'b'],
      series: [{ name: 'S', values: [1, null] }]
    })
  })
})
