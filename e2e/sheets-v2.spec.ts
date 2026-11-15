import { createBlank, expect, test } from './support/tintero'

/**
 * Hojas de cálculo v2 (fase 9): lo que solo se comprueba de verdad con la cuadrícula en pantalla.
 * La lógica (reescribir fórmulas, ordenar, filtrar…) la cubren los tests unitarios.
 */
async function typeCells(page: import('@playwright/test').Page, rows: string[][]): Promise<void> {
  for (const row of rows) {
    for (const [index, value] of row.entries()) {
      await page.keyboard.type(value)
      await page.keyboard.press(index === row.length - 1 ? 'Enter' : 'Tab')
    }
    // Enter tras Tab vuelve a la columna de partida, como en Excel… aquí basta con ir a la A.
    await page.keyboard.press('Home')
  }
}

test('Hojas v2: insertar una fila mueve los datos y la fórmula sigue sumando lo mismo', async ({ tintero }) => {
  const { page } = tintero
  await createBlank(page, 'Hojas de cálculo')
  const grid = page.getByRole('grid', { name: 'Hoja Hoja1' })
  await grid.focus()
  await typeCells(page, [['10'], ['20'], ['=SUMA(A1:A2)']])

  // Fila 2 seleccionada -> Insertar filas encima.
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('ArrowDown')
  await page.getByRole('button', { name: 'Insertar' }).click()
  await page.getByRole('button', { name: 'Insertar filas encima' }).click()

  // La selección se queda en la fila nueva (A2); la fórmula ha bajado a A4.
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('textbox', { name: 'Contenido de la celda' })).toHaveValue('=SUMA(A1:A3)')
  await expect(grid).toContainText('30')
})

test('Hojas v2: inmovilizar la fila superior y combinar celdas', async ({ tintero }) => {
  const { page } = tintero
  await createBlank(page, 'Hojas de cálculo')
  const grid = page.getByRole('grid', { name: 'Hoja Hoja1' })
  await grid.focus()
  await typeCells(page, [['Título largo de la tabla'], ['1'], ['2']])

  await page.keyboard.press('Control+Home')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await page.getByRole('button', { name: 'Combinar y centrar' }).click()
  await expect(page.getByRole('button', { name: 'Separar celdas' })).toBeVisible()

  await page.getByRole('tab', { name: 'Vista' }).click()
  await page.getByRole('button', { name: 'Inmovilizar fila superior' }).click()

  // Al desplazar hacia abajo, la fila 1 sigue a la vista.
  await grid.evaluate((element) => (element.scrollTop = 2000))
  await expect(page.locator('.sheet-pane--top')).toContainText('Título largo de la tabla')
  const box = await page.locator('.sheet-pane--top').boundingBox()
  const gridBox = await grid.boundingBox()
  expect(Math.round(box!.y - gridBox!.y)).toBe(22)
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/hojas-v2-paneles.png' })
})

test('Hojas v2: filtrar oculta filas, ordenar las reordena y buscar salta a la celda', async ({ tintero }) => {
  const { page } = tintero
  await createBlank(page, 'Hojas de cálculo')
  const grid = page.getByRole('grid', { name: 'Hoja Hoja1' })
  await grid.focus()
  await typeCells(page, [['Zona'], ['Sur'], ['Norte'], ['Este'], ['Sur']])
  await page.keyboard.press('Control+Home')

  await page.getByRole('tab', { name: 'Datos' }).click()
  await page.getByRole('button', { name: 'Filtro', exact: true }).click()
  await page.getByRole('button', { name: 'Filtrar la columna A' }).click()
  const menu = page.getByRole('dialog', { name: 'Filtro de Zona' })
  await menu.getByLabel('Sur').uncheck()
  await menu.getByRole('button', { name: 'Aceptar' }).click()
  await expect(page.locator('.sheet-header--row', { hasText: /^2$/ })).toHaveCount(0)
  await expect(grid).not.toContainText('Sur')

  await page.getByRole('button', { name: 'Borrar filtros' }).click()
  await page.getByRole('button', { name: 'Ordenar de A a Z' }).click()
  // Con la cabecera quieta: Este, Norte, Sur, Sur.
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('textbox', { name: 'Contenido de la celda' })).toHaveValue('Este')

  await page.keyboard.press('Control+f')
  await page.getByRole('textbox', { name: 'Buscar', exact: true }).fill('norte')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Contenido de la celda' })).toHaveValue('Norte')
  await page.getByRole('button', { name: 'Mostrar reemplazar' }).click()
  await page.getByRole('textbox', { name: 'Reemplazar con' }).fill('Oeste')
  await page.getByRole('button', { name: 'Todo' }).click()
  await expect(grid).toContainText('Oeste')
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/hojas-v2-datos.png' })
})
