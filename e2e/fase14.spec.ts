import { createBlank, expect, test } from './support/tintero'

/** Fase 14: vistas, panel de navegación, zoom por página, contar palabras, dividir y leer en voz alta. */
test('Texto: navegar un documento largo con el panel, las vistas y el esquema', async ({ tintero }) => {
  const { page } = tintero
  await createBlank(page, 'Texto')
  const editor = page.locator('.ProseMirror').first()
  await editor.click()

  // Un documento con dos capítulos y un salto de página entre ellos.
  const heading = (level: 1 | 2) => page.getByRole('button', { name: new RegExp(`Título ${level}$`) })
  await page.keyboard.insertText('Capítulo uno')
  await heading(1).click()
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('Texto del primer capítulo. Tiene dos frases.')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('Detalles')
  await heading(2).click()
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('Más texto.')
  await page.keyboard.press('Control+Enter')
  await page.keyboard.insertText('Capítulo dos')
  await heading(1).click()
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('Final.')
  // El salto de página queda en su sitio (antes se quedaba seleccionado y lo borraba lo que escribías).
  await expect(page.locator('.writer-sheet')).toHaveCount(2)
  await expect(page.getByRole('contentinfo')).toContainText('Página 2 de 2')

  // Vista > Panel de navegación: el árbol de títulos y las miniaturas de las dos hojas.
  await page.getByRole('tab', { name: 'Vista' }).click()
  await page.getByRole('button', { name: 'Panel de navegación' }).click()
  const navigation = page.getByRole('complementary', { name: 'Navegación' })
  const navHeading = (name: string) => navigation.getByRole('button', { name, exact: true })
  await expect(navHeading('Capítulo uno')).toBeVisible()
  await expect(navHeading('Detalles')).toBeVisible()
  await navHeading('Capítulo uno').click()
  await expect(navigation.locator('[aria-current="location"]')).toHaveText('Capítulo uno')
  await expect(page.getByRole('contentinfo')).toContainText('Página 1 de 2')
  await navigation.getByRole('tab', { name: 'Páginas' }).click()
  await expect(navigation.getByRole('button', { name: /Ir a la página/ })).toHaveCount(2)
  await navigation.getByRole('button', { name: 'Ir a la página 2' }).click()
  await expect(page.getByRole('contentinfo')).toContainText('Página 2 de 2')
  await navigation.getByRole('tab', { name: 'Títulos' }).click()

  // Arrastrar "Capítulo dos" encima de "Capítulo uno" mueve la sección entera.
  await navHeading('Capítulo dos').dragTo(navHeading('Capítulo uno'), { targetPosition: { x: 10, y: 2 } })
  await expect(editor.locator('h1').first()).toHaveText('Capítulo dos')
  await page.keyboard.press('Control+z')
  await expect(editor.locator('h1').first()).toHaveText('Capítulo uno')
  // Deshacer quita solo el movimiento, no lo último que se escribió.
  await expect(editor).toContainText('Final.')

  // Zoom: una página entera a la vista, y vuelta al 100 %.
  await page.getByRole('button', { name: 'Una página' }).click()
  await expect(page.getByRole('contentinfo')).not.toContainText('100 %')
  const sheet = await page.locator('.writer-sheet').first().boundingBox()
  const canvas = await page.locator('.writer-canvas').boundingBox()
  expect(sheet!.height).toBeLessThanOrEqual(canvas!.height)
  await page.getByRole('button', { name: '100 %' }).click()
  await expect(page.getByRole('contentinfo')).toContainText('100 %')

  // Borrador: sin hojas, el texto seguido.
  await page.getByRole('button', { name: 'Borrador' }).first().click()
  await expect(page.locator('.writer-sheet')).toHaveCount(0)
  await expect(page.getByRole('contentinfo')).not.toContainText('Página')

  // Esquema: aparece su pestaña; plegar "Capítulo uno" esconde lo de debajo; subir de nivel.
  await page.getByRole('button', { name: 'Esquema' }).click()
  await expect(page.getByRole('tab', { name: 'Esquema' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: 'Plegar sección' }).first().click()
  await expect(editor.getByText('Más texto.')).toBeHidden()
  await page.getByRole('button', { name: 'Expandir todo' }).click()
  await expect(editor.getByText('Más texto.')).toBeVisible()
  await editor.getByText('Detalles').click()
  await page.getByRole('button', { name: 'Subir nivel' }).click()
  await expect(editor.locator('h1', { hasText: 'Detalles' })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar vista Esquema' }).click()
  await expect(page.getByRole('tab', { name: 'Esquema' })).toHaveCount(0)
  await expect(page.locator('.writer-sheet')).toHaveCount(2)

  // Revisar > Contar palabras.
  await page.getByRole('tab', { name: 'Revisar' }).click()
  await page.getByRole('button', { name: 'Contar palabras' }).click()
  const count = page.getByRole('dialog', { name: 'Contar palabras' })
  await expect(count).toContainText('Páginas2')
  await expect(count).toContainText('Palabras15')
  await expect(count).toContainText('Párrafos6')
  await count.getByRole('button', { name: 'Cerrar' }).first().click()

  // Leer en voz alta abre sus mandos (sin voces en la máquina de pruebas no suena nada).
  await page.getByRole('button', { name: 'Leer en voz alta' }).click()
  await expect(page.getByRole('toolbar', { name: 'Leer en voz alta' })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar lectura en voz alta' }).click()

  // Dividir: lo que se escribe en la segunda vista llega al documento (y se deshace desde él).
  await page.getByRole('tab', { name: 'Vista' }).click()
  await page.getByRole('button', { name: 'Dividir' }).click()
  const second = page.getByRole('region', { name: 'Segunda vista del documento' }).locator('.ProseMirror')
  await expect(second).toContainText('Capítulo dos')
  await second.getByText('Final.').click()
  await page.keyboard.press('End')
  await page.keyboard.insertText(' Escrito abajo.')
  await expect(editor).toContainText('Final. Escrito abajo.')
  await editor.getByText('Capítulo uno').click()
  await page.keyboard.press('End')
  await page.keyboard.insertText('!')
  await expect(second).toContainText('Capítulo uno!')

  // Modo lectura: sin cinta y sin poder escribir; Esc vuelve.
  await page.getByRole('button', { name: 'Modo lectura' }).first().click()
  await expect(page.getByRole('toolbar', { name: 'Modo lectura' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Inicio' })).toBeHidden()
  await expect(editor).toHaveAttribute('contenteditable', 'false')
  await page.getByRole('radio', { name: 'Oscuro' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tab', { name: 'Inicio' })).toBeVisible()
  await expect(editor).toHaveAttribute('contenteditable', 'true')
})
