import { describe, expect, it } from 'vitest'
import {
  cssPageSize,
  DEFAULT_PAGE_SETUP,
  isDefaultPageSetup,
  marginPresetOf,
  MARGIN_PRESETS,
  normalizePageSetup,
  pageGeometry,
  paperSizeOf,
  withMargins,
  withOrientation,
  withPaperSize
} from './pageSetup'

const PX_PER_CM = 96 / 2.54

describe('pageSetup', () => {
  it('la configuración por defecto es A4 vertical con márgenes normales', () => {
    expect(paperSizeOf(DEFAULT_PAGE_SETUP)?.label).toBe('A4')
    expect(marginPresetOf(DEFAULT_PAGE_SETUP)?.id).toBe('normal')
    expect(isDefaultPageSetup(DEFAULT_PAGE_SETUP)).toBe(true)
  })

  it('la geometría pasa los centímetros a píxeles de pantalla', () => {
    const geometry = pageGeometry(DEFAULT_PAGE_SETUP)
    expect(geometry.width).toBeCloseTo(21 * PX_PER_CM)
    expect(geometry.contentHeight).toBeCloseTo((29.7 - 5) * PX_PER_CM)
    expect(geometry.contentWidth).toBeCloseTo(16 * PX_PER_CM)
    expect(geometry.pitch).toBeCloseTo(geometry.height + geometry.gap)
  })

  it('en horizontal la hoja se gira y los márgenes giran con ella', () => {
    const setup = withMargins(DEFAULT_PAGE_SETUP, { top: 1, right: 2, bottom: 3, left: 4 })
    const landscape = withOrientation(setup, 'landscape')
    expect(cssPageSize(landscape)).toBe('29.7cm 21cm')
    expect(landscape.margins).toEqual({ top: 4, right: 1, bottom: 2, left: 3 })
    // Ida y vuelta: girar dos veces deja los márgenes como estaban.
    expect(withOrientation(landscape, 'portrait').margins).toEqual(setup.margins)
    expect(paperSizeOf(landscape)?.id).toBe('a4')
  })

  it('los márgenes nunca dejan la hoja sin sitio para el texto', () => {
    const setup = withMargins(DEFAULT_PAGE_SETUP, { left: 15, right: 15 })
    const geometry = pageGeometry(setup)
    expect(setup.margins.left).toBe(setup.margins.right)
    expect(geometry.contentWidth).toBeCloseTo(2 * PX_PER_CM, 1)
    expect(withMargins(DEFAULT_PAGE_SETUP, { top: -3 }).margins.top).toBe(0)
  })

  it('reconoce los márgenes predefinidos', () => {
    for (const preset of MARGIN_PRESETS) {
      expect(marginPresetOf(withMargins(DEFAULT_PAGE_SETUP, preset.margins))?.id).toBe(preset.id)
    }
    expect(marginPresetOf(withMargins(DEFAULT_PAGE_SETUP, { left: 3 }))).toBeNull()
  })

  it('un tamaño personalizado se guarda en vertical y dentro de límites', () => {
    const custom = withPaperSize(DEFAULT_PAGE_SETUP, { width: 30, height: 12 })
    expect(custom.size).toEqual({ width: 12, height: 30 })
    expect(paperSizeOf(custom)).toBeNull()
    expect(withPaperSize(DEFAULT_PAGE_SETUP, { width: 1, height: 500 }).size).toEqual({ width: 7, height: 60 })
  })

  it('normalizePageSetup descarta lo inservible y completa lo que falta', () => {
    expect(normalizePageSetup(null)).toBeNull()
    expect(normalizePageSetup({ size: { width: 'ancho' } })).toBeNull()
    const partial = normalizePageSetup({ size: { width: 21.59, height: 27.94 }, orientation: 'sideways' })
    expect(partial).toEqual({ ...DEFAULT_PAGE_SETUP, size: { width: 21.59, height: 27.94 } })
    expect(paperSizeOf(partial!)?.label).toBe('Carta')
  })
})
