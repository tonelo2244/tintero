import { describe, expect, it } from 'vitest'
import {
  applyCellBorderAction,
  cellInlineStyle,
  effectiveCellBorders,
  formatCellBorders,
  isBandedRow,
  parseCellBorders,
  tableStyle
} from './tableStyles'

describe('estilos de tabla y bordes de celda', () => {
  it('un estilo desconocido es la cuadrícula de siempre', () => {
    expect(tableStyle('inventado').id).toBe('grid')
    expect(tableStyle(undefined).borders).toBe('all')
  })

  it('las bandas caen en una de cada dos filas, empezando por la segunda', () => {
    const banded = tableStyle('banded')
    expect([0, 1, 2, 3].map((row) => isBandedRow(banded, row))).toEqual([false, true, false, true])
    expect(isBandedRow(tableStyle('grid'), 1)).toBe(false)
  })

  it('lee y escribe los lados de una celda', () => {
    expect(parseCellBorders(null)).toBeNull()
    expect(parseCellBorders('')).toEqual([])
    expect(parseCellBorders('bottom top nada')).toEqual(['top', 'bottom'])
    expect(formatCellBorders(['top', 'bottom'])).toBe('top bottom')
    expect(formatCellBorders(null)).toBeNull()
  })

  it('sin bordes propios, la celda lleva los del estilo', () => {
    expect(effectiveCellBorders(tableStyle('grid'), null)).toEqual(['top', 'right', 'bottom', 'left'])
    expect(effectiveCellBorders(tableStyle('lines'), null)).toEqual(['top', 'bottom'])
    expect(effectiveCellBorders(tableStyle('plain'), null)).toEqual([])
    expect(effectiveCellBorders(tableStyle('grid'), ['left'])).toEqual(['left'])
  })

  it('un lado se activa o se quita partiendo de lo que se ve', () => {
    const grid = tableStyle('grid')
    expect(applyCellBorderAction(grid, null, 'bottom')).toEqual(['top', 'right', 'left'])
    expect(applyCellBorderAction(tableStyle('plain'), null, 'bottom')).toEqual(['bottom'])
    expect(applyCellBorderAction(grid, ['top'], 'top')).toEqual([])
    expect(applyCellBorderAction(grid, ['top'], 'all')).toEqual(['top', 'right', 'bottom', 'left'])
    expect(applyCellBorderAction(grid, ['top'], 'none')).toEqual([])
    expect(applyCellBorderAction(grid, ['top'], 'reset')).toBeNull()
  })

  it('el estilo en línea quita los lados que no van (hidden gana al borde de la vecina)', () => {
    expect(cellInlineStyle(null, null)).toBe('')
    expect(cellInlineStyle(['bottom'], '#ffeeaa')).toBe(
      'background-color: #ffeeaa; border-top: hidden; border-right: hidden; border-bottom: 1px solid #000000; border-left: hidden'
    )
  })
})
