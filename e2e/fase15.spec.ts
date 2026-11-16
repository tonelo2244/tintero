import { copyFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createBlank, expect, test, type Tintero } from './support/tintero'

const LONG_SENTENCE =
  'Este párrafo es largo a propósito para que cruce el final de la hoja y se tenga que partir por renglones. '

/** Exporta a PDF y devuelve sus bytes. */
async function exportPdf(tintero: Tintero, name: string): Promise<Buffer> {
  const { page } = tintero
  const pdfPath = join(tintero.workDir, name)
  await tintero.answerNextSaveDialog(pdfPath)
  await page.getByRole('button', { name: 'Exportar' }).click()
  await page.getByRole('menuitem', { name: 'PDF (.pdf)' }).click()
  await expect
    .poll(() =>
      readFile(pdfPath).then(
        (bytes) => bytes.length,
        () => 0
      )
    )
    .toBeGreaterThan(0)
  if (process.env.SCREENSHOTS) await copyFile(pdfPath, `test-results/${name}`)
  return readFile(pdfPath)
}

/** Tamaño de cada hoja del PDF en puntos (`/MediaBox`), en orden. */
const pdfPageSizes = (pdf: Buffer) =>
  [...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)].map(([, width, height]) => [
    Math.round(Number(width)),
    Math.round(Number(height))
  ])

/** Fase 15: párrafos y tablas que se parten entre hojas, y la vista Varias páginas. */
test('Texto: un párrafo y una tabla largos se parten entre hojas igual en pantalla y en el PDF', async ({
  tintero
}) => {
  const { page } = tintero
  await createBlank(page, 'Texto')
  const editor = page.locator('.ProseMirror').first()
  await editor.click()
  for (let index = 1; index <= 8; index++) {
    await page.keyboard.insertText(`Párrafo corto ${index}.`)
    await page.keyboard.press('Enter')
  }
  await page.keyboard.insertText(LONG_SENTENCE.repeat(30))
  await page.keyboard.press('Enter')

  // Una tabla con fila de encabezado y muchas filas.
  await page.getByRole('tab', { name: 'Insertar' }).click()
  await page.getByRole('button', { name: 'Tabla' }).first().click()
  await page.getByRole('button', { name: 'Tabla de 2 columnas por 2 filas' }).click()
  // El menú se cierra y el foco vuelve al editor, ya dentro de la primera celda: hasta entonces,
  // lo que se escribe no llega a la tabla.
  await expect(editor).toBeFocused()
  await expect(editor.locator('table')).toHaveCount(1)
  await page.keyboard.insertText('Nombre')
  await page.keyboard.press('Tab')
  await page.keyboard.insertText('Valor')
  await page.getByRole('tab', { name: 'Tabla' }).click()
  await page.getByRole('button', { name: 'Fila de encabezado' }).click()
  await expect(editor.locator('th')).toHaveCount(2)
  // La primera celda de verdad (si la tabla ya cruza de hoja, antes van el hueco y el encabezado repetido).
  await editor.locator('tr:not(.ProseMirror-widget) > td').first().click()
  for (let row = 1; row <= 45; row++) {
    await page.keyboard.insertText(`Fila ${row}`)
    await page.keyboard.press('Tab')
    await page.keyboard.insertText(String(row * 10))
    if (row < 45) await page.keyboard.press('Tab')
  }

  // El párrafo largo se parte (un hueco dentro de él) y la tabla repite su encabezado en cada hoja.
  await expect(editor.locator('p .writer-page-split')).toHaveCount(1)
  await expect(editor.locator('tr.writer-table-repeat').first()).toBeAttached()
  const sheetCount = await page.locator('.writer-sheet').count()
  expect(sheetCount).toBeGreaterThanOrEqual(3)
  // El primer renglón que pasa de hoja empieza justo debajo del margen superior de la hoja 2.
  const sheet2 = await page.locator('.writer-sheet').nth(1).boundingBox()
  const afterSplit = await page.evaluate(() => {
    const split = document.querySelector('.writer-page-split')!
    const range = document.createRange()
    range.setStartAfter(split)
    range.setEnd(split.nextSibling ?? split, Math.min(5, split.nextSibling?.textContent?.length ?? 0))
    return range.getClientRects()[0]?.top ?? 0
  })
  expect(Math.abs(afterSplit - sheet2!.y - (2.5 * 96) / 2.54)).toBeLessThan(6)
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/fase15-tabla.png' })

  // PDF: las mismas hojas, y la hoja que sigue a la del corte de tabla empieza por el encabezado.
  const pdf = await exportPdf(tintero, 'fase15-partir.pdf')
  expect(pdfPageSizes(pdf)).toHaveLength(sheetCount)
  const rowAfterRepeat = await page.evaluate(
    () => (document.querySelector('tr.writer-table-repeat')?.nextElementSibling as HTMLElement).innerText
  )
  const pdfText = execFileSync('pdftotext', ['-layout', join(tintero.workDir, 'fase15-partir.pdf'), '-'], {
    encoding: 'utf8'
  })
  const pages = pdfText.split('\f').map((text) => text.trim())
  const firstCell = rowAfterRepeat.split('\n')[0].trim()
  const repeated = pages.find((text) => text.startsWith('Nombre') && text.split('\n')[1]?.startsWith(firstCell))
  expect(repeated).toBeDefined()

  // Vista > Varias páginas: dos hojas en la misma fila.
  await page.getByRole('tab', { name: 'Vista' }).click()
  await page.getByRole('button', { name: 'Varias páginas' }).click()
  await expect
    .poll(async () => {
      const [first, second] = await Promise.all([0, 1].map((n) => page.locator('.writer-sheet').nth(n).boundingBox()))
      return Math.abs(first!.y - second!.y) < 1 && second!.x > first!.x
    })
    .toBe(true)
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/fase15-varias-paginas.png' })
})

