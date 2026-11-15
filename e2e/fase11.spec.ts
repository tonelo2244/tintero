import { copyFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createBlank, expect, test } from './support/tintero'

/** Fase 11: organizar elementos en Diapositivas y transiciones. */
test('Diapositivas: duplicar, seleccionar varios, agrupar, copiar y pegar', async ({ tintero }) => {
  const { page } = tintero
  await createBlank(page, 'Diapositivas')
  const surface = page.locator('.slides-stage .slide-surface')
  // Los dos primeros son los marcadores de título y subtítulo del diseño.
  const elements = surface.locator(':scope > .slide-element')
  await expect(elements).toHaveCount(2)

  await page.getByRole('button', { name: 'Formas' }).first().click()
  await page.getByRole('button', { name: 'Rectángulo', exact: true }).click()
  await expect(elements).toHaveCount(3)

  // Ctrl+D duplica (un poco desplazado) y deja seleccionada la copia.
  await page.locator('body').press('Control+d')
  await expect(elements).toHaveCount(4)

  // Mayús + clic en la esquina que la copia no tapa: ahora hay dos seleccionados.
  await elements.nth(2).click({ position: { x: 3, y: 3 }, modifiers: ['Shift'] })
  await expect(surface.locator('.slide-element.is-selected')).toHaveCount(2)
  // Con varios seleccionados no hay tiradores de tamaño (solo se organizan).
  await expect(surface.locator('.resize-handle')).toHaveCount(0)

  await page.getByRole('button', { name: 'Organizar' }).click()
  await page.getByRole('button', { name: 'Alinear objetos arriba' }).click()
  await page.getByRole('button', { name: 'Organizar' }).click()
  await page.getByRole('button', { name: 'Agrupar (Ctrl+G)' }).click()
  await expect(surface.locator('.slide-group')).toHaveCount(1)
  await expect(elements).toHaveCount(3)

  await page.locator('body').press('Control+c')
  await page.locator('body').press('Control+v')
  await expect(surface.locator('.slide-group')).toHaveCount(2)
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/fase11-organizar.png' })

  // Desagrupar la copia devuelve sus dos rectángulos.
  await page.locator('body').press('Control+Shift+g')
  await expect(surface.locator('.slide-group')).toHaveCount(1)
  await expect(elements).toHaveCount(5)

  await page.getByRole('tab', { name: 'Diseño' }).click()
  await page.getByRole('button', { name: 'Desvanecer' }).click()

  const filePath = join(tintero.workDir, 'Organizar.tpres')
  await tintero.answerNextSaveDialog(filePath)
  await page.getByRole('button', { name: 'Guardar (Ctrl/Cmd+S)' }).click()
  await expect.poll(() => readFile(filePath, 'utf8').catch(() => '')).toContain('fade')
  const saved = JSON.parse(await readFile(filePath, 'utf8'))
  const types = saved.content.slides[0].elements.map((element: { type: string }) => element.type)
  expect(types).toEqual(['text', 'text', 'group', 'shape', 'shape'])
})

/** Fase 11: hojas reales en Texto, con encabezado y pie, y la misma paginación al exportar a PDF. */
test('Texto: el documento se reparte en hojas y el PDF tiene las mismas', async ({ tintero }) => {
  const { page } = tintero
  await createBlank(page, 'Texto')
  const editor = page.locator('.ProseMirror')
  await editor.click()
  for (let index = 1; index <= 70; index++) {
    await page.keyboard.insertText(`Párrafo ${index}: texto de relleno para llenar varias hojas de un documento largo.`)
    await page.keyboard.press('Enter')
  }

  const sheets = page.locator('.writer-sheet')
  await expect.poll(() => sheets.count()).toBeGreaterThanOrEqual(2)
  const sheetCount = await sheets.count()
  await expect(page.getByRole('contentinfo')).toContainText(`de ${sheetCount}`)

  // El primer bloque de la segunda hoja empieza justo debajo de su margen superior (2,5 cm).
  const firstOnPage2 = page.locator('.writer-page-start').first()
  const [sheetBox, blockBox] = await Promise.all([sheets.nth(1).boundingBox(), firstOnPage2.boundingBox()])
  expect(Math.abs(blockBox!.y - sheetBox!.y - (2.5 * 96) / 2.54)).toBeLessThan(2)

  await page.getByRole('tab', { name: 'Insertar' }).click()
  await page.getByRole('button', { name: 'Encabezado y pie de página' }).click()
  const panel = page.getByRole('complementary', { name: 'Encabezado y pie de página' })
  await panel.getByRole('textbox', { name: 'Encabezado' }).fill('Informe trimestral')
  await panel.getByRole('textbox', { name: 'Pie de página' }).fill('Página {página} de {páginas}')
  await expect(page.locator('.writer-sheet__footer').nth(1)).toHaveText(`Página 2 de ${sheetCount}`)
  await expect(page.locator('.writer-sheet__header').first()).toHaveText('Informe trimestral')
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/fase11-hojas.png' })

  const pdfPath = join(tintero.workDir, 'Hojas.pdf')
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
  const pdf = (await readFile(pdfPath)).toString('latin1')
  // Cada hoja es un objeto "/Type /Page" (sin la "s" de "/Pages", que es el índice).
  const pdfPages = pdf.match(/\/Type\s*\/Page(?!s)/g)?.length ?? 0
  expect(pdfPages).toBe(sheetCount)
  if (process.env.SCREENSHOTS) await copyFile(pdfPath, 'test-results/fase11-hojas.pdf')
})
