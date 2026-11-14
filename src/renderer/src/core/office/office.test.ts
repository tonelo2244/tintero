import { describe, expect, it } from 'vitest'
import { cssColorToHex, cssFontToName, cssSizeToPt } from './cssValues'
import { bytesToDataUrl, decodeImageDataUrl, fitWidth, imageSize } from './images'

/** PNG de 3x2 píxeles: firma + cabecera IHDR (no hace falta que el resto sea válido para leer el tamaño). */
const PNG_3x2 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 3, 0, 0, 0, 2, 8, 6, 0,
  0, 0
])

describe('valores CSS -> Office', () => {
  it('normaliza colores', () => {
    expect(cssColorToHex('#abc')).toBe('AABBCC')
    expect(cssColorToHex('#2f5496')).toBe('2F5496')
    expect(cssColorToHex('rgb(255, 0, 16)')).toBe('FF0010')
    expect(cssColorToHex('var(--accent)')).toBeNull()
    expect(cssColorToHex(null)).toBeNull()
  })

  it('se queda con la primera fuente de la pila CSS', () => {
    expect(cssFontToName('"Times New Roman", Times, serif')).toBe('Times New Roman')
    expect(cssFontToName('Calibri, Carlito, sans-serif')).toBe('Calibri')
    expect(cssFontToName('')).toBeNull()
  })

  it('convierte tamaños a puntos', () => {
    expect(cssSizeToPt('14pt')).toBe(14)
    expect(cssSizeToPt('16px')).toBe(12)
    expect(cssSizeToPt('1.2em')).toBeNull()
  })
})

describe('imágenes', () => {
  it('decodifica un data URL y lee el tamaño de la cabecera', () => {
    const decoded = decodeImageDataUrl(bytesToDataUrl(PNG_3x2, 'image/png'))
    expect(decoded?.kind).toBe('png')
    expect(imageSize(decoded!)).toEqual({ width: 3, height: 2 })
  })

  it('rechaza formatos que Office no entiende', () => {
    expect(decodeImageDataUrl('data:image/svg+xml;base64,PHN2Zy8+')).toBeNull()
    expect(decodeImageDataUrl('https://ejemplo.com/foto.png')).toBeNull()
  })

  it('reduce sin deformar', () => {
    expect(fitWidth({ width: 1200, height: 600 }, 600)).toEqual({ width: 600, height: 300 })
    expect(fitWidth({ width: 100, height: 50 }, 600)).toEqual({ width: 100, height: 50 })
  })
})
