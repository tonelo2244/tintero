import { describe, expect, it } from 'vitest'
import { clampZoom, MAX_ZOOM, MIN_ZOOM, stepZoom, zoomForPreset } from './zoom'

const a4 = { width: 794, height: 1123 }

describe('zoom', () => {
  it('ancho de página llena el lienzo dejando aire a los lados', () => {
    expect(zoomForPreset('pageWidth', { width: 1642, height: 800 }, a4)).toBeCloseTo(2, 1)
    expect(zoomForPreset('pageWidth', { width: 842, height: 800 }, a4)).toBe(1)
  })

  it('una página cabe entera, por alto o por ancho', () => {
    const tall = zoomForPreset('onePage', { width: 1600, height: 600 }, a4, 24)
    expect(tall * a4.height).toBeLessThanOrEqual(600 - 24)
    const narrow = zoomForPreset('onePage', { width: 500, height: 2000 }, a4)
    expect(narrow * a4.width).toBeLessThanOrEqual(500)
  })

  it('100 % es 1 y los límites se respetan', () => {
    expect(zoomForPreset('actual', { width: 10, height: 10 }, a4)).toBe(1)
    expect(zoomForPreset('onePage', { width: 10, height: 10 }, a4)).toBe(MIN_ZOOM)
    expect(clampZoom(9)).toBe(MAX_ZOOM)
    expect(stepZoom(1, 1)).toBe(1.1)
    expect(stepZoom(0.33, -1)).toBe(MIN_ZOOM)
  })
})
