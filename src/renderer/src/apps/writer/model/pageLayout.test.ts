import { describe, expect, it } from 'vitest'
import {
  cssContent,
  headerFooterText,
  pageOfPosition,
  paginate,
  paginateSections,
  printPageCss,
  type PageLayout
} from './pageLayout'
import { DEFAULT_PAGE_SETUP, withOrientation } from './pageSetup'

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

/** Los saltos sin el número de hoja, para leer los tests con menos ruido. */
const breaksOf = (layout: PageLayout) => layout.breaks.map(({ page: _page, ...rest }) => rest)

describe('paginate', () => {
  it('un documento corto ocupa una hoja y no tiene saltos', () => {
    expect(paginate(blocks(20, 20, 20), PITCH, CONTENT)).toMatchObject({ breaks: [], pageCount: 1 })
  })

  it('el bloque que no cabe entero baja al principio de la hoja siguiente', () => {
    // 0-40, 50-90, 100-140: el tercero empieza fuera del área útil (>= 98 con la holgura).
    const layout = paginate(blocks(40, 40, 40), PITCH, CONTENT)
    expect(breaksOf(layout)).toEqual([{ index: 2, shift: 50 }])
    expect(layout.pageCount).toBe(2)
  })

  it('un bloque que cruza el final de la hoja también baja', () => {
    // 0-60 y 70-110: el segundo se saldría por abajo.
    expect(breaksOf(paginate(blocks(60, 40), PITCH, CONTENT))).toEqual([{ index: 1, shift: 80 }])
  })

  it('los saltos se acumulan de hoja en hoja', () => {
    const layout = paginate(blocks(90, 90, 90), PITCH, CONTENT)
    // Cada bloque llena casi una hoja: uno por hoja.
    expect(layout.breaks.map((item) => item.index)).toEqual([1, 2])
    expect(layout.pageCount).toBe(3)
  })

  it('un bloque más alto que una hoja no se mueve si ya está arriba', () => {
    const layout = paginate(blocks(250), PITCH, CONTENT)
    expect(breaksOf(layout)).toEqual([])
    expect(layout.pageCount).toBe(2)
  })

  it('un salto de página manda el bloque siguiente a la hoja nueva aunque quepa', () => {
    const [first, second, third] = blocks(20, 20, 20)
    const layout = paginate([first, { ...second, breakBefore: true }, third], PITCH, CONTENT)
    expect(breaksOf(layout)).toEqual([{ index: 1, shift: 120 }])
    expect(layout.pageCount).toBe(2)
  })

  it('un salto de página al principio de una hoja no deja otra en blanco', () => {
    const layout = paginate([{ top: 0, bottom: 20, breakBefore: true }], PITCH, CONTENT)
    expect(layout).toMatchObject({ breaks: [], pageCount: 1 })
  })

  /** Un párrafo de `count` renglones de 10 que empieza en `top`. */
  const paragraph = (top: number, count: number) => {
    const lines = Array.from({ length: count }, (_, line) => ({ top: top + line * 10, bottom: top + line * 10 + 10 }))
    return { top, bottom: top + count * 10, lines }
  }

  it('un párrafo que no cabe se parte por el renglón que ya no entra', () => {
    // 0-60 y luego un párrafo de 8 renglones en 70-150: caben 70-80 y 80-90 (hasta 98).
    const layout = paginate([{ top: 0, bottom: 60 }, paragraph(70, 8)], PITCH, CONTENT)
    expect(breaksOf(layout)).toEqual([{ index: 1, line: 2, shift: 60 }])
    expect(layout.pageCount).toBe(2)
  })

  it('no deja un renglón huérfano al pie: si solo cabe uno, baja el párrafo entero', () => {
    const layout = paginate([{ top: 0, bottom: 75 }, paragraph(80, 6)], PITCH, CONTENT)
    expect(breaksOf(layout)).toEqual([{ index: 1, shift: 70 }])
  })

  it('no deja un renglón viudo arriba: pasan al menos dos', () => {
    // Caben 4 de 5 renglones (50-90), pero pasarían solo uno: se parte en el 3.
    const layout = paginate([{ top: 0, bottom: 40 }, paragraph(50, 5)], PITCH, CONTENT)
    expect(breaksOf(layout)).toEqual([{ index: 1, line: 3, shift: 70 }])
  })

  it('un párrafo de menos de cuatro renglones no se parte', () => {
    const layout = paginate([{ top: 0, bottom: 70 }, paragraph(80, 3)], PITCH, CONTENT)
    expect(breaksOf(layout)).toEqual([{ index: 1, shift: 70 }])
  })

  it('un párrafo más largo que una hoja se parte varias veces', () => {
    const layout = paginate([paragraph(0, 25)], PITCH, CONTENT)
    // 9 renglones por hoja (0-90; el décimo acabaría en 100 > 98).
    expect(breaksOf(layout)).toEqual([
      { index: 0, line: 9, shift: 60 },
      { index: 0, line: 18, shift: 60 }
    ])
    expect(layout.pageCount).toBe(3)
  })

  it('un título no se queda solo al pie: baja con el bloque siguiente', () => {
    const layout = paginate(
      [
        { top: 0, bottom: 60 },
        { top: 65, bottom: 80, keepWithNext: true },
        { top: 85, bottom: 120 }
      ],
      PITCH,
      CONTENT
    )
    expect(breaksOf(layout)).toEqual([{ index: 1, shift: 85 }])
  })

  it('un título junto a un párrafo que se parte se queda con sus dos primeros renglones', () => {
    const layout = paginate([{ top: 0, bottom: 40, keepWithNext: true }, paragraph(50, 8)], PITCH, CONTENT)
    expect(breaksOf(layout)).toEqual([{ index: 1, line: 4, shift: 60 }])
  })

  it('la fila de encabezado repetida empuja también lo que sigue', () => {
    const rows = [
      { top: 0, bottom: 20 },
      { top: 20, bottom: 60 },
      { top: 60, bottom: 110, repeatHeight: 20 },
      { top: 110, bottom: 130 }
    ]
    const layout = paginate(rows, PITCH, CONTENT)
    // La fila 2 baja: el encabezado repetido ocupa 150-170 y ella 170-220.
    expect(breaksOf(layout)).toEqual([{ index: 2, shift: 90 }])
    expect(layout.pageCount).toBe(2)
  })

  it('cada sección tiene su alto de hoja y su primer bloque empieza hoja', () => {
    const portrait = { contentHeight: 100, marginTop: 20, marginBottom: 20 }
    const landscape = { contentHeight: 60, marginTop: 10, marginBottom: 10 }
    const layout = paginateSections(
      [
        { top: 0, bottom: 30 },
        { top: 40, bottom: 70, section: 1 },
        { top: 80, bottom: 110, section: 1 }
      ],
      [portrait, landscape],
      10
    )
    // Hoja 2 (horizontal): 0 + 100 + 20 + 10 + 10 = 140; la 3, 140 + 60 + 10 + 10 + 10 = 230.
    expect(layout.pages.map(({ top, section }) => ({ top, section }))).toEqual([
      { top: 0, section: 0 },
      { top: 140, section: 1 },
      { top: 230, section: 1 }
    ])
    expect(layout.breaks).toEqual([
      { index: 1, shift: 100, page: 1 },
      { index: 2, shift: 50, page: 2 }
    ])
  })

  it('cuenta las hojas que ocupa un bloque más alto que una y no deja una vacía de más', () => {
    expect(paginate([{ top: 0, bottom: 120 }], PITCH, CONTENT).pageCount).toBe(1)
    expect(
      paginate(
        [
          { top: 0, bottom: 230 },
          { top: 235, bottom: 245 }
        ],
        PITCH,
        CONTENT
      ).pageCount
    ).toBe(2)
  })

  it('pageOfPosition dice en qué hoja está una posición del documento', () => {
    const starts = [0, 120, 340]
    expect(pageOfPosition(starts, 0)).toBe(1)
    expect(pageOfPosition(starts, 119)).toBe(1)
    expect(pageOfPosition(starts, 120)).toBe(2)
    expect(pageOfPosition(starts, 9999)).toBe(3)
    expect(pageOfPosition([0], 50)).toBe(1)
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
    const css = printPageCss(DEFAULT_PAGE_SETUP, { text: 'Informe', align: 'right' }, footer)
    expect(css).toContain('size: 21cm 29.7cm; margin: 2.5cm 2.5cm 2.5cm 2.5cm;')
    expect(css).toContain('@top-right { content: "Informe";')
    expect(css).toContain('@bottom-center { content: "Página " counter(page)')
    expect(printPageCss(DEFAULT_PAGE_SETUP)).not.toContain('@top')
  })

  it('primera página y pares distintas: reglas :first y :left que vacían las cajas que no usan', () => {
    const css = printPageCss(DEFAULT_PAGE_SETUP, undefined, footer, {
      first: {},
      even: { footer: { text: 'Par', align: 'left' } }
    })
    const first = css.slice(css.indexOf('@page :first'), css.indexOf('@page :left'))
    expect(first).toContain('@bottom-center { content: none; }')
    expect(css.slice(css.indexOf('@page :left'))).toContain('@bottom-left { content: "Par";')
  })

  it('la hoja impresa tiene el tamaño, la orientación y los márgenes del documento', () => {
    const landscape = withOrientation(
      { ...DEFAULT_PAGE_SETUP, margins: { top: 1, right: 2, bottom: 3, left: 4 } },
      'landscape'
    )
    expect(printPageCss(landscape)).toContain('size: 29.7cm 21cm; margin: 4cm 1cm 2cm 3cm;')
  })
})

