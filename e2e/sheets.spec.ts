import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { createBlank, expect, test } from './support/tintero'

test('Hojas de cálculo: una fórmula en español se calcula, se guarda y se exporta a .xlsx', async ({ tintero }) => {
  const { page } = tintero
  await createBlank(page, 'Hojas de cálculo')

  const grid = page.getByRole('grid', { name: 'Hoja Hoja1' })
  await grid.focus()
  await page.keyboard.type('2')
  await page.keyboard.press('Enter')
  await page.keyboard.type('3')
  await page.keyboard.press('Enter')
  await page.keyboard.type('=SUMA(A1:A2)')
  await page.keyboard.press('Enter')

  // Volver a A3: la celda muestra el resultado y la barra de fórmulas, la fórmula en español.
  await page.keyboard.press('ArrowUp')
  await expect(page.getByRole('textbox', { name: 'Contenido de la celda' })).toHaveValue('=SUMA(A1:A2)')
  await expect(grid).toContainText('5')

  const sheetPath = join(tintero.workDir, 'Cuentas.tsheet')
  await tintero.answerNextSaveDialog(sheetPath)
  await page.getByRole('button', { name: 'Guardar (Ctrl/Cmd+S)' }).click()
  // En el archivo la fórmula va en forma canónica (inglés y ","), como hace Excel por dentro.
  await expect.poll(() => readFile(sheetPath, 'utf8').catch(() => '')).toContain('SUM(A1:A2)')

  const xlsxPath = join(tintero.workDir, 'Cuentas.xlsx')
  await tintero.answerNextSaveDialog(xlsxPath)
  await page.getByRole('button', { name: 'Exportar' }).click()
  await page.getByRole('menuitem', { name: /\.xlsx/ }).click()

  await expect
    .poll(() =>
      readFile(xlsxPath).then(
        (bytes) => bytes.length,
        () => 0
      )
    )
    .toBeGreaterThan(0)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(xlsxPath)
  const cell = workbook.worksheets[0].getCell('A3')
  expect(cell.formula).toBe('SUM(A1:A2)')
  expect(cell.result).toBe(5)
})
