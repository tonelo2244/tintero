import { createBlank, expect, test } from './support/tintero'

/** Fase 16: vínculos, marcadores, campos y símbolos. */
test('Texto: vínculo a un marcador, campos de página y un símbolo', async ({ tintero }) => {
  const { page } = tintero
  await createBlank(page, 'Texto')
  const editor = page.locator('.ProseMirror').first()
  await editor.click()
  await page.keyboard.insertText('conclusiones')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('Introducción')
  await page.keyboard.press('Control+Enter')
  await page.keyboard.insertText('Conclusiones')

  // Insertar > Marcador en la segunda hoja.
  await page.getByRole('tab', { name: 'Insertar' }).click()
  await page.getByRole('button', { name: 'Marcador' }).click()
  const bookmarkDialog = page.getByRole('dialog', { name: 'Marcador' })
  await bookmarkDialog.getByLabel('Nombre del marcador').fill('Conclusiones')
  await bookmarkDialog.getByRole('button', { name: 'Agregar' }).click()
  await expect(editor.locator('[data-bookmark="Conclusiones"]')).toBeAttached()

  // Ctrl+K sobre "conclusiones" de la primera hoja: vínculo al marcador.
  await editor.locator('p').first().selectText()
  await page.keyboard.press('Control+k')
  const linkDialog = page.getByRole('dialog', { name: 'Insertar vínculo' })
  await expect(linkDialog.getByLabel('Texto que se mostrará')).toHaveValue('conclusiones')
  await linkDialog.getByRole('radio', { name: 'Marcador de este documento' }).check()
  await linkDialog.getByRole('button', { name: 'Aceptar' }).click()
  const link = editor.locator('a[href="#Conclusiones"]')
  await expect(link).toHaveText('conclusiones')

  // Ctrl+clic lo sigue: el cursor salta a la hoja 2.
  await expect(page.getByRole('contentinfo')).toContainText('Página 1 de 2')
  await link.click({ modifiers: ['Control'] })
  await expect(page.getByRole('contentinfo')).toContainText('Página 2 de 2')

  // Campo "Número de página" en la hoja 2 y "Número de páginas" detrás: "2 de 2".
  await page.keyboard.press('End')
  await page.keyboard.insertText(' (página ')
  await page.getByRole('button', { name: 'Campo' }).click()
  await page.getByRole('button', { name: /^Número de página / }).click()
  await page.keyboard.insertText(' de ')
  await page.getByRole('button', { name: 'Campo' }).click()
  await page.getByRole('button', { name: /^Número de páginas/ }).click()
  await page.keyboard.insertText(')')
  await expect(editor.locator('p').last()).toHaveText('Conclusiones (página 2 de 2)')

  // Una hoja más por delante lo cambia solo: ahora es la hoja 3 de 3.
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('End')
  await page.keyboard.press('Control+Enter')
  await expect(editor.locator('p', { hasText: 'Conclusiones (' })).toHaveText('Conclusiones (página 3 de 3)')

  // Símbolo: el menú y el cuadro con búsqueda.
  await page.getByRole('button', { name: 'Símbolo' }).click()
  await page.getByRole('button', { name: 'Símbolo euro' }).click()
  await page.getByRole('button', { name: 'Símbolo' }).click()
  await page.getByRole('button', { name: 'Más símbolos…' }).click()
  const symbols = page.getByRole('dialog', { name: 'Símbolo' })
  await symbols.getByLabel('Buscar símbolo').fill('raiz')
  await symbols.getByRole('button', { name: 'Símbolo raíz cuadrada' }).click()
  await expect(editor).toContainText('€√')
})
