import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import JSZip from 'jszip'
import { createBlank, expect, test } from './support/tintero'

/** Fase 13: estilos de verdad (galería, modificar, nuevo), numeración de títulos y tabulaciones. */
test('Texto: modificar un estilo cambia todos sus párrafos y se guarda con el documento', async ({ tintero }) => {
  const { page } = tintero
  await createBlank(page, 'Texto')
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.insertText('Capítulo uno')
  await page.getByRole('button', { name: /Título 1$/ }).click()
  const heading = editor.locator('h1', { hasText: 'Capítulo uno' })
  await expect(heading).toBeVisible()
  /** Tamaño de letra en puntos (el navegador lo da en px: 96 px = 72 pt). */
  const fontSize = () =>
    heading.evaluate((element) => Math.round(((parseFloat(getComputedStyle(element).fontSize) * 72) / 96) * 10) / 10)
  expect(await fontSize()).toBe(16)

  // Clic derecho en la galería > Modificar: el tamaño cambia en el título sin tocar el texto.
  await page.getByRole('button', { name: /Título 1$/ }).click({ button: 'right' })
  await page.getByRole('button', { name: 'Modificar…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Modificar estilo' })
  const size = dialog.getByLabel('Tamaño (pt)')
  await size.fill('20')
  await dialog.getByRole('button', { name: 'Aceptar' }).click()
  await expect.poll(fontSize).toBe(20)

  // Numerar los títulos: la numeración la pone el CSS, el texto no cambia.
  await page.getByRole('button', { name: 'Lista multinivel' }).click()
  await page.getByRole('button', { name: /Numerar los títulos/ }).click()
  await expect
    .poll(() => heading.evaluate((element) => getComputedStyle(element, '::before').content))
    .toContain('counter')
  await expect(heading).toHaveText('Capítulo uno')

  // Nuevo estilo a partir del párrafo: se aplica y sale en la galería.
  await editor.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('Nota importante')
  await page.getByRole('button', { name: /Título 1$/ }).click({ button: 'right' })
  await page.getByRole('button', { name: 'Nuevo estilo…' }).click()
  const create = page.getByRole('dialog', { name: 'Nuevo estilo' })
  await create.getByLabel('Nombre del estilo').fill('Nota')
  await create.getByLabel('Cursiva').check()
  await create.getByRole('button', { name: 'Aceptar' }).click()
  const note = editor.locator('p', { hasText: 'Nota importante' })
  await expect(note).toHaveAttribute('data-style', 'custom-nota')
  await expect.poll(() => note.evaluate((element) => getComputedStyle(element).fontStyle)).toBe('italic')
  await expect(page.getByRole('button', { name: /Nota$/ })).toBeVisible()

  // Tabulación derecha con relleno de puntos a 8 cm, como en un índice.
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('Introducción')
  await page.getByRole('tab', { name: 'Disposición' }).click()
  await page.getByRole('button', { name: 'Tabulaciones…' }).click()
  const tabs = page.getByRole('dialog', { name: 'Tabulaciones' })
  await tabs.getByLabel('Posición (cm)').fill('8')
  await tabs.getByLabel('Alineación del tope').selectOption('right')
  await tabs.getByLabel(/Relleno de puntos/).check()
  await tabs.getByRole('button', { name: 'Añadir tope' }).click()
  await tabs.getByRole('button', { name: 'Aceptar' }).click()
  await editor.locator('p', { hasText: 'Introducción' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Tab')
  await page.keyboard.insertText('5')
  // La regla enseña el tope del párrafo del cursor.
  await expect(page.getByRole('button', { name: 'Quitar el tope de 8 cm' })).toBeVisible()
  const tab = editor.locator('.writer-tab')
  await expect(tab).toHaveClass(/writer-tab--dotted/)
  // El "5" acaba justo en los 8 cm desde el margen izquierdo del texto.
  // El ancho de la tabulación se calcula en el siguiente fotograma: se espera a que lo tenga.
  await expect.poll(async () => (await tab.boundingBox())?.width ?? 0).toBeGreaterThan(50)
  const paragraphBox = await editor.locator('p', { hasText: 'Introducción' }).boundingBox()
  const tabBox = await tab.boundingBox()
  expect(tabBox!.x + tabBox!.width - paragraphBox!.x).toBeLessThan((8 * 96) / 2.54)

  const filePath = join(tintero.workDir, 'Estilos.tdoc')
  await tintero.answerNextSaveDialog(filePath)
  await page.getByRole('button', { name: 'Guardar (Ctrl/Cmd+S)' }).click()
  await expect.poll(() => readFile(filePath, 'utf8').catch(() => '')).toContain('custom-nota')
  const saved = JSON.parse(await readFile(filePath, 'utf8'))
  expect(saved.content.numberedHeadings).toBe(true)
  const styles = saved.content.styles as { id: string; props: Record<string, unknown> }[]
  expect(styles.find((style) => style.id === 'heading-1')?.props.fontSize).toBe(20)
  expect(styles.find((style) => style.id === 'custom-nota')?.props.italic).toBe(true)

  // .docx: los estilos van a styles.xml (Heading 1 con 20 pt = 40 medios puntos) y el tope a w:tabs.
  const docxPath = join(tintero.workDir, 'Estilos.docx')
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
  const zip = await JSZip.loadAsync(await readFile(docxPath))
  const stylesXml = await zip.file('word/styles.xml')!.async('string')
  expect(stylesXml).toMatch(/w:styleId="Heading1"[\s\S]*?<w:sz w:val="40"\/>/)
  expect(stylesXml).toContain('<w:name w:val="Nota"/>')
  const documentXml = await zip.file('word/document.xml')!.async('string')
  expect(documentXml).toContain('<w:pStyle w:val="customnota"/>')
  expect(documentXml).toMatch(/<w:tab w:val="right" w:pos="\d+" w:leader="dot"\/>/)
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/fase13-estilos.png' })
})
