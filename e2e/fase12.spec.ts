import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import JSZip from 'jszip'
import { createBlank, expect, test } from './support/tintero'

/** Fase 12: configuración de página, salto de página y regla, de la cinta al PDF y al .docx. */
test('Texto: página horizontal con márgenes estrechos, salto de página y sangría con la regla', async ({ tintero }) => {
  const { page } = tintero
  await createBlank(page, 'Texto')
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.insertText('Primera hoja')

  // Ctrl+Intro: el atajo del comando "Salto de página" (el mismo que el botón de la cinta).
  await page.keyboard.press('Control+Enter')
  await page.keyboard.insertText('Segunda hoja')
  const sheets = page.locator('.writer-sheet')
  await expect(sheets).toHaveCount(2)
  await expect(page.getByRole('contentinfo')).toContainText('de 2')

  await page.getByRole('tab', { name: 'Disposición' }).click()
  await page.getByRole('button', { name: 'Orientación' }).click()
  await page.getByRole('button', { name: 'Horizontal' }).click()
  const sheet = await sheets.first().boundingBox()
  expect(sheet!.width).toBeGreaterThan(sheet!.height)

  await page.getByRole('button', { name: 'Márgenes', exact: true }).click()
  await page.getByRole('button', { name: /^Estrecho/ }).click()

  // La regla: con el cursor en el segundo párrafo, cuatro pasos de 0,25 cm a la derecha = 1 cm.
  await editor.getByText('Segunda hoja').click()
  const leftIndent = page.getByRole('slider', { name: 'Sangría izquierda' })
  await leftIndent.focus()
  for (let step = 0; step < 4; step++) await leftIndent.press('ArrowRight')
  await expect(leftIndent).toHaveAttribute('aria-valuenow', '1')
  await expect(editor.locator('p', { hasText: 'Segunda hoja' })).toHaveAttribute('style', /margin-left: 1cm/)
  // El primer bloque de la segunda hoja empieza justo debajo de su margen superior (1,27 cm).
  const secondSheet = await sheets.nth(1).boundingBox()
  const secondPage = await page.locator('.writer-page-start').first().boundingBox()
  expect(Math.abs(secondPage!.y - secondSheet!.y - (1.27 * 96) / 2.54)).toBeLessThan(2)

  const filePath = join(tintero.workDir, 'Disposicion.tdoc')
  await tintero.answerNextSaveDialog(filePath)
  await page.getByRole('button', { name: 'Guardar (Ctrl/Cmd+S)' }).click()
  await expect.poll(() => readFile(filePath, 'utf8').catch(() => '')).toContain('landscape')
  const saved = JSON.parse(await readFile(filePath, 'utf8'))
  expect(saved.version).toBe(4)
  expect(saved.content.pageSetup).toMatchObject({ orientation: 'landscape', margins: { top: 1.27, left: 1.27 } })
  expect(saved.content.doc.content.map((node: { type: string }) => node.type)).toEqual([
    'paragraph',
    'pageBreak',
    'paragraph'
  ])

  // PDF: dos hojas apaisadas (A4 horizontal = 842 x 595 puntos).
  const pdfPath = join(tintero.workDir, 'Disposicion.pdf')
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
  expect(pdf.match(/\/Type\s*\/Page(?!s)/g)?.length).toBe(2)
  const mediaBox = /\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/.exec(pdf)
  expect(Number(mediaBox![1])).toBeGreaterThan(Number(mediaBox![2]))

  // .docx: la misma página en w:sectPr y el salto como w:br de tipo página.
  const docxPath = join(tintero.workDir, 'Disposicion.docx')
  await tintero.answerNextSaveDialog(docxPath)
  await page.getByRole('button', { name: 'Exportar' }).click()
  await page.getByRole('menuitem', { name: 'Documento de Word (.docx)' }).click()
  await expect
    .poll(() =>
      readFile(docxPath).then(
        (bytes) => bytes.length,
        () => 0
      )
    )
    .toBeGreaterThan(0)
  const xml = await (await JSZip.loadAsync(await readFile(docxPath))).file('word/document.xml')!.async('string')
  expect(xml).toContain('w:orient="landscape"')
  expect(xml).toContain('<w:br w:type="page"/>')
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/fase12-disposicion.png' })
})
