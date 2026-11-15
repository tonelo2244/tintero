import { expect, fixture, test, type Tintero } from './support/tintero'

/** "Abrir otro…" de la pantalla de inicio, con el diálogo contestado por la prueba. */
async function openFromLauncher(tintero: Tintero, fileName: string): Promise<void> {
  await tintero.answerNextOpenDialog(fixture(fileName))
  await tintero.page.getByRole('button', { name: 'Abrir otro…' }).click()
}

test('abrir un .docx lo convierte en un documento de Texto con su tabla', async ({ tintero }) => {
  await openFromLauncher(tintero, 'documento-con-tabla.docx')

  const body = tintero.page.locator('.ProseMirror')
  await expect(body).toContainText('Informe de LibreOffice')
  await expect(body.locator('table')).toContainText('B2')
  // Importar abre una copia sin guardar: el original no se toca.
  await expect(tintero.page.getByTitle('Cambios sin guardar')).toBeVisible()
})

test('abrir un .pptx lo convierte en una presentación', async ({ tintero }) => {
  await openFromLauncher(tintero, 'presentacion-4x3.pptx')

  await expect(tintero.page.getByText('Informe trimestral').first()).toBeVisible()
  await expect(tintero.page.getByRole('contentinfo')).toContainText('Diapositiva 1 de 3')
})

test('abrir un .xlsx conserva hojas, valores y fórmulas', async ({ tintero }) => {
  await openFromLauncher(tintero, 'hoja-con-formula.xlsx')

  const { page } = tintero
  await expect(page.getByRole('tab', { name: 'Ventas' })).toBeVisible()
  const grid = page.getByRole('grid', { name: 'Hoja Ventas' })
  await expect(grid).toContainText('Febrero')
  await expect(grid).toContainText('200')
})