describe('notas al pie (fase 17)', () => {
  const format = { contentHeight: 100, marginTop: 10, marginBottom: 10 }
  const line = (top: number, notes?: number) => ({ top, bottom: top + 10, ...(notes ? { notes } : {}) })

  it('reserva al pie de la hoja el alto de las notas y de la raya', () => {
    const layout = paginateSections([{ top: 0, bottom: 40, notes: 20 }], [format], 10, 5)
    expect(layout.pages[0].notes).toBe(20)
    expect(layout.pages[0].contentBottom).toBe(40)
  })

  it('un bloque baja si con sus notas ya no cabe, aunque el texto sí cabría', () => {
    // El bloque acaba en 90 (cabe en 100), pero sus 30 de notas + 5 de raya no.
    const layout = paginateSections(
      [
        { top: 0, bottom: 50 },
        { top: 60, bottom: 90, notes: 30 }
      ],
      [format],
      10,
      5
    )
    expect(layout.breaks).toEqual([{ index: 1, shift: 70, page: 1 }])
    expect(layout.pages.map((page) => page.notes)).toEqual([0, 30])
  })

  it('al partir un párrafo, cada nota va al pie de la hoja de su renglón', () => {
    // Diez renglones de 10: en la primera hoja caben menos porque el tercero cita una nota de 25.
    const lines = Array.from({ length: 10 }, (_, index) => line(index * 10, index === 2 ? 25 : index === 8 ? 15 : 0))
    const layout = paginateSections([{ top: 0, bottom: 100, lines }], [format], 10, 5)
    // 100 - 2 (holgura) - 25 - 5 = 68: caben seis renglones (hasta 60).
    expect(layout.breaks).toEqual([{ index: 0, line: 6, shift: 70, page: 1 }])
    expect(layout.pages.map((page) => page.notes)).toEqual([25, 15])
    expect(layout.pages[0].contentBottom).toBe(60)
  })

  it('sin notas, el reparto es el de siempre', () => {
    const blocks = [
      { top: 0, bottom: 60 },
      { top: 60, bottom: 120 }
    ]
    expect(paginateSections(blocks, [format], 10, 5).breaks).toEqual(paginateSections(blocks, [format], 10).breaks)
  })
})
