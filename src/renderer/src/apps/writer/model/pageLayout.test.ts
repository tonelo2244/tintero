import { describe, expect, it } from 'vitest'
import { cssContent, headerFooterText, pageAt, paginate, printPageCss } from './pageLayout'

// Números redondos para leer los tests: hojas de 100 de alto útil, cada 150 (50 de márgenes y hueco).
const PITCH = 150
const CONTENT = 100
const blocks = (...heights: number[]) => {
  let top = 0
  return heights.map((height) => {
    const block = { top, bottom: top + height }
    top += height + 10 // 10 de margen entre bloques
    return block
  })
}

describe('paginate', () => {
  it('un documento corto ocupa una hoja y no tiene saltos', () => {
    expect(paginate(blocks(20, 20, 20), PITCH, CONTENT)).toEqual({ breaks: [], pageCount: 1 })
  })

  it('el bloque que no cabe entero baja al principio de la hoja siguiente', () => {
    // 0-40, 50-90, 100-140: el tercero empieza fuera del área útil (>= 98 con la holgura).
    const layout = paginate(blocks(40, 40, 40), PITCH, CONTENT)
    expect(layout.breaks).toEqual([{ index: 2, shift: 50 }])
    expect(layout.pageCount).toBe(2)
  })

  it('un bloque que cruza el final de la hoja también baja', () => {
    // 0-60 y 70-110: el segundo se saldría por abajo.
    expect(paginate(blocks(60, 40), PITCH, CONTENT).breaks).toEqual([{ index: 1, shift: 80 }])
  })

  it('los saltos se acumulan de hoja en hoja', () => {
    const layout = paginate(blocks(90, 90, 90), PITCH, CONTENT)
    // Cada bloque llena casi una hoja: uno por hoja.
    expect(layout.breaks.map((item) => item.index)).toEqual([1, 2])
    expect(layout.pageCount).toBe(3)
  })

  it('un bloque más alto que una hoja no se mueve si ya está arriba', () => {
    const layout = paginate(blocks(250), PITCH, CONTENT)
    expect(layout.breaks).toEqual([])
    expect(layout.pageCount).toBe(2)
  })

  it('pageAt dice en qué hoja cae una altura', () => {
    expect(pageAt(0, 3, PITCH)).toBe(1)
    expect(pageAt(160, 3, PITCH)).toBe(2)
    expect(pageAt(9999, 3, PITCH)).toBe(3)
  })
})

describe('encabezado y pie', () => {
  const footer = { text: 'Página {página} de {páginas}', align: 'center' as const }

  it('en pantalla, los marcadores pasan a números', () => {
    expect(headerFooterText(footer, 2, 5)).toBe('Página 2 de 5')
  })

  it('al imprimir, los marcadores pasan a contadores de CSS y el texto se escapa', () => {
    expect(cssContent(footer.text)).toBe('"Página " counter(page) " de " counter(pages)')
    expect(cssContent('Dijo "hola"\nadiós')).toBe('"Dijo \\"hola\\"\\A adiós"')
  })

  it('cada parte va a la caja de margen de su alineación', () => {
    const css = printPageCss({ text: 'Informe', align: 'right' }, footer)
    expect(css).toContain('size: A4; margin: 2.5cm;')
    expect(css).toContain('@top-right { content: "Informe";')
    expect(css).toContain('@bottom-center { content: "Página " counter(page)')
    expect(printPageCss()).not.toContain('@top')
  })
})
