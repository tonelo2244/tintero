// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { plainText } from '../richText'
import type { ShapeElement, TableElement, TextElement } from '../types'
import { importPptx } from './importPptx'

/** Corpus de fixtures/office: la misma presentación escrita por python-pptx y por LibreOffice. */
const fixture = (name: string) => new Uint8Array(readFileSync(resolve('fixtures/office', name)))

describe.each(['powerpoint-tema.pptx', 'libreoffice-tema.pptx'])('corpus: %s', (name) => {
  it('crea un tema importado con los colores y fuentes del archivo', async () => {
    const { content } = await importPptx(fixture(name))
    expect(content.themeId).toBe('imported')
    const theme = content.importedTheme!
    // Tema "Office" de python-pptx: fondo blanco, texto negro, acento azul y Calibri.
    expect(theme.background).toBe('#ffffff')
    expect(theme.textColor).toBe('#000000')
    expect(theme.accentColor).toBe('#4f81bd')
    expect(theme.fontFamily).toMatch(/Calibri/)
  })

  it('conserva el fondo propio de una diapositiva, los giros y las tablas', async () => {
    const { content, warnings } = await importPptx(fixture(name))
    const [first, second] = content.slides
    expect(first.background).toBe('#1f2a44')
    expect(second.background).toBeUndefined()

    const rotated = first.elements.find((element) => element.type === 'shape') as ShapeElement
    expect(rotated.rotation).toBe(30)
    const label = first.elements.find(
      (element) => element.type === 'text' && plainText(element.paragraphs) === 'Girado'
    ) as TextElement
    expect(label.rotation).toBe(30)

    const table = first.elements.find((element) => element.type === 'table') as TableElement
    expect(table.rows.map((row) => row.map((cell) => cell.text))).toEqual([
      ['Producto', 'Precio'],
      ['Café', '1,50 €'],
      ['Té', '2,25 €']
    ])
    // PowerPoint marca la fila de encabezado (firstRow); LibreOffice, en cambio, escribe sus colores
    // en cada celda. Las dos formas se ven igual.
    if (name.startsWith('powerpoint')) expect(table.headerRow).toBe(true)
    else expect(table.rows[0][0].fill).toMatch(/^#[0-9a-f]{6}$/)
    expect(table.columnWidths).toEqual([0.5, 0.5])
    // python-pptx crea presentaciones 4:3; LibreOffice las mantiene.
    expect(warnings).toEqual(['el formato 4:3 (se centra en 16:9)'])
  })
})