/** Fase 15: secciones con otra orientación, columnas, guiones y encabezado y pie sobre la hoja. */
test('Texto: una sección horizontal, columnas y el encabezado editado sobre la hoja', async ({ tintero }) => {
  const { page } = tintero
  await createBlank(page, 'Texto')
  const editor = page.locator('.ProseMirror').first()
  await editor.click()
  await page.keyboard.insertText('Portada en vertical.')

  // Disposición > Saltos > Sección y Orientación > Horizontal: solo cambia la sección del cursor.
  await page.getByRole('tab', { name: 'Disposición' }).click()
  await page.getByRole('button', { name: 'Saltos' }).click()
  await page.getByRole('button', { name: /Sección \(página siguiente\)/ }).click()
  await page.keyboard.insertText('Anexo en horizontal.')
  await page.getByRole('button', { name: 'Orientación' }).click()
  await page.getByRole('button', { name: 'Horizontal' }).click()
  const sheets = page.locator('.writer-sheet')
  await expect(sheets).toHaveCount(2)
  const [portrait, landscape] = await Promise.all([sheets.nth(0).boundingBox(), sheets.nth(1).boundingBox()])
  expect(landscape!.width).toBeGreaterThan(portrait!.width)

  // Columnas: dos párrafos en dos columnas, con un salto de columna entre ellos.
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('Columna izquierda.')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('Columna derecha.')
  await page.keyboard.press('Shift+ArrowUp')
  await page.keyboard.press('Shift+Home')
  await page.getByRole('button', { name: 'Columnas' }).click()
  await page.getByRole('button', { name: 'Dos', exact: true }).click()
  await expect(editor.locator('.writer-columns')).toHaveCount(1)
  await editor.getByText('Columna derecha.').click()
  await page.keyboard.press('Home')
  await page.getByRole('button', { name: 'Saltos' }).click()
  await page.getByRole('button', { name: /^Columna Lo de detrás/ }).click()
  const [left, right] = await Promise.all([
    editor.getByText('Columna izquierda.').boundingBox(),
    editor.getByText('Columna derecha.').boundingBox()
  ])
  expect(right!.x).toBeGreaterThan(left!.x + 100)

  // Guiones automáticos.
  await page.getByRole('button', { name: 'Guiones' }).click()
  await page.getByRole('button', { name: 'Automático' }).click()
  await expect(page.locator('.writer-page--hyphenate')).toHaveCount(1)

  // Doble clic en el margen superior de la hoja 2: se edita su encabezado, con su pestaña contextual.
  await sheets.nth(1).evaluate((sheet) => sheet.scrollIntoView({ block: 'start' }))
  const sheet2 = (await sheets.nth(1).boundingBox())!
  await page.mouse.dblclick(sheet2.x + sheet2.width / 2, sheet2.y + 30)
  await expect(page.getByRole('tab', { name: 'Encabezado y pie' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.insertText('Página')
  await page.getByRole('button', { name: 'Número de página' }).click()
  await page.getByRole('button', { name: 'Derecha' }).click()
  // Primera página diferente: la portada se queda sin encabezado.
  await page.getByRole('button', { name: 'Primera página diferente' }).click()
  await page.getByRole('button', { name: 'Cerrar encabezado y pie' }).click()
  await expect(page.getByRole('tab', { name: 'Encabezado y pie' })).toHaveCount(0)
  await expect(page.locator('.writer-sheet__header')).toHaveCount(1)
  await expect(sheets.nth(1).locator('.writer-sheet__header')).toHaveText('Página 2')
  await expect(sheets.nth(1).locator('.writer-sheet__part--right')).toHaveCount(1)
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/fase15-secciones.png' })

  // PDF: una hoja vertical y otra horizontal (A4: 595 x 842 puntos).
  const pdf = await exportPdf(tintero, 'fase15-secciones.pdf')
  expect(pdfPageSizes(pdf)).toEqual([
    [595, 842],
    [842, 595]
  ])
})
