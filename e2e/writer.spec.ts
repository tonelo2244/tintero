import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createBlank, expect, test } from './support/tintero'

test('Texto: crear, guardar y volver a abrir desde Recientes', async ({ tintero }) => {
  const { page } = tintero
  await createBlank(page, 'Texto')

  await page.locator('.ProseMirror').click()
  await page.keyboard.type('Hola desde una prueba e2e')

  const filePath = join(tintero.workDir, 'Notas.tdoc')
  await tintero.answerNextSaveDialog(filePath)
  await page.getByRole('button', { name: 'Guardar (Ctrl/Cmd+S)' }).click()

  // El título pasa a ser el nombre del archivo y desaparece la marca de "sin guardar".
  await expect(page.getByRole('banner')).toContainText('Notas')
  await expect(page.getByTitle('Cambios sin guardar')).toHaveCount(0)

  const saved = JSON.parse(await readFile(filePath, 'utf8'))
  expect(saved).toMatchObject({ format: 'tintero', appId: 'writer' })
  expect(JSON.stringify(saved.content)).toContain('Hola desde una prueba e2e')

  await page.getByRole('button', { name: 'Inicio', exact: true }).click()
  await page.getByTitle(filePath).click()
  await expect(page.locator('.ProseMirror')).toContainText('Hola desde una prueba e2e')
})

test('Texto: exportar a .docx', async ({ tintero }) => {
  const { page } = tintero
  await createBlank(page, 'Texto')
  await page.locator('.ProseMirror').click()
  await page.keyboard.type('Contenido para Word')

  const filePath = join(tintero.workDir, 'Para Word.docx')
  await tintero.answerNextSaveDialog(filePath)
  await page.getByRole('button', { name: 'Exportar' }).click()
  await page.getByRole('menuitem', { name: 'Documento de Word (.docx)' }).click()

  // Un .docx es un ZIP: empieza por "PK".
  await expect
    .poll(() =>
      readFile(filePath).then(
        (bytes) => bytes.subarray(0, 2).toString(),
        () => ''
      )
    )
    .toBe('PK')
})
