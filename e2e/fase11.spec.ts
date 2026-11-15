import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createBlank, expect, test } from './support/tintero'

/** Fase 11: organizar elementos en Diapositivas y transiciones. */
test('Diapositivas: duplicar, seleccionar varios, agrupar, copiar y pegar', async ({ tintero }) => {
  const { page } = tintero
  await createBlank(page, 'Diapositivas')
  const surface = page.locator('.slides-stage .slide-surface')
  // Los dos primeros son los marcadores de título y subtítulo del diseño.
  const elements = surface.locator(':scope > .slide-element')
  await expect(elements).toHaveCount(2)

  await page.getByRole('button', { name: 'Formas' }).first().click()
  await page.getByRole('button', { name: 'Rectángulo', exact: true }).click()
  await expect(elements).toHaveCount(3)

  // Ctrl+D duplica (un poco desplazado) y deja seleccionada la copia.
  await page.locator('body').press('Control+d')
  await expect(elements).toHaveCount(4)

  // Mayús + clic en la esquina que la copia no tapa: ahora hay dos seleccionados.
  await elements.nth(2).click({ position: { x: 3, y: 3 }, modifiers: ['Shift'] })
  await expect(surface.locator('.slide-element.is-selected')).toHaveCount(2)
  // Con varios seleccionados no hay tiradores de tamaño (solo se organizan).
  await expect(surface.locator('.resize-handle')).toHaveCount(0)

  await page.getByRole('button', { name: 'Organizar' }).click()
  await page.getByRole('button', { name: 'Alinear objetos arriba' }).click()
  await page.getByRole('button', { name: 'Organizar' }).click()
  await page.getByRole('button', { name: 'Agrupar (Ctrl+G)' }).click()
  await expect(surface.locator('.slide-group')).toHaveCount(1)
  await expect(elements).toHaveCount(3)

  await page.locator('body').press('Control+c')
  await page.locator('body').press('Control+v')
  await expect(surface.locator('.slide-group')).toHaveCount(2)
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/fase11-organizar.png' })

  // Desagrupar la copia devuelve sus dos rectángulos.
  await page.locator('body').press('Control+Shift+g')
  await expect(surface.locator('.slide-group')).toHaveCount(1)
  await expect(elements).toHaveCount(5)

  await page.getByRole('tab', { name: 'Diseño' }).click()
  await page.getByRole('button', { name: 'Desvanecer' }).click()

  const filePath = join(tintero.workDir, 'Organizar.tpres')
  await tintero.answerNextSaveDialog(filePath)
  await page.getByRole('button', { name: 'Guardar (Ctrl/Cmd+S)' }).click()
  await expect.poll(() => readFile(filePath, 'utf8').catch(() => '')).toContain('fade')
  const saved = JSON.parse(await readFile(filePath, 'utf8'))
  const types = saved.content.slides[0].elements.map((element: { type: string }) => element.type)
  expect(types).toEqual(['text', 'text', 'group', 'shape', 'shape'])
})
