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
  // (Se selecciona "Introducción" y se va a su principio. Las esperas cortas dejan que ProseMirror
  // lea la selección del navegador: sin ellas, a veces la tecla llega antes y el salto cae en otro sitio.)
  await editor.locator('p', { hasText: 'Introducción' }).selectText()
  await page.waitForTimeout(100)
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(100)
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

test('Texto: formas, cuadro de texto y gráfico con su pestaña contextual', async ({ tintero }) => {
  const { page } = tintero
  await createBlank(page, 'Texto')
  const editor = page.locator('.ProseMirror').first()
  await editor.click()
  await page.keyboard.insertText('Un párrafo con objetos alrededor.')

  // Forma: aparece seleccionada con la pestaña "Forma"; Ajustar texto > Detrás del texto.
  await page.getByRole('tab', { name: 'Insertar' }).click()
  await page.getByRole('button', { name: 'Formas' }).click()
  await page.getByRole('button', { name: 'Elipse' }).click()
  const shape = editor.locator('.writer-object[data-type="shape"]')
  await expect(shape).toHaveClass(/is-selected/)
  await expect(page.getByRole('tab', { name: 'Forma' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: 'Ajustar texto' }).click()
  await page.getByRole('button', { name: 'Detrás del texto' }).click()
  await expect(shape).toHaveAttribute('data-wrap', 'behind')

  // Gráfico: se abre la tabla de datos; cambiamos una serie y el tipo.
  await editor.locator('p').first().click()
  await page.getByRole('tab', { name: 'Insertar' }).click()
  await page.getByRole('button', { name: 'Gráfico' }).click()
  const dialog = page.getByRole('dialog', { name: 'Datos del gráfico' })
  await dialog.getByLabel('Serie 1').fill('Ventas')
  await dialog.getByLabel('Tipo').selectOption('line')
  await dialog.getByLabel('Título').fill('Resultados')
  await dialog.getByRole('button', { name: 'Aceptar' }).click()
  const chart = editor.locator('.writer-object[data-type="chart"]')
  await expect(chart.locator('svg')).toHaveAttribute('aria-label', 'Gráfico: Resultados')
  await expect(chart.locator('svg')).toContainText('Ventas')
  await expect(page.getByRole('tab', { name: 'Gráfico' })).toHaveAttribute('aria-selected', 'true')

  // Cuadro de texto: se escribe dentro.
  await editor.locator('p').first().click()
  await page.getByRole('tab', { name: 'Insertar' }).click()
  await page.getByRole('button', { name: 'Cuadro de texto' }).click()
  // Se escribe cuando el cuadro ya tiene el cursor (su marco lo indica con "is-editing").
  await expect(editor.locator('.writer-object[data-type="textBox"]')).toHaveClass(/is-editing/)
  // Tiptap devuelve el foco al editor en el siguiente fotograma: hasta entonces lo tiene el botón.
  await expect(editor).toBeFocused()
  await page.keyboard.insertText('Nota al margen')
  await expect(editor.locator('.writer-object[data-type="textBox"]')).toContainText('Nota al margen')
})

test('Texto: convertir texto en tabla y darle estilo, sombreado y bordes', async ({ tintero }) => {
  const { page } = tintero
  await createBlank(page, 'Texto')
  const editor = page.locator('.ProseMirror').first()
  await editor.click()
  await page.keyboard.insertText('Zona; Ventas')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('Norte; 12')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('Sur; 8')
  await page.keyboard.press('Control+a')

  await page.getByRole('tab', { name: 'Insertar' }).click()
  await page.getByRole('button', { name: 'Convertir texto en tabla' }).click()
  const table = editor.locator('table')
  await expect(table.locator('tr')).toHaveCount(3)
  await expect(table.locator('tr').nth(1).locator('td').nth(1)).toHaveText('12')

  // Pestaña Tabla: estilo con bandas y la primera celda con borde inferior.
  await table.locator('td').first().click()
  await page.getByRole('tab', { name: 'Tabla' }).click()
  await page.getByRole('button', { name: 'Estilos' }).click()
  await page.getByRole('button', { name: 'Filas en bandas' }).click()
  await expect(table).toHaveAttribute('data-table-style', 'banded')
  await page.getByRole('button', { name: 'Bordes' }).click()
  await page.getByRole('button', { name: 'Todos los bordes' }).click()
  await expect(table.locator('td').first()).toHaveAttribute('data-borders', 'top right bottom left')
  await expect(table.locator('td').first()).toHaveCSS('border-left-style', 'solid')
  await expect(table.locator('tr').nth(1).locator('td').first()).toHaveCSS('background-color', 'rgb(242, 242, 242)')
  await page.screenshot({ path: 'test-results/fase16-tabla.png' })
})

test('Texto: ecuación con vista previa, y se edita con doble clic', async ({ tintero }) => {
  const { page } = tintero
  await createBlank(page, 'Texto')
  const editor = page.locator('.ProseMirror').first()
  await editor.click()
  await page.keyboard.insertText('Las raíces son ')

  await page.keyboard.press('Alt+=')
  const dialog = page.getByRole('dialog', { name: 'Insertar ecuación' })
  await dialog.getByLabel('Ecuación en LaTeX').fill('x^2')
  await dialog.getByRole('button', { name: 'Raíz' }).click()
  await expect(dialog.getByLabel('Ecuación en LaTeX')).toHaveValue('x^2\\sqrt{x}')
  await expect(dialog.getByLabel('Vista previa').locator('.katex')).toBeVisible()
  await dialog.getByRole('button', { name: 'Insertar' }).click()
  const equation = editor.locator('.writer-equation')
  await expect(equation).toHaveAttribute('data-latex', 'x^2\\sqrt{x}')
  await expect(equation.locator('.katex .sqrt')).toBeAttached()

  await equation.dblclick()
  const edit = page.getByRole('dialog', { name: 'Editar ecuación' })
  await edit.getByLabel('Ejemplos').selectOption({ label: 'Teorema de Pitágoras' })
  await edit.getByRole('button', { name: 'Aceptar' }).click()
  await expect(editor.locator('.writer-equation')).toHaveCount(1)
  await expect(editor.locator('.writer-equation')).toHaveAttribute('data-latex', 'a^2 + b^2 = c^2')
  await page.screenshot({ path: 'test-results/fase16-ecuacion.png' })
})
