import { resolve } from 'node:path'
import { expect, test, type Tintero } from './support/tintero'

/**
 * Fidelidad con Office (fase 10): abrir los archivos del corpus (fixtures/office) y comprobar en
 * pantalla lo que antes se perdía. Los detalles los cubren los tests unitarios del corpus.
 */
const corpus = (name: string) => resolve(__dirname, '../fixtures/office', name)

async function open(tintero: Tintero, fileName: string): Promise<void> {
  await tintero.answerNextOpenDialog(corpus(fileName))
  await tintero.page.getByRole('button', { name: 'Abrir otro…' }).click()
}

test('Fidelidad: un .docx conserva alineación, fuentes y comentarios', async ({ tintero }) => {
  const { page } = tintero
  await open(tintero, 'word-formato-directo.docx')

  const body = page.locator('.ProseMirror')
  await expect(body.getByText('Texto centrado')).toHaveCSS('text-align', 'center')
  await expect(body.getByText('Arial 16 rojo')).toHaveCSS('color', 'rgb(192, 57, 43)')
  await expect(body.locator('.writer-comment')).toHaveText('ventas')

  await page.getByRole('tab', { name: 'Insertar' }).click()
  await page.getByRole('button', { name: 'Ver comentarios (1)' }).click()
  const panel = page.getByRole('complementary', { name: 'Comentarios' })
  await expect(panel).toContainText('Ana')
  await expect(panel.getByRole('textbox')).toHaveValue('¿De dónde sale este dato?')
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/fidelidad-docx.png' })
})

test('Fidelidad: un .pptx trae su fondo, sus tablas y sus giros', async ({ tintero }) => {
  const { page } = tintero
  await open(tintero, 'powerpoint-tema.pptx')

  const surface = page.locator('.slides-stage .slide-surface')
  await expect(surface).toHaveCSS('background-color', 'rgb(31, 42, 68)')
  await expect(surface.locator('.slide-table')).toContainText('Café')
  const rotated = surface.locator('.slide-element').filter({ hasText: 'Girado' }).first()
  await expect(rotated).toHaveCSS('transform', /matrix/)

  // El tema importado aparece en la galería de Diseño, delante de los de Tintero.
  await page.getByRole('tab', { name: 'Diseño' }).click()
  await expect(page.locator('.theme-card').first()).toContainText('Importado')
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/fidelidad-pptx.png' })
})

test('Fidelidad: un .xlsx conserva fuentes, alto de filas y paneles', async ({ tintero }) => {
  const { page } = tintero
  await open(tintero, 'libreoffice-formato.xlsx')

  const grid = page.getByRole('grid', { name: 'Hoja Ventas' })
  await expect(grid.getByText('Ventas por mes')).toHaveCSS('font-family', /Georgia/)
  await expect(page.locator('.sheet-pane--top')).toContainText('Mes')
  // Ajustar texto: el texto largo se parte en líneas dentro de su celda.
  await expect(grid.locator('.sheet-cell--wrap').first()).toHaveCSS('white-space', 'normal')
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/fidelidad-xlsx.png' })
})
